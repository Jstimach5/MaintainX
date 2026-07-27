import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  assets,
  locations,
  meterReadings,
  meterTriggerEvents,
  meterTriggers,
  meters,
  workOrders,
} from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/session";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";
import { createWorkOrder } from "./workOrders";
import { attachProcedure, getTemplate } from "./procedures";

export type MeterRow = typeof meters.$inferSelect;
export type TriggerRow = typeof meterTriggers.$inferSelect;

const num = (v: string | null): number | null => (v == null ? null : Number(v));

export async function getMeter(id: number): Promise<MeterRow | null> {
  const rows = await db.select().from(meters).where(eq(meters.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listMeters() {
  return db
    .select({
      meter: meters,
      assetName: assets.name,
      assetNumber: assets.assetNumber,
      locationName: locations.name,
    })
    .from(meters)
    .leftJoin(assets, eq(meters.assetId, assets.id))
    .leftJoin(locations, eq(meters.locationId, locations.id))
    .orderBy(asc(meters.name));
}

export type MeterInput = {
  name: string;
  description?: string | null;
  unit: string;
  assetId?: number | null;
  locationId?: number | null;
  mustIncrease: boolean;
  warnThreshold?: number | null;
  criticalThreshold?: number | null;
  isActive?: boolean;
};

async function validateMeter(input: MeterInput) {
  if (input.assetId == null && input.locationId == null) {
    throw new ServiceError("Attach the meter to an asset or a location.");
  }
  if (input.assetId != null) {
    const rows = await db
      .select()
      .from(assets)
      .where(eq(assets.id, input.assetId))
      .limit(1);
    if (rows.length === 0) throw new ServiceError("Asset not found.");
    if (rows[0].archivedAt) throw new ServiceError("That asset is archived.");
  }
}

export async function createMeter(
  actorId: number,
  input: MeterInput,
): Promise<number> {
  await validateMeter(input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(meters)
      .values({
        name: input.name,
        description: input.description || null,
        unit: input.unit,
        assetId: input.assetId ?? null,
        locationId: input.locationId ?? null,
        mustIncrease: input.mustIncrease,
        warnThreshold: input.warnThreshold?.toString() ?? null,
        criticalThreshold: input.criticalThreshold?.toString() ?? null,
        createdBy: actorId,
      })
      .returning({ id: meters.id });
    await recordAudit(tx, {
      userId: actorId,
      action: "meter.create",
      entityType: "meter",
      entityId: row.id,
      summary: `Created meter "${input.name}" (${input.unit})`,
    });
    return row.id;
  });
}

export async function updateMeter(
  actorId: number,
  meterId: number,
  input: MeterInput,
): Promise<void> {
  const existing = await getMeter(meterId);
  if (!existing) throw new ServiceError("Meter not found.");
  await validateMeter(input);
  await db.transaction(async (tx) => {
    await tx
      .update(meters)
      .set({
        name: input.name,
        description: input.description || null,
        unit: input.unit,
        assetId: input.assetId ?? null,
        locationId: input.locationId ?? null,
        mustIncrease: input.mustIncrease,
        warnThreshold: input.warnThreshold?.toString() ?? null,
        criticalThreshold: input.criticalThreshold?.toString() ?? null,
        isActive: input.isActive ?? existing.isActive,
      })
      .where(eq(meters.id, meterId));
    await recordAudit(tx, {
      userId: actorId,
      action: "meter.update",
      entityType: "meter",
      entityId: meterId,
      summary: `Updated meter "${input.name}"`,
    });
  });
}

/**
 * Record a reading (§10). Validation: monotonic meters reject decreases
 * unless explicitly acknowledged as a rollover; absurd magnitudes rejected.
 * Trigger evaluation runs synchronously in the same call — the future IoT
 * adapter feeds the same function.
 */
export async function addReading(
  actor: SessionUser,
  meterId: number,
  input: { value: number; note?: string | null; isRollover?: boolean },
): Promise<{ readingId: number; firedWorkOrderIds: number[] }> {
  const meter = await getMeter(meterId);
  if (!meter || !meter.isActive) throw new ServiceError("Meter not found.");
  if (!Number.isFinite(input.value)) throw new ServiceError("Enter a number.");
  if (Math.abs(input.value) > 1e10) {
    throw new ServiceError("That value looks impossible — check the entry.");
  }
  const last = num(meter.currentValue);
  if (
    meter.mustIncrease &&
    last != null &&
    input.value < last &&
    !input.isRollover
  ) {
    throw new ServiceError(
      `This meter only counts up (last reading ${last} ${meter.unit}). If it rolled over, tick the rollover box.`,
    );
  }

  const readingId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(meterReadings)
      .values({
        meterId,
        value: input.value.toString(),
        note: input.note || null,
        isRollover: input.isRollover ?? false,
        recordedBy: actor.id,
      })
      .returning({ id: meterReadings.id });
    await tx
      .update(meters)
      .set({ currentValue: input.value.toString(), currentReadingAt: new Date() })
      .where(eq(meters.id, meterId));
    await recordAudit(tx, {
      userId: actor.id,
      action: "meter.reading",
      entityType: "meter",
      entityId: meterId,
      summary: `Reading: ${input.value} ${meter.unit}${input.isRollover ? " (rollover)" : ""}`,
    });
    return row.id;
  });

  const firedWorkOrderIds = await evaluateTriggers(meter, readingId, input.value, last);
  return { readingId, firedWorkOrderIds };
}

