import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  procedureResponses,
  procedureTemplates,
  procedureVersions,
  woProcedureInstances,
  workOrders,
} from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/session";
import { recordAudit } from "./audit";
import { ServiceError } from "./users";
import { canActOnWorkOrder, getWorkOrder } from "./workOrders";

/**
 * Step definition stored in procedure_versions.steps and copied verbatim
 * into wo_procedure_instances.steps_snapshot at attach time.
 */
export const stepSchema = z.object({
  type: z.enum([
    "instruction",
    "checkbox",
    "pass_fail",
    "multiple_choice",
    "text",
    "number",
    "meter_reading",
    "photo",
    "file",
    "signature",
    "datetime",
  ]),
  label: z.string().trim().min(1).max(500),
  instructions: z.string().trim().max(5000).optional(),
  expectedResult: z.string().trim().max(1000).optional(),
  required: z.boolean().default(false),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  options: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  /** What happens when a pass_fail step fails or a number is out of range. */
  failure: z
    .object({
      requireComment: z.boolean().default(false),
      requirePhoto: z.boolean().default(false),
      createCorrective: z.boolean().default(false),
    })
    .optional(),
  /** Conditional follow-up: only show when a prior step's value matches. */
  showIf: z
    .object({
      step: z.number().int().min(0),
      equals: z.string(),
    })
    .optional(),
});

export type ProcedureStep = z.infer<typeof stepSchema>;
export const stepsSchema = z.array(stepSchema).min(1).max(100);

export type ResponseValue = {
  v: string | number | boolean;
  comment?: string;
};

// ---------------------------------------------------------------------------
// Templates + versions
// ---------------------------------------------------------------------------

export async function listTemplates() {
  return db
    .select()
    .from(procedureTemplates)
    .orderBy(asc(procedureTemplates.name));
}

