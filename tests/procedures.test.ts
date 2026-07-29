import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { createSite } from "@/server/services/sites";
import {
  changeWorkOrderStatus,
  createWorkOrder,
  getWorkOrder,
} from "@/server/services/workOrders";
import {
  attachProcedure,
  createTemplate,
  getCompletionBlockers,
  getTemplate,
  isStepVisible,
  listInstancesForWo,
  respondToStep,
  saveTemplateVersion,
  type ProcedureStep,
} from "@/server/services/procedures";
import { ServiceError } from "@/server/services/users";
import { makeUser, truncateAll } from "./helpers";
import type { SessionUser } from "@/server/auth/session";

async function reset() {
  await truncateAll();
  await db.execute(sql`
    TRUNCATE TABLE procedure_responses, wo_procedure_instances,
      procedure_versions, procedure_templates, comments, work_order_labor,
      work_order_status_history, work_order_assignments, work_order_assets,
      work_orders, assets, locations, sites RESTART IDENTITY CASCADE
  `);
}

function asSession(u: { id: number; username: string; role: SessionUser["role"] }): SessionUser {
  return { id: u.id, username: u.username, displayName: u.username, email: null, mustChangePassword: false, role: u.role };
}

let admin: SessionUser;
let tech: SessionUser;
let siteId: number;
let woId: number;

const STEPS: ProcedureStep[] = [
  { type: "instruction", label: "Lock out power", required: false },
  { type: "checkbox", label: "Guard removed", required: true },
  { type: "pass_fail", label: "Belt condition", required: true, failure: { requireComment: true, requirePhoto: false, createCorrective: true } },
  { type: "number", label: "Belt tension (lbs)", required: false, min: 40, max: 60 },
  { type: "text", label: "Notes on wear", required: false },
  {
    type: "text",
    label: "Describe the failure",
    required: true,
    showIf: { step: 2, equals: "fail" },
  },
];

beforeEach(async () => {
  await reset();
  admin = asSession(await makeUser({ role: "admin" }));
  tech = asSession(await makeUser({ role: "technician" }));
  siteId = await createSite(admin.id, { name: "Main" });
  woId = await createWorkOrder(admin.id, {
    title: "PM check",
    siteId,
    workType: "preventive",
    priority: "medium",
    assigneeIds: [tech.id],
  });
});

describe("templates and versioning", () => {
  it("creates v1 and bumps versions on save", async () => {
    const id = await createTemplate(admin.id, {
      name: "Belt inspection",
      steps: STEPS,
    });
    expect((await getTemplate(id))?.currentVersion).toBe(1);
    await saveTemplateVersion(admin.id, id, {
      name: "Belt inspection",
      isActive: true,
      steps: STEPS.slice(0, 3),
    });
    expect((await getTemplate(id))?.currentVersion).toBe(2);
  });

  it("rejects forward-referencing conditionals", async () => {
    await expect(
      createTemplate(admin.id, {
        name: "Bad",
        steps: [
          { type: "checkbox", label: "A", required: false, showIf: { step: 1, equals: "x" } },
          { type: "text", label: "B", required: false },
        ],
      }),
    ).rejects.toThrow(/earlier step/i);
  });

  it("template edits never change an attached snapshot", async () => {
    const tplId = await createTemplate(admin.id, {
      name: "Belt inspection",
      steps: STEPS,
    });
    await attachProcedure(admin.id, woId, tplId);
    await saveTemplateVersion(admin.id, tplId, {
      name: "Belt inspection v2",
      isActive: true,
      steps: [{ type: "checkbox", label: "Totally different", required: true }],
    });
    const [inst] = await listInstancesForWo(woId);
    expect(inst.steps).toHaveLength(STEPS.length);
    expect(inst.steps[0].label).toBe("Lock out power");
    expect(inst.instance.templateVersion).toBe(1);
  });
});

describe("responses", () => {
  let tplId: number;
  let instId: number;

  beforeEach(async () => {
    tplId = await createTemplate(admin.id, { name: "Belt", steps: STEPS });
    instId = await attachProcedure(admin.id, woId, tplId);
  });

  it("answers upsert (re-answering replaces)", async () => {
    await respondToStep(tech, instId, 1, { v: true });
    await respondToStep(tech, instId, 1, { v: false });
    const [inst] = await listInstancesForWo(woId);
    expect(inst.responses).toHaveLength(1);
    expect((inst.responses[0].value as { v: boolean }).v).toBe(false);
  });

  it("validates by type", async () => {
    await expect(
      respondToStep(tech, instId, 2, { v: "maybe" }),
    ).rejects.toThrow(/pass or fail/i);
    await expect(
      respondToStep(tech, instId, 3, { v: "not-a-number" }),
    ).rejects.toThrow(/number/i);
    await expect(respondToStep(tech, instId, 0, { v: true })).rejects.toThrow(
      /nothing to answer/i,
    );
  });

  it("failed pass_fail requires a comment, flags the WO, and requests corrective", async () => {
    await expect(
      respondToStep(tech, instId, 2, { v: "fail" }),
    ).rejects.toThrow(/comment is required/i);
    const result = await respondToStep(tech, instId, 2, {
      v: "fail",
      comment: "Belt cracked through",
    });
    expect(result.failed).toBe(true);
    expect(result.correctiveRequested).toBe(true);
    expect((await getWorkOrder(woId))?.flagged).toBe(true);
  });

  it("out-of-range numbers count as failures", async () => {
    const result = await respondToStep(tech, instId, 3, { v: 90 });
    expect(result.failed).toBe(true);
  });

  it("unassigned tech cannot respond", async () => {
    const stranger = asSession(await makeUser({ role: "technician" }));
    await expect(
      respondToStep(stranger, instId, 1, { v: true }),
    ).rejects.toThrow(/assigned to someone else/i);
  });
});

