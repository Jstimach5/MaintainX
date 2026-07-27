"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { validateImportAction } from "./actions";
import { Button, Field, Input, Select } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV or XLSX file first.");
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const res = await fetch("/api/imports", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? "Upload failed");
      else router.push(`/imports/${body.id}`);
    } catch {
      setError("Upload failed — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="CSV or XLSX file"
        htmlFor="file"
        hint="First row must be column headers. Up to 50 MB / tens of thousands of rows."
      >
        <input
          ref={inputRef}
          id="file"
          type="file"
          accept=".csv,.xlsx"
          className="block w-full text-sm"
        />
      </Field>
      {error ? (
        <p data-testid="form-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Uploading…" : "Upload and continue"}
      </Button>
    </form>
  );
}

export function MappingForm({
  jobId,
  headers,
  initialMapping,
  fields,
  templates,
  strategy,
}: {
  jobId: number;
  headers: string[];
  initialMapping: Record<string, string>;
  fields: { key: string; label: string }[];
  templates: { name: string; mapping: Record<string, string> }[];
  strategy: string;
}) {
  const [state, formAction] = useActionState(validateImportAction, undefined);
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="mappingJson" value={JSON.stringify(mapping)} />
      {templates.length > 0 ? (
        <Field label="Load a saved mapping" htmlFor="template">
          <Select
            id="template"
            defaultValue=""
            onChange={(e) => {
              const t = templates.find((x) => x.name === e.target.value);
              if (t) setMapping(t.mapping);
            }}
          >
            <option value="">— Choose —</option>
            {templates.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
              <th className="px-3 py-2">File column</th>
              <th className="px-3 py-2">Imports as</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((h) => (
              <tr key={h} className="border-b border-gray-100">
                <td className="px-3 py-1.5 font-medium">{h}</td>
                <td className="px-3 py-1.5">
                  <Select
                    aria-label={`Map column ${h}`}
                    value={mapping[h] ?? ""}
                    onChange={(e) =>
                      setMapping((prev) => {
                        const next = { ...prev };
                        if (e.target.value) next[h] = e.target.value;
                        else delete next[h];
                        return next;
                      })
                    }
                  >
                    <option value="">— Ignore this column —</option>
                    {fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="When an External ID already exists"
          htmlFor="strategy"
          hint="Applies per row during import."
        >
          <Select id="strategy" name="strategy" defaultValue={strategy}>
            <option value="skip">Skip the row (no duplicates)</option>
            <option value="update">Update the existing work order</option>
            <option value="new">Import as a new work order anyway</option>
          </Select>
        </Field>
        <Field label="Save this mapping as (optional)" htmlFor="saveTemplateAs">
          <Input id="saveTemplateAs" name="saveTemplateAs" placeholder="e.g. Legacy CMMS export" />
        </Field>
      </div>
      <FormError message={state?.error} />
      <SubmitButton pendingText="Validating…">Validate file</SubmitButton>
    </form>
  );
}
