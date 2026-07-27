import { buildPickerData } from "../assets/picker";
import { listAssets } from "@/server/services/assets";
import { listTeams } from "@/server/services/teams";
import { listUsers } from "@/server/services/users";
import { listTemplates } from "@/server/services/procedures";
import type { PlanFormData } from "./plan-form";

export async function buildPlanFormData(): Promise<PlanFormData> {
  const [picker, assetRows, teams, userRows, templates] = await Promise.all([
    buildPickerData(),
    listAssets({}),
    listTeams(),
    listUsers(),
    listTemplates(),
  ]);
  const assetsBySite: PlanFormData["assetsBySite"] = {};
  for (const r of assetRows) {
    (assetsBySite[r.asset.siteId] ??= []).push({
      id: r.asset.id,
      label: `${r.asset.assetNumber} · ${r.asset.name}`,
    });
  }
  return {
    picker,
    assetsBySite,
    teams: teams.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name })),
    people: userRows
      .filter((u) => u.isActive && u.role !== "requester")
      .map((u) => ({ id: u.id, displayName: u.displayName })),
    procedures: templates
      .filter((t) => t.isActive)
      .map((t) => ({ id: t.id, name: t.name })),
  };
}
