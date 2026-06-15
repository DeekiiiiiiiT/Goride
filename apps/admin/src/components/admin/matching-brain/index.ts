/**
 * Matching Brain Components
 * 
 * Central configuration UI for the platform matching engine.
 * Manages policies and product profiles for all Roam apps.
 * 
 * @module matching-brain
 */

// Main Page
export { MatchingBrainPage } from './MatchingBrainPage';

// Sub-components
export { ProductProfileEditor } from './ProductProfileEditor';
export { SyncStatusCard } from './SyncStatusCard';

// Types
export type {
  MatchingPolicy,
  ProductProfile,
  BrainStatus,
  SyncStatus,
  SectionId,
} from './types';

export {
  SECTION_KEYS,
  TOOLTIPS,
  validateWaveRadii,
  isAggressiveSettings,
} from './types';

// Sections
export * from './sections';
