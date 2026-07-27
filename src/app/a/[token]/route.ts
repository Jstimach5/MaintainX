import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { sites } from "@/server/db/schema";
import { getAssetByQrToken } from "@/server/services/assets";
import { getCurrentUser } from "@/server/auth/guards";

/**
 * QR resolution (P1 flow complete):
 * - signed-in staff → the asset page
 * - anyone else, when the asset's site has a public portal → the portal's
 *   limited request form, asset preselected
 * - otherwise → login, continuing to the asset afterwards
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(token)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const asset = await getAssetByQrToken(token);
  if (!asset) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const user = await getCurrentUser();
  if (user && user.role !== "requester") {
    return NextResponse.redirect(new URL(`/assets/${asset.id}`, request.url));
  }
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.id, asset.siteId))
    .limit(1);
  if (site?.portalToken && site.isActive) {
    return NextResponse.redirect(
      new URL(`/portal/${site.portalToken}?asset=${asset.id}`, request.url),
    );
  }
  return NextResponse.redirect(new URL(`/login`, request.url));
}
