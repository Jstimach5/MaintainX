import { buildPickerData } from "@/server/services/pickers";
import { listAssets } from "@/server/services/assets";
import { listTeams } from "@/server/services/teams";
import { listUsers } from "@/server/services/users";
import {
  WO_PRIORITIES,
  WO_TYPES,
  listWorkOrders,
} from "@/server/services/workOrders";
import type { WoFormData } from "./wo-forms";

export async function buildWoFormData(): Promise<WoFormData> {
  const [picker, assetRows, teams, userRows, openWos] = await Promise.all([
    buildPickerData(),
    listAssets({}),
    listTeams(),
    listUsers(),
    listWorkOrders({ status: "open_group" }),
  ]);
  const assetsBySite: WoFormData["assetsBySite"] = {};
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
    types: WO_TYPES.map((t) => ({ value: t.value, label: t.label })),
    priorities: WO_PRIORITIES.map((p) => ({ value: p.value, label: p.label })),
    parentOptions: openWos.map((r) => ({
      id: r.wo.id,
      label: `${r.wo.woNumber} · ${r.wo.title}`,
    })),
  };
}
