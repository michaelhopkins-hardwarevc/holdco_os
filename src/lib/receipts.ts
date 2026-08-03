import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Receipts live in a private Supabase Storage bucket; upload and signed-URL
// access run server-side with the service role.
const BUCKET = "receipts";

export async function uploadReceipt(
  entityId: string,
  file: File,
): Promise<string> {
  const admin = createAdminClient();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "receipt";
  const path = `${entityId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) throw new Error(`Receipt upload failed: ${error.message}`);
  return path;
}

export async function signedReceiptUrl(
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  return error || !data ? null : data.signedUrl;
}
