import Link from "next/link";
import { getInvitationByToken } from "@/server/services/invitations";
import { getOrgSettings } from "@/server/services/org";
import { AcceptInvitationForm } from "./accept-form";

export const metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}

function Dead({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <h1 className="mb-2 text-xl font-bold">{title}</h1>
      <p className="text-sm text-gray-600">{body}</p>
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-blue-700 hover:underline">
          Go to sign in
        </Link>
      </p>
    </Shell>
  );
}

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inv = await getInvitationByToken(token);

  if (inv.state === "invalid") {
    return (
      <Dead
        title="This link isn't valid"
        body="Check that the whole link was copied, or ask your administrator to send a new invitation."
      />
    );
  }
  if (inv.state === "expired") {
    return (
      <Dead
        title="This invitation has expired"
        body="Ask your administrator to resend it — expired links can be re-issued in a few seconds."
      />
    );
  }
  if (inv.state === "revoked") {
    return (
      <Dead
        title="This invitation was revoked"
        body="Your administrator canceled this link. If that seems wrong, ask them for a new one."
      />
    );
  }
  if (inv.state !== "ok") {
    return (
      <Dead
        title="This invitation was already used"
        body="An account has already been set up with this link. Sign in instead — or if that wasn't you, tell your administrator immediately."
      />
    );
  }

  const org = await getOrgSettings();
  return (
    <Shell>
      <h1 className="mb-1 text-xl font-bold">Join {org.name}</h1>
      <p className="mb-4 text-sm text-gray-600">
        You&apos;ve been invited as a{" "}
        <span className="font-medium">{inv.role}</span> ({inv.email}). Set up
        your account below.
      </p>
      <AcceptInvitationForm
        token={token}
        suggestedUsername={inv.username}
        displayName={inv.displayName}
      />
    </Shell>
  );
}
