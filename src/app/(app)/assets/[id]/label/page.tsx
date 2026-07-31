import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRole } from "@/server/auth/guards";
import { getAsset } from "@/server/services/assets";
import { getOrgSettings } from "@/server/services/org";
import { SealTechLogo } from "@/components/brand";

export const metadata = { title: "QR label" };

/**
 * Printable QR label. The QR encodes /a/<qrToken> as a relative-origin URL
 * based on the request host, so labels work on whatever address the server
 * is reachable at. Scanning resolves to the asset page (login required).
 */
export default async function AssetLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin", "manager", "technician");
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId)) notFound();
  const asset = await getAsset(assetId);
  if (!asset) notFound();
  const org = await getOrgSettings();

  const path = `/a/${asset.qrToken}`;
  const svg = await QRCode.toString(path, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  return (
    <div className="mx-auto max-w-sm text-center print:max-w-none">
      <div className="rounded-lg border border-gray-300 bg-white p-6 print:border-2 print:border-black">
        {/*
          The logo lives inside the card, not the app header: the print
          stylesheet hides `header`/`nav`, so anything up there is absent
          from the paper label. Text-and-SVG only, so it survives a
          black-and-white printer.
        */}
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-300 pb-3 text-left">
          <SealTechLogo />
          <span className="text-xs font-semibold text-gray-600">
            {org.name}
          </span>
        </div>
        <div
          className="mx-auto w-60"
          // qrcode's SVG output is server-generated, deterministic markup.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="mt-3 text-lg font-bold">{asset.assetNumber}</p>
        <p className="text-sm">{asset.name}</p>
        <p className="mt-1 text-xs text-gray-500">
          Scan to open this asset. QR path: {path}
        </p>
      </div>
      <p className="mt-4 text-sm text-gray-500 print:hidden">
        Use your browser&apos;s Print function to print this label.
      </p>
    </div>
  );
}
