import { NextResponse } from "next/server";
import { getAssetByQrToken } from "@/server/services/assets";

/**
 * QR resolution: /a/<token> → the asset page (login required to view).
 * The P1 phase extends this with a limited public work-request flow.
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
  return NextResponse.redirect(new URL(`/assets/${asset.id}`, request.url));
}
