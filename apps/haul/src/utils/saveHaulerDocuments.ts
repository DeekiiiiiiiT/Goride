import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase/client';
import type { DocumentSlotKey } from '../lib/haulDocumentsDraft';
import { clearDocumentsDraft } from '../lib/haulDocumentsDraft';

export type DocumentUploads = Partial<Record<DocumentSlotKey, File>>;

async function uploadDocument(userId: string, slot: DocumentSlotKey, file: File): Promise<void> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${slot}.${ext}`;
  const { error } = await supabase.storage.from('driver-documents').upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) {
    console.warn(`document upload ${slot}:`, error.message);
  }
}

export async function saveHaulerDocuments(
  user: User,
  uploads: DocumentUploads,
  consent: boolean,
): Promise<void> {
  const entries = Object.entries(uploads) as [DocumentSlotKey, File][];
  await Promise.all(entries.map(([slot, file]) => uploadDocument(user.id, slot, file)));

  const { error } = await supabase
    .from('driver_profiles')
    .update({
      background_check_status: consent ? 'pending' : null,
      onboarding_step: 'permissions',
    })
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  clearDocumentsDraft();
}

export async function completeHaulerOnboarding(userId: string): Promise<void> {
  const { error } = await supabase
    .from('driver_profiles')
    .update({
      onboarding_complete: true,
      onboarding_step: null,
    })
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}