/**
 * Correct a bad reading with a full audit trail (§10): the original row is
 * voided (never deleted), a correction row references it, and the meter's
 * current value is recomputed from the latest non-voided reading.
 */
export async function correctReading(
  actor: SessionUser,
  readingId: number,
  input: { value: number; note: string },
): Promise<void> {
  const [orig] = await db
    .select()
    .from(meterReadings)
    .where(eq(meterReadings.id, readingId))
    .limit(1);
  if (!orig) throw new ServiceError("Reading not found.");
  if (orig.isVoided) throw new ServiceError("That reading was already corrected.");
  if (!input.note.trim()) {
    throw new ServiceError("A correction note is required for the audit trail.");
  }
  const meter = await getMeter(orig.meterId);
  if (!meter) throw new ServiceError("Meter not found.");

  await db.transaction(async (tx) => {
    await tx
      .update(meterReadings)
      .set({ isVoided: true })
      .where(eq(meterReadings.id, readingId));
    await tx.insert(meterReadings).values({
      meterId: orig.meterId,
      value: input.value.toString(),
      readingAt: orig.readingAt, // correction keeps the original time
      note: input.note,
      correctsReadingId: readingId,
      recordedBy: actor.id,
    });
    // Recompute current value from the latest non-voided reading.
    const [latest] = await tx
      .select()
      .from(meterReadings)
      .where(
        and(eq(meterReadings.meterId, orig.meterId), eq(meterReadings.isVoided, false)),
      )
      .orderBy(desc(meterReadings.readingAt), desc(meterReadings.id))
      .limit(1);
    await tx
      .update(meters)
      .set({
        currentValue: latest?.value ?? null,
        currentReadingAt: latest?.readingAt ?? null,
      })
      .where(eq(meters.id, orig.meterId));
    await recordAudit(tx, {
      userId: actor.id,
      action: "meter.reading_corrected",
      entityType: "meter",
      entityId: orig.meterId,
      summary: `Corrected reading #${readingId}: ${orig.value} → ${input.value} (${input.note})`,
      previousValue: { value: orig.value },
      newValue: { value: input.value },
    });
  });
}

