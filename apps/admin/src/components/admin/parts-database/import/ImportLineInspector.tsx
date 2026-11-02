// Stitch: dominion-redesign/parts_import_check_results — Line N Inspection panel
import { MaterialIcon } from "./MaterialIcon";

export type ImportRowInspectPayload = {
  lineNo?: number;
  status?: string;
  action?: string;
  issues?: Array<{ code?: string; message?: string }>;
  raw?: Record<string, unknown>;
  normalized?: Record<string, unknown>;
  schemaValidation?: { passed?: boolean; issues?: unknown[] };
  fitmentAttributes?: Record<string, unknown>;
  crossReferences?: unknown[];
  error?: string;
};

export function ImportLineInspector({
  lineNo,
  payload,
  loading,
  onDismiss,
}: {
  lineNo: number;
  payload: ImportRowInspectPayload | null;
  loading?: boolean;
  onDismiss: () => void;
}) {
  const schema = payload?.schemaValidation;
  const refs = Array.isArray(payload?.crossReferences) ? payload.crossReferences : [];

  return (
    <aside className="fixed top-0 right-0 z-40 h-full w-full max-w-md border-l border-outline-variant/40 bg-surface-container-lowest shadow-2xl flex flex-col">
      <div className="flex items-center justify-between gap-2 p-4 border-b border-outline-variant/30">
        <h3 className="text-sm font-semibold">Line {lineNo} Inspection</h3>
        <button type="button" className="text-secondary font-semibold text-xs inline-flex items-center gap-1" onClick={onDismiss}>
          <MaterialIcon name="close" className="text-[18px]" />
          Dismiss Inspector
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {loading ? (
          <p className="text-on-surface-variant inline-flex items-center gap-2">
            <MaterialIcon name="progress_activity" className="text-[16px] animate-spin" />
            Loading inspection…
          </p>
        ) : payload?.error ? (
          <p className="text-error">{payload.error}</p>
        ) : payload ? (
          <>
            <section className="space-y-1">
              <p className="font-mono uppercase text-outline text-[10px]">Schema validation</p>
              <p className={schema?.passed ? "text-[#166534] font-semibold" : "text-error font-semibold"}>
                {schema?.passed ? "Passed" : "Failed"}
              </p>
              {(schema?.issues as Array<{ code?: string; message?: string }> | undefined)?.map((issue, i) => (
                <p key={i} className="text-on-surface-variant">
                  {issue.code}: {issue.message}
                </p>
              ))}
            </section>
            <section className="space-y-1">
              <p className="font-mono uppercase text-outline text-[10px]">Fitment attributes</p>
              <pre className="rounded-lg bg-surface-container-low p-2 overflow-x-auto text-[10px] font-mono">
                {JSON.stringify(payload.fitmentAttributes ?? {}, null, 2)}
              </pre>
            </section>
            <section className="space-y-1">
              <p className="font-mono uppercase text-outline text-[10px]">Cross-references</p>
              {refs.length === 0 ? (
                <p className="text-on-surface-variant">None</p>
              ) : (
                <ul className="space-y-1">
                  {refs.slice(0, 8).map((ref, i) => (
                    <li key={i} className="rounded-lg bg-surface-container-low px-2 py-1 font-mono text-[10px]">
                      {typeof ref === "object" ? JSON.stringify(ref) : String(ref)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </aside>
  );
}
