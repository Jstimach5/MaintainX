import type { SessionUser } from "@/server/auth/session";
import { todayInTimezone } from "@/lib/format";
import { listWorkOrders, type WorkOrderRow } from "./workOrders";
import { listRequests } from "./requests";

/**
 * Everything the field home screen needs, derived from the same list
 * services the desktop screens use — one place to change when statuses
 * grow, and no new query surface to keep permission-safe.
 */
export type FieldSummary = {
  mine: { wo: WorkOrderRow; siteName: string | null }[];
  today: WorkOrderRow[];
  overdue: WorkOrderRow[];
  inProgress: WorkOrderRow[];
  onHold: WorkOrderRow[];
  pmDue: WorkOrderRow[];
  available: WorkOrderRow[];
  myRequests: { id: number; requestNumber: string; title: string; status: string }[];
};

/**
 * A work order counts as "today" if it is due or planned to start today.
 * Both sides must be YYYY-MM-DD in the ORG timezone — `todayInTimezone`
 * produces that for an arbitrary instant; `formatDate` is the human
 * renderer ("Jul 28, 2026") and would never compare equal (DECISIONS.md #5).
 */
function isToday(wo: WorkOrderRow, today: string, tz: string): boolean {
  const due = wo.dueAt ? todayInTimezone(tz, wo.dueAt) : null;
  const start = wo.plannedStartAt
    ? todayInTimezone(tz, wo.plannedStartAt)
    : null;
  return due === today || start === today;
}

export async function fieldSummary(
  user: SessionUser,
  today: string,
  tz: string,
): Promise<FieldSummary> {
  const [mineRows, allRows, requestRows] = await Promise.all([
    listWorkOrders({ assigneeId: user.id }),
    // Unassigned work anyone may pick up; managers also use this for the
    // "available" tile. Open statuses only (listWorkOrders default).
    listWorkOrders({}),
    listRequests({ requesterId: user.id }),
  ]);

  const mine = mineRows.map((r) => ({ wo: r.wo, siteName: r.siteName }));
  const mineWos = mineRows.map((r) => r.wo);
  const now = new Date();

  return {
    mine,
    today: mineWos.filter((wo) => isToday(wo, today, tz)),
    overdue: mineWos.filter((wo) => wo.dueAt != null && wo.dueAt < now),
    inProgress: mineWos.filter((wo) => wo.status === "in_progress"),
    onHold: mineWos.filter((wo) => wo.status === "on_hold"),
    pmDue: mineWos.filter((wo) => wo.workType === "preventive"),
    available: allRows
      .filter(
        (r) => r.assignees.length === 0 && r.wo.assignedTeamId == null,
      )
      .map((r) => r.wo),
    myRequests: requestRows.map(({ request }) => ({
      id: request.id,
      requestNumber: request.requestNumber,
      title: request.title,
      status: request.status,
    })),
  };
}
