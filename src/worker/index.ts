/**
 * Background worker process.
 *
 * Runs pg-boss queues for: preventive-maintenance generation, meter trigger
 * evaluation, bulk import jobs, and notification fan-out. Started with
 * `npm run worker` (or the `worker` service in docker-compose).
 *
 * Job handlers are registered here as the corresponding phases are built.
 */
import { PgBoss } from "pg-boss";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  const boss = new PgBoss({
    connectionString,
    schema: "pgboss",
  });

  boss.on("error", (err: Error) => {
    console.error("[worker] pg-boss error:", err);
  });

  await boss.start();
  console.log("[worker] started; waiting for jobs");

  // Housekeeping: purge expired sessions hourly.
  const HOUSEKEEPING = "housekeeping";
  await boss.createQueue(HOUSEKEEPING);
  await boss.schedule(HOUSEKEEPING, "0 * * * *");
  await boss.work(HOUSEKEEPING, async () => {
    const { purgeExpiredSessions } = await import(
      "@/server/auth/session"
    );
    await purgeExpiredSessions();
    console.log("[worker] housekeeping: expired sessions purged");
  });

  // PM generation: hourly cron + one run at worker start (§9). The tick is
  // idempotent (unique occurrence keys), so overlapping runs are safe.
  const PM_QUEUE = "pm-scheduler";
  await boss.createQueue(PM_QUEUE);
  await boss.schedule(PM_QUEUE, "0 * * * *");
  await boss.work(PM_QUEUE, async () => {
    const { runPmTick } = await import("@/server/services/pm");
    const result = await runPmTick();
    if (result.generated > 0 || result.repaired > 0) {
      console.log(
        `[worker] pm tick: generated ${result.generated}, repaired ${result.repaired}`,
      );
    }
  });
  await boss.send(PM_QUEUE, {}); // startup catch-up run

  // Job registrations still to come:
  //  - meter-eval     (Phase 8)
  //  - import-run     (Phase 10)

  const shutdown = async (signal: string) => {
    console.log(`[worker] received ${signal}, stopping…`);
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