describe("conditional visibility", () => {
  it("hides dependent steps until the trigger value matches", () => {
    expect(isStepVisible(STEPS, 5, [])).toBe(false);
    expect(
      isStepVisible(STEPS, 5, [{ stepIndex: 2, value: { v: "pass" } }]),
    ).toBe(false);
    expect(
      isStepVisible(STEPS, 5, [{ stepIndex: 2, value: { v: "fail" } }]),
    ).toBe(true);
  });
});

describe("completion gate", () => {
  it("blocks completion until required visible steps are answered", async () => {
    const tplId = await createTemplate(admin.id, { name: "Belt", steps: STEPS });
    await attachProcedure(admin.id, woId, tplId);

    await expect(
      changeWorkOrderStatus(tech, woId, "completed"),
    ).rejects.toThrow(/required procedure steps/i);

    let blockers = await getCompletionBlockers(woId);
    expect(blockers.length).toBe(2); // checkbox + pass_fail (conditional hidden)

    const [inst] = await listInstancesForWo(woId);
    await respondToStep(tech, inst.instance.id, 1, { v: true });
    await respondToStep(tech, inst.instance.id, 2, { v: "pass" });

    blockers = await getCompletionBlockers(woId);
    expect(blockers).toHaveLength(0);
    await changeWorkOrderStatus(tech, woId, "completed");
    expect((await getWorkOrder(woId))?.status).toBe("completed");
  });

  it("a failing answer reveals its conditional required step and blocks completion", async () => {
    const tplId = await createTemplate(admin.id, { name: "Belt", steps: STEPS });
    await attachProcedure(admin.id, woId, tplId);
    const [inst] = await listInstancesForWo(woId);
    await respondToStep(tech, inst.instance.id, 1, { v: true });
    await respondToStep(tech, inst.instance.id, 2, { v: "fail", comment: "cracked" });

    const blockers = await getCompletionBlockers(woId);
    expect(blockers.some((b) => b.includes("Describe the failure"))).toBe(true);

    await respondToStep(tech, inst.instance.id, 5, { v: "split at seam" });
    expect(await getCompletionBlockers(woId)).toHaveLength(0);
  });

  it("required checkbox must be TRUE, not just answered", async () => {
    const tplId = await createTemplate(admin.id, {
      name: "Only checkbox",
      steps: [{ type: "checkbox", label: "Verified", required: true }],
    });
    await attachProcedure(admin.id, woId, tplId);
    const [inst] = await listInstancesForWo(woId);
    await respondToStep(tech, inst.instance.id, 0, { v: false });
    const blockers = await getCompletionBlockers(woId);
    expect(blockers.some((b) => b.includes("not checked off"))).toBe(true);
  });

  it("responding on a completed WO is refused", async () => {
    const tplId = await createTemplate(admin.id, {
      name: "None required",
      steps: [{ type: "text", label: "Optional note", required: false }],
    });
    const instId = await attachProcedure(admin.id, woId, tplId);
    await changeWorkOrderStatus(tech, woId, "completed");
    await expect(
      respondToStep(tech, instId, 0, { v: "late note" }),
    ).rejects.toThrow(ServiceError);
  });
});

describe("Phase 12: corrective work order from failed step", () => {
  it("creates one corrective sub-WO when configured, only once", async () => {
    const tplId = await createTemplate(admin.id, {
      name: "Guard check",
      steps: [
        {
          type: "pass_fail",
          label: "Guard bolted",
          required: true,
          failure: { requireComment: false, requirePhoto: false, createCorrective: false, createWorkOrder: true },
        },
      ],
    });
    const instId = await attachProcedure(admin.id, woId, tplId);
    await respondToStep(tech, instId, 0, { v: "fail", comment: "loose" });
    await respondToStep(tech, instId, 0, { v: "fail", comment: "still loose" });

    const { workOrders: woTable } = await import("@/server/db/schema");
    const { eq: eqOp } = await import("drizzle-orm");
    const corrective = await db
      .select()
      .from(woTable)
      .where(eqOp(woTable.workType, "corrective"));
    expect(corrective).toHaveLength(1);
    expect(corrective[0].parentWorkOrderId).toBe(woId);
    expect(corrective[0].priority).toBe("high");
    expect(corrective[0].title).toContain("Guard bolted");
  });
});
