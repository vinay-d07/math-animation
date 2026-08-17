import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";

/**
 * Service-role client — server-side only, never exposed to the browser.
 * Uploads/reads bypass Storage RLS policies, so this file must not be
 * imported from anything that ships to the client.
 */
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = env.SUPABASE_STORAGE_BUCKET;

/**
 * Uploads a rendered clip and returns its public URL. Replaces the old
 * local-disk OUTPUT_DIR store, which only worked for a single worker
 * container (see plan.md's "Object storage" note).
 */
export async function uploadRenderOutput(objectName: string, video: Buffer): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(objectName, video, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectName);
  return data.publicUrl;
}
