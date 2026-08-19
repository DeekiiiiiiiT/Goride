import { supabase } from '@/lib/supabase';

const BUCKET = 'courier-documents';

async function getUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/** Upload under `{userId}/{folder}/{filename}` in courier-documents bucket; return signed URL. */
export async function uploadAndGetProofUrl(
  file: File,
  folder: 'proofs' | 'issues' | 'docs' | 'vehicles' | 'avatars' = 'proofs',
): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error) return null;

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signError || !data?.signedUrl) return path;
  return data.signedUrl;
}

export async function resolveCourierFileUrl(pathOrUrl: string): Promise<string | null> {
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pathOrUrl, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
