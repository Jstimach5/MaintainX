"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { reportViews } from "@/server/db/schema";

const saveSchema = z.object({
  name: z.string().trim().min(1).max(100),
  from: z.string().optional(),
  to: z.string().optional(),
  site: z.string().optional(),
});

/** Save the current /reports filter set under a name (§13 P1). */
export async function saveReportViewAction(formData: FormData): Promise<void> {
  const actor = await assertRole("admin", "manager");
  const parsed = saveSchema.parse(Object.fromEntries(formData));
  const params: Record<string, string> = {};
  if (parsed.from) params.from = parsed.from;
  if (parsed.to) params.to = parsed.to;
  if (parsed.site) params.site = parsed.site;
  await db
    .insert(reportViews)
    .values({ name: parsed.name, userId: actor.id, params })
    .onConflictDoUpdate({
      target: [reportViews.userId, reportViews.name],
      set: { params },
    });
  revalidatePath("/reports");
  redirect(`/reports?${new URLSearchParams(params).toString()}`);
}

const deleteSchema = z.object({ viewId: z.coerce.number().int().positive() });

export async function deleteReportViewAction(formData: FormData): Promise<void> {
  const actor = await assertRole("admin", "manager");
  const { viewId } = deleteSchema.parse(Object.fromEntries(formData));
  await db
    .delete(reportViews)
    .where(and(eq(reportViews.id, viewId), eq(reportViews.userId, actor.id)));
  revalidatePath("/reports");
}