export async function listReadings(meterId: number, limit = 100) {
  return db
    .select()
    .from(meterReadings)
    .where(eq(meterReadings.meterId, meterId))
    .orderBy(desc(meterReadings.readingAt), desc(meterReadings.id))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type TriggerInput = {
  name: string;
  type: "threshold" | "interval";
  threshold?: number | null;
  intervalValue?: number | null;
  skipIfOpen: boolean;
  woTitle: string;
  woDescription?: string | null;
  priority: TriggerRow["priority"];
  procedureTemplateId?: number | null;
  assignedTeamId?: number | null;
};

export async function createTrigger(
  actorId: number,
  meterId: number,
  input: TriggerInput,
): Promise<number> {
  const meter = await getMeter(meterId);
  if (!meter) throw new ServiceError("Meter not found.");
  if (input.type === "threshold" && input.threshold == null) {
    throw new ServiceError("A threshold value is required.");
  }
  if (input.type === "interval") {
    if (input.intervalValue == null || input.intervalValue <= 0) {
      throw new ServiceError("The interval must be a positive number.");
    }
  }
  if (input.procedureTemplateId != null) {
    const tpl = await getTemplate(input.procedureTemplateId);
    if (!tpl || !tpl.isActive) throw new ServiceError("Procedure not found.");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(meterTriggers)
      .values({
        meterId,
        name: input.name,
        type: input.type,
        threshold: input.threshold?.toString() ?? null,
        intervalValue: input.intervalValue?.toString() ?? null,
        // Interval triggers baseline from the meter's current value so the
        // first WO fires after one full interval of NEW usage.
        lastFiredValue:
          input.type === "interval" ? (meter.currentValue ?? "0") : null,
        skipIfOpen: input.skipIfOpen,
        woTitle: input.woTitle,
        woDescription: input.woDescription || null,
        priority: input.priority,
        procedureTemplateId: input.procedureTemplateId ?? null,
        assignedTeamId: input.assignedTeamId ?? null,
        createdBy: actorId,
      })
      .returning({ id: meterTriggers.id });
    await recordAudit(tx, {
      userId: actorId,
      action: "meter.trigger_create",
      entityType: "meter",
      entityId: meterId,
      summary: `Created trigger "${input.name}" (${input.type})`,
    });
    return row.id;
  });
}

export async function setTriggerActive(
  actorId: number,
  triggerId: number,
  active: boolean,
): Promise<void> {
  const [trigger] = await db
    .select()
    .from(meterTriggers)
    .where(eq(meterTriggers.id, triggerId))
    .limit(1);
  if (!trigger) throw new ServiceError("Trigger not found.");
  await db.transaction(async (tx) => {
    await tx
      .update(meterTriggers)
      .set({ isActive: active })
      .where(eq(meterTriggers.id, triggerId));
    await recordAudit(tx, {
      userId: actorId,
      action: active ? "meter.trigger_enable" : "meter.trigger_disable",
      entityType: "meter",
      entityId: trigger.meterId,
      summary: `${active ? "Enabled" : "Disabled"} trigger "${trigger.name}"`,
    });
  });
}

export async function listTriggers(meterId: number) {
  return db
    .select()
    .from(meterTriggers)
    .where(eq(meterTriggers.meterId, meterId))
    .orderBy(asc(meterTriggers.name));
}

/**
 * Evaluate triggers for a new reading. Exactly-once (§10/DECISIONS.md #6):
 * the fired event row is claimed via UNIQUE (trigger, reading) BEFORE the
 * WO is created, and the interval watermark advances in that same
 * transaction — reprocessing a reading is a guaranteed no-op.
 */
