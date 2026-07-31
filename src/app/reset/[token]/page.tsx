import Link from "next/link";
import { getResetByToken } from "@/server/services/passwordReset";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await getResetByToken(token);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {reset.ok ? (
          <>
            <h1 className="mb-1 text-xl font-bold">Set a new password</h1>
            <p className="mb-4 text-sm text-gray-600">
              For the account <span className="font-medium">{reset.username}</span>.
              After saving you&apos;ll sign in again everywhere.
            </p>
            <ResetForm token={token} />
          </>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-bold">This link is no longer valid</h1>
            <p className="text-sm text-gray-600">
              Reset links work once and expire after an hour. Request a new
              one from the sign-in page.
            </p>
            <p className="mt-4 text-sm">
              <Link href="/forgot" className="text-brand-800 hover:underline">
                Request a new link
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
