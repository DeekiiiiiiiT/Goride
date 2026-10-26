import { AsyncLocalStorage } from "node:async_hooks";

type MasterActor = { email: string };

const storage = new AsyncLocalStorage<MasterActor>();

export function runAsMasterActor<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const who = email.trim();
  if (!who) return fn();
  return storage.run({ email: who }, fn);
}

export function currentMasterActor(): string | null {
  return storage.getStore()?.email ?? null;
}