export async function getTemplate(id: number) {
  const rows = await db
    .select()
    .from(procedureTemplates)
    .where(eq(procedureTemplates.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTemplateVersion(templateId: number, version: number) {
  const rows = await db
    .select()
    .from(procedureVersions)
    .where(
      and(
        eq(procedureVersions.templateId, templateId),
        eq(procedureVersions.version, version),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createTemplate(
  actorId: number,
  input: { name: string; description?: string | null; steps: ProcedureStep[] },
): Promise<number> {
  const steps = stepsSchema.parse(input.steps);
  validateShowIf(steps);
  return db.transaction(async (tx) => {
    const [tpl] = await tx
      .insert(procedureTemplates)
      .values({
        name: input.name,
        description: input.description || null,
        currentVersion: 1,
        createdBy: actorId,
      })
      .returning({ id: procedureTemplates.id });
    await tx.insert(procedureVersions).values({
      templateId: tpl.id,
      version: 1,
      steps,
      createdBy: actorId,
    });
    await recordAudit(tx, {
      userId: actorId,
      action: "procedure.create",
      entityType: "procedure_template",
      entityId: tpl.id,
      summary: `Created procedure "${input.name}" (v1, ${steps.length} steps)`,
    });
    return tpl.id;
  });
}

/** Saving edits = new immutable version; historical WOs are untouched. */
export async function saveTemplateVersion(
  actorId: number,
  templateId: number,
  input: {
    name: string;
    description?: string | null;
    isActive: boolean;
    steps: ProcedureStep[];
  },
): Promise<number> {
  const steps = stepsSchema.parse(input.steps);
  validateShowIf(steps);
  const existing = await getTemplate(templateId);
  if (!existing) throw new ServiceError("Procedure not found.");
  const nextVersion = existing.currentVersion + 1;
  await db.transaction(async (tx) => {
    await tx
      .update(procedureTemplates)
      .set({
        name: input.name,
        description: input.description || null,
        isActive: input.isActive,
        currentVersion: nextVersion,
        updatedAt: new Date(),
      })
      .where(eq(procedureTemplates.id, templateId));
    await tx.insert(procedureVersions).values({
      templateId,
      version: nextVersion,
      steps,
      createdBy: actorId,
    });
    await recordAudit(tx, {
      userId: actorId,
      action: "procedure.update",
      entityType: "procedure_template",
      entityId: templateId,
      summary: `Saved procedure "${input.name}" v${nextVersion} (${steps.length} steps)`,
    });
  });
  return nextVersion;
}

function validateShowIf(steps: ProcedureStep[]) {
  steps.forEach((s, i) => {
    if (s.showIf && s.showIf.step >= i) {
      throw new ServiceError(
        `Step ${i + 1}: a conditional step can only depend on an EARLIER step.`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Instances (attach to WO) + responses
// ---------------------------------------------------------------------------

export async function attachProcedure(
  actorId: number,
  workOrderId: number,
  templateId: number,
): Promise<number> {
  const wo = await getWorkOrder(workOrderId);
  if (!wo) throw new ServiceError("Work order not found.");
  if (wo.status === "completed" || wo.status === "canceled") {
    throw new ServiceError("This work order is finished.");
  }
  const tpl = await getTemplate(templateId);
  if (!tpl || !tpl.isActive) throw new ServiceError("Procedure not found.");
  const version = await getTemplateVersion(templateId, tpl.currentVersion);
  if (!version) throw new ServiceError("Procedure has no published version.");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(woProcedureInstances)
      .values({
        workOrderId,
        templateId,
        templateVersion: version.version,
        name: tpl.name,
        stepsSnapshot: version.steps,
        attachedBy: actorId,
      })
      .returning({ id: woProcedureInstances.id });
    await recordAudit(tx, {
      userId: actorId,
      action: "work_order.procedure_attach",
      entityType: "work_order",
      entityId: workOrderId,
      summary: `Attached procedure "${tpl.name}" v${version.version}`,
    });
    return row.id;
  });
}

export async function getInstance(instanceId: number) {
  const rows = await db
    .select()
    .from(woProcedureInstances)
    .where(eq(woProcedureInstances.id, instanceId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listInstancesForWo(workOrderId: number) {
  const instances = await db
    .select()
    .from(woProcedureInstances)
    .where(eq(woProcedureInstances.workOrderId, workOrderId))
    .orderBy(asc(woProcedureInstances.createdAt));
  const responses =
    instances.length > 0
      ? await db
          .select()
          .from(procedureResponses)
          .where(
            inArray(
              procedureResponses.instanceId,
              instances.map((i) => i.id),
            ),
          )
      : [];
  return instances.map((inst) => ({
    instance: inst,
    steps: inst.stepsSnapshot as ProcedureStep[],
    responses: responses.filter((r) => r.instanceId === inst.id),
  }));
}

/** Is a step currently visible given prior responses (conditional logic)? */
export function isStepVisible(
  steps: ProcedureStep[],
  index: number,
  responses: { stepIndex: number; value: unknown }[],
): boolean {
  const step = steps[index];
  if (!step?.showIf) return true;
  const dep = responses.find((r) => r.stepIndex === step.showIf!.step);
  if (!dep) return false;
  const v = (dep.value as ResponseValue)?.v;
  return String(v) === step.showIf.equals;
}

export async function respondToStep(
  actor: SessionUser,
  instanceId: number,
  stepIndex: number,
  value: ResponseValue,
): Promise<{ failed: boolean; correctiveRequested: boolean }> {
  const inst = await getInstance(instanceId);
  if (!inst) throw new ServiceError("Procedure not found.");
  const wo = await getWorkOrder(inst.workOrderId);
  if (!wo) throw new ServiceError("Work order not found.");
  if (wo.status === "completed" || wo.status === "canceled") {
    throw new ServiceError("This work order is finished — reopen it first.");
  }
  if (!(await canActOnWorkOrder(actor, inst.workOrderId))) {
    throw new ServiceError("This work order is assigned to someone else.");
  }
  const steps = inst.stepsSnapshot as ProcedureStep[];
  const step = steps[stepIndex];
  if (!step) throw new ServiceError("Unknown step.");
  if (step.type === "instruction") {
    throw new ServiceError("Instruction steps have nothing to answer.");
  }

  // Type-specific validation.
  let isFailure = false;
  switch (step.type) {
    case "checkbox":
      if (typeof value.v !== "boolean") throw new ServiceError("Invalid value.");
      break;
    case "pass_fail": {
      if (value.v !== "pass" && value.v !== "fail") {
        throw new ServiceError("Choose pass or fail.");
      }
      isFailure = value.v === "fail";
      break;
    }
    case "multiple_choice": {
      if (!step.options?.includes(String(value.v))) {
        throw new ServiceError("Pick one of the listed options.");
      }
      break;
    }
    case "number":
    case "meter_reading": {
      const n = Number(value.v);
      if (!Number.isFinite(n)) throw new ServiceError("Enter a number.");
      value = { ...value, v: n };
      if (
        (step.min != null && n < step.min) ||
        (step.max != null && n > step.max)
      ) {
        isFailure = true; // out-of-range readings count as failures
      }
      break;
    }
    case "text":
    case "signature": {
      if (typeof value.v !== "string" || value.v.trim().length === 0) {
        throw new ServiceError("This step needs a text answer.");
      }
      break;
    }
    case "datetime": {
      if (typeof value.v !== "string" || value.v.length === 0) {
        throw new ServiceError("Pick a date/time.");
      }
      break;
    }
    case "photo":
    case "file":
      // Value carries the attachment count confirmation; uploads flow
      // through the attachments API with entity procedure_response.
      break;
  }

  if (isFailure && step.failure?.requireComment && !value.comment?.trim()) {
    throw new ServiceError(
      "A comment is required when this step fails — describe what you found.",
    );
  }

  const correctiveRequested = isFailure && !!step.failure?.createCorrective;

  // Only create ONE corrective request per step, even when the answer is
  // updated repeatedly.
  const priorResponse = await db
    .select()
    .from(procedureResponses)
    .where(
      and(
        eq(procedureResponses.instanceId, instanceId),
        eq(procedureResponses.stepIndex, stepIndex),
      ),
    )
    .limit(1);
  const alreadyFailed = priorResponse[0]?.isFailure === true;

  await db.transaction(async (tx) => {
    await tx
      .insert(procedureResponses)
      .values({
        instanceId,
        stepIndex,
        value,
        isFailure,
        respondedBy: actor.id,
      })
      .onConflictDoUpdate({
        target: [procedureResponses.instanceId, procedureResponses.stepIndex],
        set: {
          value,
          isFailure,
          respondedBy: actor.id,
          respondedAt: new Date(),
        },
      });
    if (isFailure) {
      await tx
        .update(workOrders)
        .set({ flagged: true, updatedAt: new Date() })
        .where(eq(workOrders.id, inst.workOrderId));
    }
    await recordAudit(tx, {
      userId: actor.id,
      action: isFailure
        ? "procedure.step_failed"
        : "procedure.step_answered",
      entityType: "work_order",
      entityId: inst.workOrderId,
      summary: `${isFailure ? "FAILED" : "Answered"} step "${step.label}"${value.comment ? ` — ${value.comment}` : ""}`,
    });
  });

  if (correctiveRequested && !alreadyFailed) {
    const { createCorrectiveRequest } = await import("./requests");
    await createCorrectiveRequest(
      actor,
      inst.workOrderId,
      step.label,
      value.comment,
    );
  }

  return { failed: isFailure, correctiveRequested };
}

/**
 * Completion gate (§7): every attached procedure's required, currently
 * visible steps must be answered. Returns human-readable blockers.
 */
export async function getCompletionBlockers(
  workOrderId: number,
): Promise<string[]> {
  const instances = await listInstancesForWo(workOrderId);
  const blockers: string[] = [];
  for (const { instance, steps, responses } of instances) {
    steps.forEach((step, i) => {
      if (step.type === "instruction" || !step.required) return;
      if (!isStepVisible(steps, i, responses)) return;
      const resp = responses.find((r) => r.stepIndex === i);
      if (!resp) {
        blockers.push(`${instance.name}: "${step.label}" not answered`);
        return;
      }
      if (step.type === "checkbox" && (resp.value as ResponseValue).v !== true) {
        blockers.push(`${instance.name}: "${step.label}" not checked off`);
      }
    });
  }
  return blockers;
}

/** Latest failed responses (for flag context on the WO page). */
export async function listFailures(workOrderId: number) {
  const instances = await db
    .select({ id: woProcedureInstances.id, name: woProcedureInstances.name })
    .from(woProcedureInstances)
    .where(eq(woProcedureInstances.workOrderId, workOrderId));
  if (instances.length === 0) return [];
  const out: { instanceName: string; stepIndex: number }[] = [];
  for (const inst of instances) {
    const fails = await db
      .select()
      .from(procedureResponses)
      .where(
        and(
          eq(procedureResponses.instanceId, inst.id),
          eq(procedureResponses.isFailure, true),
        ),
      )
      .orderBy(desc(procedureResponses.respondedAt));
    for (const f of fails) {
      out.push({ instanceName: inst.name, stepIndex: f.stepIndex });
    }
  }
  return out;
}
