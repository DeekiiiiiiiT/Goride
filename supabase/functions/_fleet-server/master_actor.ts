import { AsyncLocalStorage } from "node:async_hooks";

type MasterActor = { email: string; reason: string };

const storage = new AsyncLocalStorage<MasterActor>();

export function runAsMasterActor<T>(email: string, fn: () => Promise<T>, reason = ""): Promise<T> {
  const who = email.trim();
  const why = reason.trim();
  if (!who && !why) return fn();
  return storage.run({ email: who, reason: why }, fn);
}

export function currentMasterActor(): string | null {
  const email = storage.getStore()?.email ?? "";
  return email || null;
}

export function currentMasterReason(): string {
  return storage.getStore()?.reason ?? "";
}
