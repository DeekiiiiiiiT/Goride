import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import { uploadAndGetProofUrl } from '@/lib/courierFileUpload';

export type CourierDocType = 'drivers_license' | 'insurance' | 'background_check' | 'other';

export type CourierDocumentRow = {
  id: string;
  user_id: string;
  doc_type: CourierDocType;
  status: string;
  file_url: string | null;
  expiry_date: string | null;
};

async function getDeliveryClient() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return {
    session,
    delivery: createClient(`https://${projectId}.supabase.co`, publicAnonKey, {
      db: { schema: 'delivery' },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    }),
  };
}

export async function listCourierDocuments(): Promise<CourierDocumentRow[]> {
  const client = await getDeliveryClient();
  if (!client) return [];
  const { data, error } = await client.delivery
    .from('courier_documents')
    .select('id, user_id, doc_type, status, file_url, expiry_date')
    .eq('user_id', client.session.user.id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as CourierDocumentRow[];
}

export async function uploadCourierDocument(
  docType: CourierDocType,
  file: File,
  expiryDate?: string | null,
): Promise<{ ok: true; document: CourierDocumentRow } | { ok: false; error: string }> {
  const client = await getDeliveryClient();
  if (!client) return { ok: false, error: 'Not signed in' };

  const fileUrl = await uploadAndGetProofUrl(file, 'docs');
  if (!fileUrl) return { ok: false, error: 'Upload failed' };

  const { data: existing } = await client.delivery
    .from('courier_documents')
    .select('id')
    .eq('user_id', client.session.user.id)
    .eq('doc_type', docType)
    .maybeSingle();

  const payload = {
    user_id: client.session.user.id,
    doc_type: docType,
    status: 'pending',
    file_url: fileUrl,
    expiry_date: expiryDate || null,
    verified_at: null,
    verified_by: null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await client.delivery
      .from('courier_documents')
      .update(payload)
      .eq('id', existing.id)
      .select('id, user_id, doc_type, status, file_url, expiry_date')
      .single();
    if (error || !data) return { ok: false, error: error?.message || 'Update failed' };
    return { ok: true, document: data as CourierDocumentRow };
  }

  const { data, error } = await client.delivery
    .from('courier_documents')
    .insert(payload)
    .select('id, user_id, doc_type, status, file_url, expiry_date')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Insert failed' };
  return { ok: true, document: data as CourierDocumentRow };
}
