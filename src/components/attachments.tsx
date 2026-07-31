"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

export type AttachmentView = {
  id: number;
  category: string;
  originalName: string | null;
  mimeType: string;
  caption: string | null;
  uploadedByName?: string;
  createdAt: string; // preformatted for display
  isImage: boolean;
};

/**
 * Photo/file grid + uploader used on assets, work orders, and requests.
 * Uploads go through /api/attachments (multipart); the camera capture
 * attribute opens the rear camera directly on phones.
 */
export function AttachmentSection({
  entityType,
  entityId,
  attachments,
  category = "general",
  canUpload,
  title = "Pictures & files",
  captureOnly = false,
}: {
  entityType: string;
  entityId: number;
  attachments: AttachmentView[];
  category?: string;
  canUpload: boolean;
  title?: string;
  captureOnly?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("entityType", entityType);
    form.set("entityId", String(entityId));
    form.set("category", category);
    for (const f of Array.from(files)) form.append("files", f);
    try {
      const res = await fetch("/api/attachments", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Upload failed");
      } else {
        if (body.errors?.length) setError(body.errors.join("; "));
        router.refresh();
      }
    } catch {
      setError("Upload failed — check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const images = attachments.filter((a) => a.isImage);
  const files = attachments.filter((a) => !a.isImage);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {canUpload ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={captureOnly ? "image/*" : undefined}
              capture={captureOnly ? "environment" : undefined}
              className="hidden"
              onChange={(e) => onFilesChosen(e.target.files)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Uploading…" : "Add pictures / files"}
            </Button>
          </div>
        ) : null}
      </div>
      {error ? (
        <p
          data-testid="upload-error"
          className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {images.length === 0 && files.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing uploaded yet.</p>
      ) : (
        <>
          {images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {images.map((a) => (
                <a
                  key={a.id}
                  href={`/files/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative block aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100"
                  title={a.caption ?? a.originalName ?? undefined}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/files/${a.id}`}
                    alt={a.caption ?? a.originalName ?? "attachment"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {a.category !== "general" ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {a.category}
                    </span>
                  ) : null}
                </a>
              ))}
            </div>
          ) : null}
          {files.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {files.map((a) => (
                <li key={a.id} className="text-sm">
                  <a
                    href={`/files/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-800 hover:underline"
                  >
                    {a.originalName ?? `file-${a.id}`}
                  </a>
                  <span className="text-gray-400"> · {a.createdAt}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
