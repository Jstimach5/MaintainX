import type { Metadata, Viewport } from "next";
import { getOrgNameForMetadata } from "@/server/services/org";
import "./globals.css";

/**
 * The browser tab carries the customer's name, not the product's. Read
 * through the tagged cache in `org.ts` — root metadata runs on every
 * navigation, so this must not be a per-request query.
 */
export async function generateMetadata(): Promise<Metadata> {
  const name = await getOrgNameForMetadata();
  return {
    title: { default: name, template: `%s · ${name}` },
    description: "Asset, maintenance, and work-order management",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
