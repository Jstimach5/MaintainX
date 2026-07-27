/**
 * Repeatable demo/seed data (§20). Run with: npm run db:seed
 * Wipes and refills all app tables — NEVER run against production data.
 * Dev logins are documented in docs/ADMIN_GUIDE.md.
 */
import { sql } from "drizzle-orm";
import { db, pool } from "@/server/db";
import { orgSettings } from "@/server/db/schema";
import { createUser, setupOrganization } from "@/server/services/users";
import { createTeam, updateTeam } from "@/server/services/teams";
import { createSite } from "@/server/services/sites";
import { createLocation } from "@/server/services/locations";
import { createAsset } from "@/server/services/assets";
import {
  addLabor,
  addComment,
  changeWorkOrderStatus,
  createWorkOrder,
} from "@/server/services/workOrders";
import { createTemplate } from "@/server/services/procedures";
import { createPlan, runPmTick } from "@/server/services/pm";
import { addReading, createMeter, createTrigger } from "@/server/services/meters";
import { createRequest } from "@/server/services/requests";
import { createAttachment } from "@/server/services/attachments";
import { todayInTimezone, addDays } from "@/lib/format";
import type { SessionUser } from "@/server/auth/session";

const TZ = "America/Chicago";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function asSession(id: number, name: string, role: SessionUser["role"]): SessionUser {
  return { id, username: name, displayName: name, email: null, role };
}

