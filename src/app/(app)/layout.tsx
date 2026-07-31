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
      {/* Keyboard users reach the page without tabbing the whole nav. */}
      <a
        href="#main"
        className="sr-only rounded-md bg-brand-800 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <AppNav user={user} />
      {/* Gutters only — content width belongs to each page family's layout
          template. pb clears the fixed field nav on small screens. */}
      <main
        id="main"
        className="px-4 pt-4 pb-24 sm:px-6 md:pb-6 xl:px-8"
      >
        {children}
      </main>
      <FieldNav user={user} />
    </div>
  );
}
