import { GLOBAL_SCOPE_META, PERSONA_SCOPE_META, primaryAppForScope } from './scopeMeta';
import type {
  IdentityActionApp,
  IdentityActionBuckets,
  IdentityActionGroup,
  IdentityActionScope,
  IdentityActionsResult,
} from './types';

const PERSONA_ORDER: IdentityActionApp[] = ['customer', 'courier', 'merchant'];

/**
 * Orders action buckets: primary persona first (expanded), other personas as
 * collapsed "Also has", Global last. Pure — no React / API side effects.
 */
export function buildIdentityActionGroups(input: {
  scope: IdentityActionScope;
  buckets: IdentityActionBuckets;
  hasDetail: boolean;
  hasAnyManagePermission: boolean;
}): IdentityActionsResult {
  const { scope, buckets, hasDetail, hasAnyManagePermission } = input;

  if (!hasDetail) {
    return { groups: [], emptyReason: 'no_detail' };
  }

  const primary = primaryAppForScope(scope);
  const groups: IdentityActionGroup[] = [];

  const pushPersona = (app: IdentityActionApp, items: typeof buckets.customer) => {
    if (items.length === 0) return;
    const meta = PERSONA_SCOPE_META[app];
    const isPrimary = primary === null || primary === app;
    groups.push({
      id: app,
      title: meta.title,
      kind: 'persona',
      app,
      items,
      collapsedByDefault: primary !== null && !isPrimary,
    });
  };

  if (primary) {
    // Primary first, then remaining personas in stable order
    pushPersona(primary, buckets[primary]);
    for (const app of PERSONA_ORDER) {
      if (app === primary) continue;
      pushPersona(app, buckets[app]);
    }
  } else {
    for (const app of PERSONA_ORDER) {
      pushPersona(app, buckets[app]);
    }
  }

  if (buckets.global.length > 0) {
    groups.push({
      id: 'global',
      title: GLOBAL_SCOPE_META.title,
      kind: 'global',
      items: buckets.global,
      collapsedByDefault: false,
    });
  }

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  if (totalItems > 0) {
    return { groups, emptyReason: 'ok' };
  }

  if (!hasAnyManagePermission) {
    return { groups: [], emptyReason: 'no_permission' };
  }

  return { groups: [], emptyReason: 'no_manageable_personas' };
}
