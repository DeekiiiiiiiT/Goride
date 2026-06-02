import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  AdminConfirmDialog,
  type AdminConfirmVariant,
} from '../components/AdminConfirmDialog';

export type AdminConfirmOptions = {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AdminConfirmVariant;
};

type PendingConfirm = AdminConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

type AdminConfirmContextValue = {
  confirm: (options: AdminConfirmOptions) => Promise<boolean>;
};

const AdminConfirmContext = createContext<AdminConfirmContextValue | null>(null);

export function AdminConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: AdminConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <AdminConfirmContext.Provider value={value}>
      {children}
      <AdminConfirmDialog
        open={pending != null}
        title={pending?.title ?? ''}
        description={pending?.description ?? ''}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel ?? 'Cancel'}
        variant={pending?.variant}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </AdminConfirmContext.Provider>
  );
}

export function useAdminConfirm(): AdminConfirmContextValue {
  const ctx = useContext(AdminConfirmContext);
  if (!ctx) {
    throw new Error('useAdminConfirm must be used within AdminConfirmProvider');
  }
  return ctx;
}
