import Link from "next/link";
import type { LocationNode } from "@/server/services/locations";
import { Badge } from "@/components/ui";

/**
 * Nested location list, shared by the site detail page and the /locations
 * index. Archived nodes stay visible (history-safe archival) but are muted
 * and badged.
 */
export function LocationTree({
  nodes,
  siteId,
  canManage,
  depth = 0,
}: {
  nodes: LocationNode[];
  siteId: number;
  canManage: boolean;
  depth?: number;
}) {
  if (nodes.length === 0) return null;
  return (
    <ul className={depth > 0 ? "ml-4 border-l border-gray-200 pl-3" : ""}>
      {nodes.map((n) => (
        <li key={n.id} className="py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={n.isActive ? "font-medium" : "font-medium text-gray-400"}
            >
              {n.name}
            </span>
            {n.code ? (
              <span className="text-xs text-gray-400">{n.code}</span>
            ) : null}
            {!n.isActive ? <Badge tone="red">archived</Badge> : null}
            {canManage ? (
              <span className="flex gap-2 text-xs">
                <Link
                  href={`/locations/${n.id}/edit`}
                  className="text-brand-800 hover:underline"
                >
                  Edit
                </Link>
                {n.isActive ? (
                  <Link
                    href={`/sites/${siteId}/locations/new?parent=${n.id}`}
                    className="text-brand-800 hover:underline"
                  >
                    + Sub-location
                  </Link>
                ) : null}
              </span>
            ) : null}
          </div>
          <LocationTree
            nodes={n.children}
            siteId={siteId}
            canManage={canManage}
            depth={depth + 1}
          />
        </li>
      ))}
    </ul>
  );
}
