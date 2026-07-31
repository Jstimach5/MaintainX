import { Boxes, Gauge, Truck, Wrench } from "@/components/icons";

/**
 * Asset thumbnail for list rows: the asset's photo when one exists, and
 * otherwise an icon chosen from its type — so a row is recognisable at a
 * glance in the field even when nobody has photographed the machine.
 */
function iconFor(assetType: string | null) {
  const t = (assetType ?? "").toLowerCase();
  const cls = "h-5 w-5";
  if (/compressor|pump|meter|boiler|hvac|chiller/.test(t))
    return <Gauge className={cls} />;
  if (/vehicle|truck|forklift|van|trailer/.test(t))
    return <Truck className={cls} />;
  if (/line|conveyor|labeler|machine|press|mill/.test(t))
    return <Wrench className={cls} />;
  return <Boxes className={cls} />;
}

export function AssetThumb({
  attachmentId,
  assetType,
  className = "h-10 w-10",
}: {
  attachmentId?: number;
  assetType: string | null;
  className?: string;
}) {
  if (attachmentId != null) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user upload served by /files/[id]
      <img
        src={`/files/${attachmentId}`}
        alt=""
        className={`${className} shrink-0 rounded-md object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700`}
    >
      {iconFor(assetType)}
    </span>
  );
}
