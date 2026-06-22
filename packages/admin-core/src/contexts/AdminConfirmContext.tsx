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
import { AdminFormDialog, type AdminFormField } from '../components/AdminFormDialog';

export type AdminConfirmOptions = {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AdminConfirmVariant;
};

export type AdminPromptOptions = {
  title: string;
  description?: React.ReactNode;
  fields: AdminFormField[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AdminConfirmVariant;
};

type PendingConfirm = AdminConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

type PendingPrompt = AdminPromptOptions & {
  resolve: (values: Record<string, string> | null) => void;
};

type AdminConfirmContextValue = {
  confirm: (options: AdminConfirmOptions) => Promise<boolean>;
  prompt: (options: AdminPromptOptions) => Promise<Record<string, string> | null>;
};

const AdminConfirmContext = createContext<AdminConfirmContextValue | null>(null);

export function AdminConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);

  const confirm = useCallback((options: AdminConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPendingConfirm({ ...options, resolve });
    });
  }, []);

  const prompt = useCallback((options: AdminPromptOptions) => {
    return new Promise<Record<string, string> | null>((resolve) => {
      setPendingPrompt({ ...options, resolve });
    });
  }, []);

  const closeConfirm = useCallback((result: boolean) => {
    setPendingConfirm((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const closePrompt = useCallback((values: Record<string, string> | null) => {
    setPendingPrompt((current) => {
      current?.resolve(values);
      return null;
    });
  }, []);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <AdminConfirmContext.Provider value={value}>
      {children}
      <AdminConfirmDialog
        open={pendingConfirm != null}
        title={pendingConfirm?.title ?? ''}
        description={pendingConfirm?.description ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel}
        cancelLabel={pendingConfirm?.cancelLabel ?? 'Cancel'}
        variant={pendingConfirm?.variant}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
      <AdminFormDialog
        open={pendingPrompt != null}
        title={pendingPrompt?.title ?? ''}
        description={pendingPrompt?.description}
        fields={pendingPrompt?.fields ?? []}
        confirmLabel={pendingPrompt?.confirmLabel}
        cancelLabel={pendingPrompt?.cancelLabel ?? 'Cancel'}
        variant={pendingPrompt?.variant}
        onSubmit={(values) => closePrompt(values)}
        onCancel={() => closePrompt(null)}
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

export type { AdminFormField };
