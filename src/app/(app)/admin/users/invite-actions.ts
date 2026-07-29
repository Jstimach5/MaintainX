"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole, AuthError } from "@/server/auth/guards";
import { ServiceError } from "@/server/services/users";
import {
  createInvitation,
  invitationLink,
  recordInvitationSend,
  reissueInvitation,
  revokeInvitation,
} from "@/server/services/invitations";
import { emailConfigured, invitationEmail, sendEmail } from "@/server/email";
import { readOrgSettings } from "@/server/services/org";

/**
 * The raw invitation link appears ONLY in this action's return value —
 * rendered once to the admin who triggered it, never stored, never
 * shown again (a resend mints a new token).
 */
export type InviteResult =
  | undefined
  | {
      error?: string;
      link?: string;
      email?: string;
      emailStatus?: "sent" | "failed" | "not_configured";
      emailError?: string;
    };

const inviteSchema = z.object({
  email: z.string().trim().min(3, "Email is required").max(300),
  displayName: z.string().trim().min(1, "Display name is required").max(200),
  username: z.string().trim().max(50).optional(),
  role: z.enum(["admin", "manager", "technician", "requester"]),
  teamId: z
    .union([z.literal(""), z.coerce.number().int().positive()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  personalMessage: z.string().trim().max(1000).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
  sendEmail: z.string().optional(),
});

async function deliver(
  invitationId: number,
  token: string,
  expiresAt: Date,
  to: string,
  displayName: string,
  role: string,
  personalMessage: string | null,
  invitedByName: string,
): Promise<{ status: "sent" | "failed" | "not_configured"; error?: string }> {
  if (!emailConfigured()) return { status: "not_configured" };
  const org = await readOrgSettings();
  const msg = invitationEmail({
    orgName: org.name,
    displayName,
    invitedByName,
    role,
    personalMessage,
    token,
    expiresAt,
  });
  const result = await sendEmail({ ...msg, to });
  await recordInvitationSend(invitationId, result);
  return result.ok ? { status: "sent" } : { status: "failed", error: result.error };
}

export async function createInvitationAction(
  _prev: InviteResult,
  formData: FormData,
): Promise<InviteResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const { id, token, expiresAt } = await createInvitation(actor.id, {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      username: parsed.data.username || null,
      role: parsed.data.role,
      teamId: parsed.data.teamId,
      personalMessage: parsed.data.personalMessage || null,
      expiresInDays: parsed.data.expiresInDays,
    });
    const wantEmail = parsed.data.sendEmail === "1";
    const delivery = wantEmail
      ? await deliver(
          id,
          token,
          expiresAt,
          parsed.data.email.trim().toLowerCase(),
          parsed.data.displayName,
          parsed.data.role,
          parsed.data.personalMessage || null,
          actor.displayName,
        )
      : ({ status: "not_configured" } as const);
    revalidatePath("/admin/users");
    return {
      link: invitationLink(token),
      email: parsed.data.email.trim().toLowerCase(),
      emailStatus: delivery.status,
      emailError: delivery.status === "failed" ? delivery.error : undefined,
    };
  } catch (err) {
    if (err instanceof ServiceError || err instanceof AuthError) {
      return { error: err.message };
    }
    throw err;
  }
}

const reissueSchema = z.object({
  invitationId: z.coerce.number().int().positive(),
  sendEmail: z.string().optional(),
});

export async function reissueInvitationAction(
  _prev: InviteResult,
  formData: FormData,
): Promise<InviteResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = reissueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };
  try {
    const { listInvitations } = await import("@/server/services/invitations");
    const all = await listInvitations();
    const target = all.find((i) => i.inv.id === parsed.data.invitationId);
    if (!target) return { error: "Invitation not found." };
    const { token, expiresAt } = await reissueInvitation(
      actor.id,
      parsed.data.invitationId,
    );
    const delivery =
      parsed.data.sendEmail === "1"
        ? await deliver(
            target.inv.id,
            token,
            expiresAt,
            target.inv.email,
            target.inv.displayName,
            target.inv.role,
            target.inv.personalMessage,
            actor.displayName,
          )
        : ({ status: "not_configured" } as const);
    revalidatePath("/admin/users");
    return {
      link: invitationLink(token),
      email: target.inv.email,
      emailStatus: delivery.status,
      emailError: delivery.status === "failed" ? delivery.error : undefined,
    };
  } catch (err) {
    if (err instanceof ServiceError || err instanceof AuthError) {
      return { error: err.message };
    }
    throw err;
  }
}

const revokeSchema = z.object({ invitationId: z.coerce.number().int().positive() });

export async function revokeInvitationAction(
  _prev: InviteResult,
  formData: FormData,
): Promise<InviteResult> {
  const actor = await assertRole("admin").catch(() => null);
  if (!actor) return { error: "Not allowed." };
  const parsed = revokeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input" };
  try {
    await revokeInvitation(actor.id, parsed.data.invitationId);
  } catch (err) {
    if (err instanceof ServiceError || err instanceof AuthError) {
      return { error: err.message };
    }
    throw err;
  }
  revalidatePath("/admin/users");
  return {};
}
