import { redirect } from "next/navigation";
import { getCurrentUser, isSetupMode } from "@/server/auth/guards";

// Routing decision depends on live DB and session state.
export const dynamic = "force-dynamic";

export default async function RootPage() {
  if (await isSetupMode()) redirect("/setup");
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
