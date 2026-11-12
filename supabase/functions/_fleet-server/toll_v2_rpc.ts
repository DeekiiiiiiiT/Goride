/** PostgREST / Postgres signals that toll v2 RPCs are not deployed yet — treat as v2 off. */
export function isTollV2RpcMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    msg.includes("could not find the function") ||
    (msg.includes("function") && msg.includes("does not exist"))
  );
}
