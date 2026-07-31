"use client";

import { useActionState, useState } from "react";
import {
  createInvitationAction,
  reissueInvitationAction,
  revokeInvitationAction,
  type InviteResult,
} from "./invite-actions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied ✓" : "Copy link"}
    </Button>
  );
}

/**
 * Shown exactly once, immediately after create/resend — the token is
 * never displayed again (a resend mints a new one).
 */
function LinkReveal({ result }: { result: InviteResult }) {
  if (!result?.link) return null;
  return (
    <div
      className="mt-3 space-y-2 rounded-md border border-green-300 bg-green-50 p-3"
      data-testid="invite-link-reveal"
    >
      <p className="text-sm font-semibold text-green-900">
        Invitation ready for {result.email}
      </p>
      {result.emailStatus === "sent" ? (
        <p className="text-sm text-green-800">✉️ Invitation email delivered.</p>
      ) : result.emailStatus === "failed" ? (
        <p className="text-sm text-amber-800">
          ⚠ Email failed ({result.emailError}). The invitation is still valid —
          copy the link below and send it another way.
        </p>
      ) : (
        <p className="text-sm text-green-800">
          Email is not configured — copy the link and send it by text or
          another approved method.
        </p>
      )}
      <p className="break-all rounded bg-white p-2 font-mono text-xs" data-testid="invite-link">
        {result.link}
      </p>
      <CopyButton text={result.link} />
      <p className="text-xs text-green-700">
        This link is shown once. Anyone with it can create the account, so
        share it only with the person you invited.
      </p>
    </div>
  );
}

export function InviteUserForm({
  teams,
}: {
  teams: { id: number; name: string }[];
}) {
  const [state, formAction] = useActionState(createInvitationAction, undefined);
  return (
    <div>
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email address" htmlFor="inv-email" required>
            <Input id="inv-email" name="email" type="email" required />
          </Field>
          <Field label="Display name" htmlFor="inv-name" required>
            <Input id="inv-name" name="displayName" required placeholder="e.g. Chris Carter" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Username"
            htmlFor="inv-username"
            hint="Leave blank to let them choose"
          >
            <Input id="inv-username" name="username" />
          </Field>
          <Field label="Role" htmlFor="inv-role" required>
            <Select id="inv-role" name="role" defaultValue="technician">
              <option value="admin">Administrator</option>
              <option value="manager">Manager</option>
              <option value="technician">Technician</option>
              <option value="requester">Requester</option>
            </Select>
          </Field>
          <Field label="Team" htmlFor="inv-team">
            <Select id="inv-team" name="teamId" defaultValue="">
              <option value="">— None —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Personal message" htmlFor="inv-msg" hint="Included in the invitation (optional)">
          <Textarea id="inv-msg" name="personalMessage" rows={2} />
        </Field>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Expires in (days)" htmlFor="inv-days">
            <Input
              id="inv-days"
              name="expiresInDays"
              type="number"
              min={1}
              max={30}
              defaultValue={7}
              className="w-24"
            />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="sendEmail" value="1" defaultChecked className="h-4 w-4" />
            Send the invitation email now
          </label>
          <SubmitButton>Create invitation</SubmitButton>
        </div>
        <FormError message={state?.error} />
      </form>
      <LinkReveal result={state} />
    </div>
  );
}

export function ReissueButton({ invitationId }: { invitationId: number }) {
  const [state, formAction] = useActionState(reissueInvitationAction, undefined);
  return (
    <div>
      <form action={formAction} className="inline">
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="sendEmail" value="1" />
        <button type="submit" className="text-sm text-blue-700 hover:underline">
          Resend
        </button>
      </form>
      <FormError message={state?.error} />
      <LinkReveal result={state} />
    </div>
  );
}

export function RevokeButton({ invitationId }: { invitationId: number }) {
  const [state, formAction] = useActionState(revokeInvitationAction, undefined);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="invitationId" value={invitationId} />
      <button
        type="submit"
        className="text-sm text-red-700 hover:underline"
        title={state?.error}
      >
        Revoke
      </button>
    </form>
  );
}
