import { redirect } from "next/navigation";
import { getCurrentUser, isSetupMode } from "@/server/auth/guards";
import { getOrgNameForMetadata } from "@/server/services/org";
import { SealTechLogo } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

// Depends on live DB state (setup mode) and the session cookie.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isSetupMode()) redirect("/setup");
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  const orgName = await getOrgNameForMetadata();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <div className="mb-6 flex flex-col items-center gap-3">
        <SealTechLogo className="scale-125" />
        <h1 className="text-center text-2xl font-bold">Sign in</h1>
        <p className="-mt-2 text-center text-sm text-gray-600">{orgName}</p>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
