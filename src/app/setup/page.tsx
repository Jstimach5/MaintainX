import { redirect } from "next/navigation";
import { isSetupMode } from "@/server/auth/guards";
import { SetupForm } from "./setup-form";

export const metadata = { title: "First-run setup" };

// The one-time-door decision depends on live DB state — never prerender it.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // One-time door: once any user exists this page is gone forever.
  if (!(await isSetupMode())) redirect("/login");

  const timezones = Intl.supportedValuesOf("timeZone");
  const serverGuess = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <h1 className="mb-1 text-center text-2xl font-bold">Welcome</h1>
      <p className="mb-6 text-center text-sm text-gray-600">
        Set up your organization and create the administrator account.
        Complete this now — until an administrator exists, anyone who can
        reach this server can claim it.
      </p>
      <SetupForm timezones={timezones} defaultTimezone={serverGuess} />
    </main>
  );
}
