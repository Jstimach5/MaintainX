import Link from "next/link";
import { buttonClasses } from "@/components/ui";
import { SealTechLogo } from "@/components/brand";

/**
 * 404 for any address that does not resolve. Without this the framework
 * default renders — unstyled, unbranded, and with no way back.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6 text-center">
      <SealTechLogo className="mx-auto mb-6" />
      {/* brand-900, not 700: 14px semibold is normal text to WCAG, and
          brand-700 is 4.1:1 on white — below the 4.5:1 floor. */}
      <p className="text-sm font-semibold tracking-wide text-brand-900 uppercase">
        404
      </p>
      <h1 className="mt-1 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-gray-500">
        That address doesn&apos;t exist. It may have been renamed, or the
        record it pointed at was removed.
      </p>
      <p className="mt-6">
        <Link href="/dashboard" className={buttonClasses("primary")}>
          Back to dashboard
        </Link>
      </p>
    </main>
  );
}
