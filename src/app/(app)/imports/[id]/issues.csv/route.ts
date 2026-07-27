import { NextResponse } from "next/server";
import { assertRole, AuthError } from "@/server/auth/guards";
import { getJob, rowIssuesCsv } from "@/server/services/imports";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await assertRole("admin");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId) || !(await getJob(jobId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const csv = await rowIssuesCsv(jobId);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="import-${jobId}-issues.csv"`,
    },
  });
}
