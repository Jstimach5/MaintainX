import { Badge } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { WO_STATUSES, woStatusLabel } from "@/server/services/workOrders";
import type {
  WoPriorityValue,
  WoStatusValue,
} from "@/server/services/workOrders";

const STATUS_TONES: Record<string, BadgeTone> = Object.fromEntries(
  WO_STATUSES.map((s) => [s.value, s.tone]),
);

const PRIORITY_TONES: Record<string, BadgeTone> = {
  none: "gray",
  low: "gray",
  medium: "blue",
  high: "amber",
  critical: "red",
};

export function WoStatusBadge({ status }: { status: WoStatusValue }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "gray"}>{woStatusLabel(status)}</Badge>
  );
}

export function WoPriorityBadge({ priority }: { priority: WoPriorityValue }) {
  if (priority === "none") return null;
  return <Badge tone={PRIORITY_TONES[priority] ?? "gray"}>{priority}</Badge>;
}
