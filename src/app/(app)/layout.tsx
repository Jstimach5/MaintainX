import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { AppNav } from "@/components/nav";
import { FieldNav } from "@/components/field-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Admin-set passwords are temporary: nothing inside the app is reachable
  // until the user picks their own (/change-password lives outside this
  // layout, so there is no redirect loop).
  if (user.mustChangePassword) redirect("/change-password");
  return (
    <div className="min-h-dvh">
      <AppNav user={user} />
      {/* pb clears the fixed field nav on small screens. */}
      <main className="mx-auto max-w-6xl p-4 pb-24 md:pb-4">{children}</main>
      <FieldNav user={user} />
    </div>
  );
}
