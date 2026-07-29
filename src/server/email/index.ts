import nodemailer, { type Transporter } from "nodemailer";
import { appUrl } from "@/lib/app-url";

/**
 * Provider-independent email delivery (§launch). Modes:
 *
 * - **production send**: SMTP_HOST is set → real delivery via nodemailer.
 * - **dev mode**: SMTP_HOST unset (or EMAIL_MODE=dev) → messages are
 *   logged (subject + recipient only, never tokens) and reported as NOT
 *   sent, so callers fall back to the copy-link flow honestly. Dev mode
 *   never reports success — a console print is not a delivery.
 *
 * Tests inject a mock transporter via `setTransportForTests`.
 */

export type EmailResult = { ok: true } | { ok: false; error: string };

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

let testTransport: Transporter | null = null;

/** Test seam only — vitest injects a mock; production never calls this. */
export function setTransportForTests(t: Transporter | null): void {
  testTransport = t;
}

export function emailConfigured(): boolean {
  if (testTransport) return true;
  if (process.env.EMAIL_MODE === "dev") return false;
  return Boolean(process.env.SMTP_HOST);
}

function buildTransport(): Transporter {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // "secure" means implicit TLS (usually port 465); STARTTLS on 587 is
    // negotiated automatically when secure=false.
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: process.env.SMTP_USERNAME
      ? {
          user: process.env.SMTP_USERNAME,
          pass: process.env.SMTP_PASSWORD,
        }
      : undefined,
  });
}

function fromHeader(): string {
  const name = process.env.SMTP_FROM_NAME || "CMMS";
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME || "";
  return email ? `"${name.replace(/"/g, "")}" <${email}>` : name;
}

/**
 * Verify the SMTP connection/credentials without sending anything. Used
 * by the admin settings screen and deployment smoke checks.
 */
export async function verifyEmailConnection(): Promise<EmailResult> {
  if (testTransport) return { ok: true };
  if (!emailConfigured()) {
    return { ok: false, error: "Email is not configured (SMTP_HOST is empty)." };
  }
  try {
    await buildTransport().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlySmtpError(err) };
  }
}

/**
 * Send one message. Returns real success/failure — callers must handle
 * failure (keep invitations pending, surface the error, offer copy-link).
 */
export async function sendEmail(msg: OutgoingEmail): Promise<EmailResult> {
  const transport = testTransport ?? (emailConfigured() ? buildTransport() : null);
  if (!transport) {
    // Dev mode: visible in logs, honest about not delivering.
    console.log(`[email:dev] would send "${msg.subject}" to ${msg.to} (no SMTP configured)`);
    return { ok: false, error: "Email is not configured — copy the link instead." };
  }
  try {
    await transport.sendMail({
      from: fromHeader(),
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    console.log(`[email] sent "${msg.subject}" to ${msg.to}`);
    return { ok: true };
  } catch (err) {
    // Log the failure class, never message bodies (they contain tokens).
    console.error(`[email] FAILED "${msg.subject}" to ${msg.to}: ${friendlySmtpError(err)}`);
    return { ok: false, error: friendlySmtpError(err) };
  }
}

function friendlySmtpError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Never propagate credentials that some servers echo back.
  return raw.replace(/AUTH\s+\S+\s+\S+/gi, "AUTH …").slice(0, 300);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared minimal HTML shell — renders fine in every client. */
function shell(orgName: string, bodyHtml: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
<h2 style="margin:0 0 16px">${escapeHtml(orgName)}</h2>
${bodyHtml}
<p style="margin-top:24px;color:#666;font-size:13px">This message was sent by your organization's maintenance system. If you weren't expecting it, you can ignore it.</p>
</div>`;
}

export function invitationEmail(input: {
  orgName: string;
  displayName: string;
  invitedByName: string;
  role: string;
  personalMessage?: string | null;
  token: string;
  expiresAt: Date;
}): OutgoingEmail {
  const link = appUrl(`/invite/${input.token}`);
  const expires = input.expiresAt.toUTCString();
  const msg = input.personalMessage?.trim();
  return {
    to: "", // caller fills
    subject: `${input.orgName}: you're invited to the maintenance system`,
    text: [
      `Hi ${input.displayName},`,
      ``,
      `${input.invitedByName} invited you to ${input.orgName}'s maintenance system as a ${input.role}.`,
      ...(msg ? [``, `"${msg}"`] : []),
      ``,
      `Set up your account here:`,
      link,
      ``,
      `This link expires ${expires} and can be used once.`,
    ].join("\n"),
    html: shell(
      input.orgName,
      `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>${escapeHtml(input.invitedByName)} invited you to <strong>${escapeHtml(input.orgName)}</strong>'s maintenance system as a <strong>${escapeHtml(input.role)}</strong>.</p>
${msg ? `<p style="border-left:3px solid #ccc;padding-left:12px;color:#444">${escapeHtml(msg)}</p>` : ""}
<p><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Set up your account</a></p>
<p style="font-size:13px;color:#666">Or paste this link into your browser:<br>${link}</p>
<p style="font-size:13px;color:#666">This link expires ${expires} and can be used once.</p>`,
    ),
  };
}

export function passwordResetEmail(input: {
  orgName: string;
  displayName: string;
  token: string;
  expiresAt: Date;
}): OutgoingEmail {
  const link = appUrl(`/reset/${input.token}`);
  const expires = input.expiresAt.toUTCString();
  return {
    to: "",
    subject: `${input.orgName}: password reset`,
    text: [
      `Hi ${input.displayName},`,
      ``,
      `Someone asked to reset the password for your ${input.orgName} maintenance account.`,
      `If that was you, set a new password here:`,
      link,
      ``,
      `This link expires ${expires} and can be used once. If you didn't ask for this, ignore this message — your password is unchanged.`,
    ].join("\n"),
    html: shell(
      input.orgName,
      `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>Someone asked to reset the password for your <strong>${escapeHtml(input.orgName)}</strong> maintenance account.</p>
<p><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Set a new password</a></p>
<p style="font-size:13px;color:#666">Or paste this link into your browser:<br>${link}</p>
<p style="font-size:13px;color:#666">This link expires ${expires} and can be used once. If you didn't ask for this, ignore this message — your password is unchanged.</p>`,
    ),
  };
}
