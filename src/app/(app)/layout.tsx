import { requireUser } from "@/server/auth/guards";
import { AppNav } from "@/components/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <AppNav user={user} />
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
