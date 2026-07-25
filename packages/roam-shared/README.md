# `@roam/roam-shared`

Shared React UI primitives that should not live as copy-pasted files inside each app.

## Migration

1. Add dependency: `"@roam/roam-shared": "workspace:*"`
2. Replace local `ErrorBoundary` imports:

```ts
// before
import { ErrorBoundary } from '../ui/ErrorBoundary';

// after
import { ErrorBoundary } from '@roam/roam-shared';
```

3. Delete the app-local `ErrorBoundary.tsx` once all call sites are migrated.

**Status:** `@roam/admin` imports from this package. Other apps (`fleet`, `driver`, `@roam/ui`) still ship local copies — migrate when touching those screens.

Workspaces already include `packages/*` in the root `package.json`.
