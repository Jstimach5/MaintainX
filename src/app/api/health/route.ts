import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + database health. 200 when the app can query Postgres,
 * 503 otherwise. Consumed by the Docker healthcheck (compose restarts an
 * unhealthy app) and by anyone curling the URL. Deliberately unauthenticated
 * and content-free: it reveals nothing but up/down.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: true });
  } catch {
    return NextResponse.json(
      { ok: false, db: false },
      { status: 503 },
    );
  }
}