export async function evaluateTriggers(
  meter: MeterRow,
  readingId: number,
  value: number,
  previousValue: number | null,
): Promise<number[]> {
  const triggers = await db
    .select()
    .from(meterTriggers)
    .where(and(eq(meterTriggers.meterId, meter.id), eq(meterTriggers.isActive, true)));
  const fired: number[] = [];

  for (const trigger of triggers) {
    try {
      let shouldFire = false;
      let newWatermark: string | null = null;

      if (trigger.type === "threshold") {
        const threshold = num(trigger.threshold)!;
        const crossed =
          value >= threshold && (previousValue == null || previousValue < threshold);
        shouldFire = crossed;
      } else {
        const interval = num(trigger.intervalValue)!;
        const baseline = num(trigger.lastFiredValue) ?? 0;
        if (value >= baseline + interval) {
          shouldFire = true;
          // Collapse multiple elapsed intervals into ONE WO; advance the
          // watermark past all of them (same catch-up semantics as PM).
          const steps = Math.floor((value - baseline) / interval);
          newWatermark = (baseline + steps * interval).toString();
        }
      }
      if (!shouldFire) continue;

      // Open-WO guard: don't pile on while the last generated WO is open.
      if (trigger.skipIfOpen) {
        const [lastEvent] = await db
          .select({ status: workOrders.status })
          .from(meterTriggerEvents)
          .innerJoin(workOrders, eq(meterTriggerEvents.workOrderId, workOrders.id))
          .where(eq(meterTriggerEvents.triggerId, trigger.id))
          .orderBy(desc(meterTriggerEvents.createdAt))
          .limit(1);
        if (
          lastEvent &&
          lastEvent.status !== "completed" &&
          lastEvent.status !== "canceled"
        ) {
          continue;
        }
      }

      // Claim the event (idempotency gate), advancing the watermark with it.
      const claimed = await db.transaction(async (tx) => {
        const rows = await tx
          .insert(meterTriggerEvents)
          .values({ triggerId: trigger.id, readingId })
          .onConflictDoNothing()
          .returning({ id: meterTriggerEvents.id });
        if (rows.length === 0) return null;
        if (newWatermark != null) {
          await tx
            .update(meterTriggers)
            .set({ lastFiredValue: newWatermark })
            .where(eq(meterTriggers.id, trigger.id));
        }
        return rows[0].id;
      });
      if (claimed == null) continue;

      // Site comes from the meter's asset or location.
      let siteId: number | null = null;
      let locationId: number | null = null;
      if (meter.assetId) {
        const [asset] = await db
          .select()
          .from(assets)
          .where(eq(assets.id, meter.assetId))
          .limit(1);
        siteId = asset?.siteId ?? null;
        locationId = asset?.locationId ?? null;
      } else if (meter.locationId) {
        const [loc] = await db
          .select()
          .from(locations)
          .where(eq(locations.id, meter.locationId))
          .limit(1);
        siteId = loc?.siteId ?? null;
        locationId = loc?.id ?? null;
      }
      if (siteId == null) continue;

      const woId = await createWorkOrder(trigger.createdBy, {
        title: trigger.woTitle,
        description: `${trigger.woDescription ?? ""}\n\nTriggered by meter "${meter.name}" at ${value} ${meter.unit} (trigger: ${trigger.name}).`.trim(),
        siteId,
        locationId,
        assetIds: meter.assetId ? [meter.assetId] : [],
        workType: "preventive",
        priority: trigger.priority,
        assignedTeamId: trigger.assignedTeamId,
        source: "meter",
      });
      await db
        .update(meterTriggerEvents)
        .set({ workOrderId: woId })
        .where(eq(meterTriggerEvents.id, claimed));
      if (trigger.procedureTemplateId) {
        try {
          await attachProcedure(trigger.createdBy, woId, trigger.procedureTemplateId);
        } catch (err) {
          console.error(`[meter] procedure attach failed:`, err);
        }
      }
      await recordAudit(db, {
        userId: null,
        action: "meter.trigger_fired",
        entityType: "meter",
        entityId: meter.id,
        summary: `Trigger "${trigger.name}" fired at ${value} ${meter.unit} → work order #${woId}`,
        source: "system",
        correlationId: `meter-${trigger.id}-${readingId}`,
      });
      fired.push(woId);
    } catch (err) {
      console.error(`[meter] trigger ${trigger.id} evaluation failed:`, err);
    }
  }
  return fired;
}

/** Trigger-fired WO history for the meter page. */
export async function meterWoHistory(meterId: number) {
  const triggerIds = (await listTriggers(meterId)).map((t) => t.id);
  if (triggerIds.length === 0) return [];
  return db
    .select({ event: meterTriggerEvents, wo: workOrders })
    .from(meterTriggerEvents)
    .leftJoin(workOrders, eq(meterTriggerEvents.workOrderId, workOrders.id))
    .where(inArray(meterTriggerEvents.triggerId, triggerIds))
    .orderBy(desc(meterTriggerEvents.createdAt))
    .limit(50);
}
