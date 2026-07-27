import { redirect } from "next/navigation";
import { getCurrentUser, isSetupMode } from "@/server/auth/guards";
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
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="mb-1 text-center text-2xl font-bold">Sign in</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        Maintenance Manager
      </p>
      <LoginForm next={next} />
    </main>
  );
}
