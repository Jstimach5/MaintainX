"use client";

import { Button } from "./ui";

export function PrintButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="print:hidden"
      onClick={() => window.print()}
    >
      Print / PDF
    </Button>
  );
}
