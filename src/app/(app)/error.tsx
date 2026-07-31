"use client";

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";
import { TriangleAlert } from "@/components/icons";

/**
 * Route error boundary for the authenticated app: a plain-language message
 * and a retry, instead of the framework's blank error screen.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server logs carry the real stack; this is just for local debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto mt-12 max-w-md">
      <Card className="p-6 text-center">
        <TriangleAlert
          aria-hidden
          className="mx-auto h-8 w-8 text-amber-500"
        />
        <h1 className="mt-2 text-lg font-bold">Something went wrong</h1>
        <p className="mt-1 text-sm text-gray-500">
          The page hit an unexpected error. Your data is safe — try again, or
          head back to the dashboard.
          {error.digest ? (
            <span className="mt-1 block text-xs text-gray-500">
              Reference: {error.digest}
            </span>
          ) : null}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </div>
      </Card>
    </div>
  );
}