async function main() {
  console.log("Seeding… (wipes existing app data)");
  await db.execute(sql`
    TRUNCATE TABLE import_rows, import_jobs, import_mappings,
      meter_trigger_events, meter_triggers, meter_readings, meters,
      pm_occurrences, pm_plans, notifications, work_requests,
      procedure_responses, wo_procedure_instances, procedure_versions,
      procedure_templates, comments, work_order_labor,
      work_order_status_history, work_order_assignments, work_order_assets,
      work_orders, asset_location_history, asset_status_history, attachments,
      assets, locations, sites, audit_events, sessions, team_members, teams,
      users, org_settings RESTART IDENTITY CASCADE
  `);

  // Users (§20): 1 admin, 2 managers, 3 technicians, 1 requester.
  const adminId = await setupOrganization({
    orgName: "Acme Industrial",
    timezone: TZ,
    username: "admin",
    displayName: "Alice Admin",
    password: "admin-demo-123",
  });
  await db.insert(orgSettings).values({ id: 1 }).onConflictDoNothing();
  const admin = asSession(adminId, "Alice Admin", "admin");
  const mkUser = (u: string, d: string, r: "manager" | "technician" | "requester") =>
    createUser(adminId, { username: u, displayName: d, role: r, password: `${u}-demo-123` });
  const mgr1 = await mkUser("morgan", "Morgan Manager", "manager");
  await mkUser("marta", "Marta Manager", "manager");
  const tech1 = await mkUser("taylor", "Taylor Tech", "technician");
  const tech2 = await mkUser("terry", "Terry Tech", "technician");
  await mkUser("tessa", "Tessa Tech", "technician");
  const req1 = await mkUser("riley", "Riley Requester", "requester");
  const taylor = asSession(tech1, "Taylor Tech", "technician");

  const teamId = await createTeam(adminId, { name: "Mechanical", description: "Pumps, motors, conveyors" });
  await updateTeam(adminId, teamId, {
    name: "Mechanical",
    description: "Pumps, motors, conveyors",
    isActive: true,
    memberIds: [tech1, tech2],
  });

  // Sites + nested locations.
  const plant = await createSite(adminId, { name: "Main Plant", code: "MAIN", address: "100 Industry Rd" });
  const depot = await createSite(adminId, { name: "West Depot", code: "WEST", address: "42 Freight Ln" });
  const bldgA = await createLocation(adminId, { siteId: plant, name: "Building A" });
  const floor1 = await createLocation(adminId, { siteId: plant, parentId: bldgA, name: "Production Floor" });
  const compressorRoom = await createLocation(adminId, { siteId: plant, parentId: bldgA, name: "Compressor Room" });
  await createLocation(adminId, { siteId: plant, name: "Yard" });
  const dock = await createLocation(adminId, { siteId: depot, name: "Loading Dock" });

  // Assets incl. a parent with sub-assets.
  const line1 = await createAsset(adminId, {
    name: "Packaging Line 1",
    siteId: plant,
    locationId: floor1,
    assetType: "Production line",
    criticality: "critical",
    responsibleTeamId: teamId,
  });
  const conveyor = await createAsset(adminId, {
    name: "Conveyor Belt L1",
    siteId: plant,
    locationId: floor1,
    parentAssetId: line1,
    assetType: "Conveyor",
    criticality: "high",
    make: "FlowTech",
    model: "CB-2200",
    serialNumber: "FT-88301",
  });
  const labeler = await createAsset(adminId, {
    name: "Labeler L1",
    siteId: plant,
    locationId: floor1,
    parentAssetId: line1,
    assetType: "Labeler",
    criticality: "medium",
  });
  const compressor = await createAsset(adminId, {
    name: "Air Compressor 1",
    siteId: plant,
    locationId: compressorRoom,
    assetType: "Compressor",
    criticality: "high",
    make: "AirMax",
    model: "AM-500",
    serialNumber: "AM5-11207",
    year: 2021,
  });
  const forklift = await createAsset(adminId, {
    name: "Forklift 3",
    siteId: depot,
    locationId: dock,
    assetType: "Vehicle",
    criticality: "medium",
    make: "LiftPro",
  });
  await createAttachment({
    actorId: adminId,
    entityType: "asset",
    entityId: compressor,
    originalName: "compressor.png",
    mimeType: "image/png",
    data: PNG,
    category: "main",
  });

  // Procedure template.
  const beltProcedure = await createTemplate(adminId, {
    name: "Belt inspection",
    description: "Quarterly conveyor belt inspection",
    steps: [
      { type: "instruction", label: "Lock out / tag out the line", required: false },
      { type: "checkbox", label: "Guards removed and stored", required: true },
      { type: "pass_fail", label: "Belt condition acceptable", required: true, failure: { requireComment: true, requirePhoto: false, createCorrective: true } },
      { type: "number", label: "Belt tension (lbs)", required: false, min: 40, max: 60 },
      { type: "photo", label: "Photo of belt surface", required: false },
    ],
  });

  // Work orders in every §20 state.
  const today = todayInTimezone(TZ);
  const woOpen = await createWorkOrder(adminId, {
    title: "Replace worn conveyor rollers",
    description: "Rollers 4–6 are squealing under load.",
    siteId: plant,
    locationId: floor1,
    assetIds: [conveyor],
    workType: "reactive",
    priority: "high",
    dueAt: new Date(Date.now() + 3 * 86400000),
  });
  void woOpen;
  const woOverdue = await createWorkOrder(adminId, {
    title: "Repair labeler jam sensor",
    siteId: plant,
    assetIds: [labeler],
    workType: "reactive",
    priority: "critical",
    assigneeIds: [tech2],
    dueAt: new Date(Date.now() - 2 * 86400000),
  });
  void woOverdue;
  const woInProgress = await createWorkOrder(mgr1, {
    title: "Compressor intake filter swap",
    siteId: plant,
    locationId: compressorRoom,
    assetIds: [compressor],
    workType: "preventive",
    priority: "medium",
    assigneeIds: [tech1],
    estimatedMinutes: 60,
  });
  await changeWorkOrderStatus(taylor, woInProgress, "in_progress");
  await addComment(taylor, "work_order", woInProgress, "Old filter was fully clogged — photo attached.");
  await createAttachment({
    actorId: tech1,
    entityType: "work_order",
    entityId: woInProgress,
    originalName: "before.png",
    mimeType: "image/png",
    data: PNG,
    category: "before",
  });
  const woOnHold = await createWorkOrder(mgr1, {
    title: "Forklift 3 annual service",
    siteId: depot,
    assetIds: [forklift],
    workType: "preventive",
    priority: "medium",
    assignedTeamId: teamId,
  });
  await changeWorkOrderStatus(admin, woOnHold, "on_hold", { note: "Waiting on parts quote" });
  const woDone = await createWorkOrder(mgr1, {
    title: "Grease line 1 bearings",
    siteId: plant,
    assetIds: [line1],
    workType: "preventive",
    priority: "low",
    assigneeIds: [tech1],
    plannedDowntimeMinutes: 30,
  });
  await changeWorkOrderStatus(taylor, woDone, "in_progress");
  await addLabor(taylor, woDone, { minutes: 45, note: "Greased all points" });
  await changeWorkOrderStatus(taylor, woDone, "completed", {
    completionNotes: "All zerks greased; no play detected.",
    actualDowntimeMinutes: 25,
  });

  // Planned downtime event (open WO with a downtime window).
  await createWorkOrder(mgr1, {
    title: "Line 1 gearbox swap (planned downtime)",
    siteId: plant,
    assetIds: [line1],
    workType: "project",
    priority: "high",
    assignedTeamId: teamId,
    plannedStartAt: new Date(Date.now() + 7 * 86400000),
    dueAt: new Date(Date.now() + 8 * 86400000),
    plannedDowntimeMinutes: 240,
  });

  // PM plan due tomorrow (floating) with procedure.
  await createPlan(adminId, {
    name: "Quarterly belt inspection",
    siteId: plant,
    assetId: conveyor,
    procedureTemplateId: beltProcedure,
    priority: "medium",
    basis: "floating",
    recurUnit: "month",
    recurInterval: 3,
    leadDays: 7,
    startDate: addDays(today, 1),
    assigneeIds: [tech1],
  });
  await runPmTick(); // generates it (inside the 7-day lead window)

  // Meter with history + trigger.
  const meter = await createMeter(adminId, {
    name: "Compressor run hours",
    unit: "hours",
    assetId: compressor,
    mustIncrease: true,
    warnThreshold: 4500,
    criticalThreshold: 4900,
  });
  for (const v of [4100, 4180, 4270, 4342, 4420]) {
    await addReading(taylor, meter, { value: v });
  }
  await createTrigger(adminId, meter, {
    name: "5000h overhaul",
    type: "threshold",
    threshold: 5000,
    skipIfOpen: true,
    woTitle: "Compressor 5000-hour overhaul",
    priority: "high",
    assignedTeamId: teamId,
  });

  // Work request from the requester.
  await createRequest({
    title: "Breakroom fridge leaking",
    description: "Puddle forms overnight near the door.",
    siteId: plant,
    locationId: bldgA,
    priority: "low",
    requesterId: req1,
    requesterName: "Riley Requester",
  });

  console.log("Seed complete.");
  console.log("Logins (see docs/ADMIN_GUIDE.md): admin/admin-demo-123, morgan/morgan-demo-123, taylor/taylor-demo-123, riley/riley-demo-123");
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
