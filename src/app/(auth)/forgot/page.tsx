import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">Forgot your password?</h1>
        <p className="mb-4 text-sm text-gray-600">
          Enter your username or email. If it matches an account with an
          email address, a reset link will be sent to it.
        </p>
        <ForgotForm />
        <p className="mt-4 text-sm">
          <Link href="/login" className="text-brand-800 hover:underline">
            Back to sign in
          </Link>
        </p>
        <p className="mt-2 text-xs text-gray-500">
          No email on your account? Your administrator can reset your
          password from Admin → Users.
        </p>
      </div>
    </main>
  );
}
