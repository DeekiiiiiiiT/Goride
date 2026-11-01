export type ComponentFitHints = {
  hasSideSpecificListings: boolean;
  countsByPosition: { front: number; rear: number };
  labelsByPosition?: { front?: string; rear?: string };
};
