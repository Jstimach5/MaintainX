import { listSites } from "@/server/services/sites";
import { listLocationOptions } from "@/server/services/locations";
import { listAssets } from "@/server/services/assets";
import { listTeams } from "@/server/services/teams";
import { listUsers } from "@/server/services/users";
export type SiteOption = { id: number; name: string };
export type LocOption = { id: number; label: string; depth: number };
export type PickerData = {
  sites: SiteOption[];
  locationsBySite: Record<number, LocOption[]>;
};

/** Site + per-site location options for dependent selects (server-side). */
export async function buildPickerData(): Promise<PickerData> {
  const sites = await listSites({ activeOnly: true });
  const locationsBySite: PickerData["locationsBySite"] = {};
  for (const site of sites) {
    locationsBySite[site.id] = await listLocationOptions(site.id);
  }
  return {
    sites: sites.map((s) => ({ id: s.id, name: s.name })),
    locationsBySite,
  };
}

export async function buildAssetFormData() {
  const [picker, assetRows, teams, userRows] = await Promise.all([
    buildPickerData(),
    listAssets({}),
    listTeams(),
    listUsers(),
  ]);
  return {
    picker,
    parentOptions: assetRows.map((r) => ({
      id: r.asset.id,
      label: `${r.asset.assetNumber} · ${r.asset.name}`,
    })),
    teams: teams
      .filter((t) => t.isActive)
      .map((t) => ({ id: t.id, name: t.name })),
    people: userRows
      .filter((u) => u.isActive && u.role !== "requester")
      .map((u) => ({ id: u.id, displayName: u.displayName })),
  };
}
