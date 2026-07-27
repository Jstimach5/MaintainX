import { auditEvents } from "@/server/db/schema";
import type { Db } from "@/server/db";

export type AuditInput = {
  userId: number | null;
  action: string;
  entityType: string;
  entityId: string | number;
  summary?: string;
  previousValue?: unknown;
  newValue?: unknown;
  source?: "web" | "portal" | "worker" | "import" | "system";
  correlationId?: string;
};

/**
 * Append an audit event (§14). Call inside the same transaction as the
 * mutation it describes so the event and the change commit atomically.
 * Accepts either the shared db or a transaction handle.
 */
export async function recordAudit(
  tx: Pick<Db, "insert">,
  input: AuditInput,
): Promise<void> {
  await tx.insert(auditEvents).values({
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: String(input.entityId),
    summary: input.summary,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    source: input.source ?? "web",
    correlationId: input.correlationId,
  });
}
