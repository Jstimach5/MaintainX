import { requireUser } from "@/server/auth/guards";
import { AppNav } from "@/components/nav";
import { FieldNav } from "@/components/field-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <AppNav user={user} />
      {/* pb clears the fixed field nav on small screens. */}
      <main className="mx-auto max-w-6xl p-4 pb-24 md:pb-4">{children}</main>
      <FieldNav user={user} />
    </div>
  );
}
