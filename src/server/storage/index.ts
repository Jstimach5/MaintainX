import fs from "fs";
import fsp from "fs/promises";
import path from "path";

/**
 * File storage behind a small adapter so an S3-compatible driver can be
 * added later without touching callers (DECISIONS.md #1). Keys are
 * server-generated (`<uuid>.<ext>`) — never derived from client filenames —
 * and sharded into two-char subdirectories to keep directories small.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  createReadStream(key: string): fs.ReadStream;
  exists(key: string): Promise<boolean>;
}

function storageRoot(): string {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

function keyToPath(key: string): string {
  // key is always "<uuid>.<ext>" (validated below); shard by first 2 chars.
  if (!/^[a-f0-9-]{36}\.[a-z0-9]{1,8}$/i.test(key)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return path.join(storageRoot(), key.slice(0, 2), key);
}

class LocalDiskAdapter implements StorageAdapter {
  async put(key: string, data: Buffer): Promise<void> {
    const target = keyToPath(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, data);
  }

  async delete(key: string): Promise<void> {
    try {
      await fsp.unlink(keyToPath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  createReadStream(key: string): fs.ReadStream {
    return fs.createReadStream(keyToPath(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsp.access(keyToPath(key));
      return true;
    } catch {
      return false;
    }
  }
}

export const storage: StorageAdapter = new LocalDiskAdapter();

/**
 * Upload validation (§7/§16): images broadly, plus common shop documents.
 * Executables and scripts are impossible by construction — anything not in
 * this allowlist is rejected, and the stored extension comes from the
 * allowlist, never the client filename.
 */
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);
