/**
 * JCA / ASYCUDA submit adapter.
 * Env-driven: when JCA_ASYCUDA_ENDPOINT is unset, returns a stub acceptance
 * (mirrors Digicel/notifyPackage stub pattern).
 */

export type JcaSubmitResult = {
  status: "queued" | "accepted" | "rejected" | "stubbed";
  jcaRef: string | null;
  error: string | null;
  raw?: unknown;
};

export async function submitAwboldsToJca(input: {
  xml: string;
  checksum: string;
  mawb: string;
  organizationId: string;
}): Promise<JcaSubmitResult> {
  const endpoint = Deno.env.get("JCA_ASYCUDA_ENDPOINT")?.trim();
  const apiKey = Deno.env.get("JCA_ASYCUDA_API_KEY")?.trim();

  if (!endpoint) {
    const ref = `STUB-${input.mawb || "MAWB"}-${Date.now().toString(36).toUpperCase()}`;
    console.log(
      JSON.stringify({
        event: "jca_submit_stub",
        organizationId: input.organizationId,
        mawb: input.mawb,
        checksum: input.checksum,
        jcaRef: ref,
      }),
    );
    return { status: "stubbed", jcaRef: ref, error: null };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "X-Roam-Checksum": input.checksum,
        "X-Roam-MAWB": input.mawb,
      },
      body: input.xml,
    });
    const text = await res.text();
    let raw: unknown = text;
    try {
      raw = JSON.parse(text);
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      return {
        status: "rejected",
        jcaRef: null,
        error: `JCA HTTP ${res.status}: ${text.slice(0, 400)}`,
        raw,
      };
    }
    const ref =
      typeof raw === "object" && raw && "reference" in raw
        ? String((raw as { reference: unknown }).reference)
        : `JCA-${Date.now().toString(36).toUpperCase()}`;
    return { status: "accepted", jcaRef: ref, error: null, raw };
  } catch (e) {
    return {
      status: "rejected",
      jcaRef: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
