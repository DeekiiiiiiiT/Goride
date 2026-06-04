export type PlayStoreChecklistStatus = 'todo' | 'done' | 'na';

export type PlayStoreChecklistGroup = 'app_content' | 'store_listing' | 'testing_release';

export type PlayStoreReleaseTrack = 'internal' | 'closed' | 'open' | 'production';

export interface PlayStoreChecklistItemDef {
  id: string;
  label: string;
  group: PlayStoreChecklistGroup;
  playConsoleHint: string;
  optional?: boolean;
}

export interface PlayStoreChecklistItemState {
  status: PlayStoreChecklistStatus;
  notes?: string;
  completedAt?: string;
}

export type PlayStoreChecklistState = Record<string, PlayStoreChecklistItemState>;

export interface PlayStoreReleaseRow {
  id: string;
  version_name: string;
  version_code: number;
  track: PlayStoreReleaseTrack;
  uploaded_at: string;
  notes: string | null;
  created_at: string;
}

export interface PlayStoreProductMeta {
  productLabel: string;
  packageId: string;
  privacyPolicyUrl: string;
  supabaseRedirectUrl: string;
  reviewerEmail: string;
  reviewerPassword: string;
  reviewerSteps: string;
  repoVersionName: string;
  repoVersionCode: number;
  playConsoleUrl: string;
}

export interface PlayStoreLaunchPayload {
  meta: PlayStoreProductMeta;
  catalog: PlayStoreChecklistItemDef[];
  checklist: PlayStoreChecklistState;
  data_safety_notes: string | null;
  releases: PlayStoreReleaseRow[];
  progress: { done: number; total: number; percent: number };
}

export interface PlayStoreChecklistPatch {
  itemId: string;
  status: PlayStoreChecklistStatus;
  notes?: string;
}

export interface PlayStoreReleaseInput {
  version_name: string;
  version_code: number;
  track: PlayStoreReleaseTrack;
  uploaded_at: string;
  notes?: string;
}
