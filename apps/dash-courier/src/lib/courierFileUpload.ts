import { supabase } from '@/lib/supabase';

const BUCKET = 'courier-documents';

async function getUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

import { normalizeStoragePath } from '@/lib/normalizeStoragePath';
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
  return path;
}

export async function resolveCourierFileUrl(pathOrUrl: string): Promise<string | null> {
  const path = normalizeStoragePath(pathOrUrl);
  if (path.startsWith('http')) return path;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
