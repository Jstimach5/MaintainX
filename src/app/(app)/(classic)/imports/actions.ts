"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import {
  getJob,
  processImportJob,
  rollbackImport,
  saveMappingTemplate,
  validateJob,
} from "@/server/services/imports";
import { storage } from "@/server/storage";
import type { ActionResult } from "@/components/forms";

function friendly(err: unknown): ActionResult {
  if (err instanceof ServiceError || err instanceof AuthError) {
    return { error: err.message };
  }
  throw err;
}

async function readStoredFile(storedName: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of storage.createReadStream(storedName)) {
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

const validateSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  strategy: z.enum(["skip", "update", "new"]),
  mappingJson: z.string(),
  saveTemplateAs: z.string().trim().max(100).optional(),
});

export async function validateImportAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = validateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let mapping: Record<string, string>;
  try {
    mapping = z.record(z.string(), z.string()).parse(JSON.parse(parsed.data.mappingJson));
  } catch {
    return { error: "Invalid column mapping." };
  }
  const job = await getJob(parsed.data.jobId);
  if (!job) return { error: "Import not found." };
  try {
    const data = await readStoredFile(job.storedName);
    await validateJob(actor.id, job.id, mapping, parsed.data.strategy, data);
    if (parsed.data.saveTemplateAs) {
      await saveMappingTemplate(actor.id, parsed.data.saveTemplateAs, mapping);
    }
  } catch (err) {
    return friendly(err);
  }
  revalidatePath(`/imports/${job.id}`);
  redirect(`/imports/${job.id}`);
}

const startSchema = z.object({ jobId: z.coerce.number().int().positive() });

export async function startImportAction(formData: FormData): Promise<void> {
  await assertRole("admin");
  const { jobId } = startSchema.parse(Object.fromEntries(formData));
  // Fire-and-forget: the atomic validated→running claim inside
  // processImportJob makes double-starts harmless; progress is persisted
  // per-row so the UI can poll.
  void processImportJob(jobId).catch((err) =>
    console.error(`[import] job ${jobId} failed:`, err),
  );
  // Give tiny imports a moment to finish before first render.
  await new Promise((r) => setTimeout(r, 400));
  revalidatePath(`/imports/${jobId}`);
  redirect(`/imports/${jobId}`);
}

export async function rollbackImportAction(formData: FormData): Promise<void> {
  const actor = await assertRole("admin");
  const { jobId } = startSchema.parse(Object.fromEntries(formData));
  await rollbackImport(actor.id, jobId);
  revalidatePath(`/imports/${jobId}`);
  redirect(`/imports/${jobId}`);
}
