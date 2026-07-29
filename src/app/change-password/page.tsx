import { requireUser } from "@/server/auth/guards";
import { ChangePasswordForm } from "./change-form";

export const metadata = { title: "Change password" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">
          {user.mustChangePassword ? "Choose your own password" : "Change password"}
        </h1>
        <p className="mb-4 text-sm text-gray-600">
          {user.mustChangePassword
            ? "The password you signed in with was set by an administrator, so it's temporary. Pick your own to continue."
            : "You'll stay signed in here; other devices are signed out."}
        </p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
