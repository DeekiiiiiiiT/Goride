/**
 * Answers teach Roam §5.3 (Stitch docs/stitch/answers-teach-roam-dominion/ screens 11–14): what Roam remembers from the
 * owner's answers, with Undo on each. Staff can read it; only the owner can undo. Every word on a row comes from the
 * server; the screen adds only the labels. Undo asks in an in-page dialog (never a browser pop-up).
 */
import { useCallback, useEffect, useState } from "react";
import { researchApi, type MakerLesson } from "../../../services/researchEngineService";
import { D_MONO, D_MUTED, D_TXT, DIcon, PartsButton, RE_SOFT } from "./ReKit";
import { placeWords } from "./QuestionCard";

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type State = { status: "loading" } | { status: "error" } | { status: "ready"; lessons: MakerLesson[]; canUndo: boolean };

const chip = `inline-flex items-center rounded-md px-2 py-0.5 text-[13px] ${RE_SOFT} ${D_TXT}`;

export function LearnedFromYou({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [forgetting, setForgetting] = useState<MakerLesson | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const reply = await researchApi.lessons(token);
      setState({ status: "ready", lessons: reply.lessons ?? [], canUndo: Boolean(reply.canUndo) });
    } catch {
      setState({ status: "error" });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function forget() {
    if (!forgetting) return;
    setBusy(true);
    setError(null);
    try {
      await researchApi.forgetLesson(token, forgetting.id);
      setForgetting(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const canUndo = state.status === "ready" && state.canUndo;

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_0_0_1px_#e6e7ee] dark:bg-[#111a2e] dark:shadow-[0_0_0_1px_#1e293b]" data-testid="learned-from-you">
      <div className="flex flex-col gap-1">
        <h3 className={`flex items-center gap-2 text-[18px] font-semibold ${D_TXT}`}>
          <DIcon name="school" className="text-[20px] text-[#0153dc] dark:text-[#93b4ff]" /> Learned from you
        </h3>
        <p className={`text-[14px] ${D_MUTED}`}>What Roam remembers from your answers. It uses these on every new page.</p>
      </div>

      {state.status === "ready" && state.lessons.length && !canUndo ? (
        <p className={`flex items-center gap-2 rounded-xl p-3 text-[14px] ${RE_SOFT} ${D_TXT}`} data-testid="learned-owner-only">
          <DIcon name="lock" className="text-[18px]" /> Only the owner can change this
        </p>
      ) : null}

      {state.status === "loading" ? (
        <div className="flex flex-col gap-2" aria-busy data-testid="learned-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[#e1e1ed] dark:bg-[#1e293b]" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      ) : state.status === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fdecec] p-4 text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]" data-testid="learned-error">
          <span className="flex items-center gap-2 text-[14px] font-medium">
            <DIcon name="error" className="text-[18px]" /> Couldn&apos;t load what Roam learned.
          </span>
          <PartsButton variant="secondary" className="!min-h-[44px]" onClick={() => void load()}>
            <DIcon name="refresh" className="text-[18px]" /> Try again
          </PartsButton>
        </div>
      ) : state.lessons.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="learned-empty">
          <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${RE_SOFT}`}>
            <DIcon name="school" className="text-[24px] text-[#0153dc] dark:text-[#93b4ff]" />
          </span>
          <p className={`text-[15px] font-semibold ${D_TXT}`}>Nothing learned yet.</p>
          <p className={`text-[14px] ${D_MUTED}`}>Answer a question on an upload and it shows here.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[#e6e7ee] dark:divide-[#1e293b]">
          {state.lessons.map((l) => {
            const place = l.model ? [l.model, placeWords([l.axle, l.side].filter(Boolean).join(" "))].filter(Boolean).join(" · ") : null;
            return (
              <li key={l.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="learned-row">
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`break-words rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[14px] font-semibold ${D_MONO} ${D_TXT} dark:bg-[#1e293b]`}>{l.heading}</span>
                    <DIcon name="arrow_forward" className={`text-[18px] ${D_MUTED}`} />
                    <span className={`text-[15px] font-medium ${D_TXT}`}>{l.typeName}</span>
                    <span className={chip}>{l.make}</span>
                    {place ? <span className={chip}>{place}</span> : null}
                  </span>
                  <span className={`flex items-center gap-1 text-[13px] ${D_MUTED}`} data-testid="learned-row-line">
                    <DIcon name="history" className="text-[16px]" />
                    {[`Saved ${l.partsSaved} ${l.partsSaved === 1 ? "part" : "parts"}`, l.answeredAt ? `You answered on ${shortDate(l.answeredAt)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <PartsButton
                  variant="secondary"
                  className="!min-h-[44px] shrink-0 !text-[#a83836] dark:!text-[#f87171]"
                  disabled={!canUndo}
                  onClick={() => {
                    setError(null);
                    setForgetting(l);
                  }}
                  data-testid="learned-undo"
                >
                  <DIcon name="undo" className="text-[18px]" /> Undo
                </PartsButton>
              </li>
            );
          })}
        </ul>
      )}

      {forgetting ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#191b24]/40 p-4" data-testid="learned-forget-dialog">
          <div role="dialog" aria-modal aria-label="Forget this?" className="flex w-full max-w-[480px] flex-col gap-4 rounded-[20px] bg-white p-7 shadow-2xl dark:bg-[#111a2e]">
            <div className="flex items-start justify-between gap-3">
              <h4 className={`text-[20px] font-semibold ${D_TXT}`}>Forget this?</h4>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setForgetting(null)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${D_MUTED} hover:bg-[#ededf9] dark:hover:bg-[#1e293b]`}
              >
                <DIcon name="close" className="text-[18px]" />
              </button>
            </div>
            <p className={`text-[15px] leading-relaxed ${D_TXT}`}>
              Roam will ask again next time it sees <span className={`rounded bg-[#f1f5f9] px-1.5 py-0.5 font-semibold ${D_MONO} dark:bg-[#1e293b]`}>{forgetting.heading}</span> on
              a {forgetting.make} page. Parts already saved stay saved.
            </p>
            {error ? <p className="text-[14px] font-medium text-[#a83836] dark:text-[#f87171]">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <PartsButton variant="secondary" className="!min-h-[44px]" disabled={busy} onClick={() => setForgetting(null)} data-testid="learned-keep">
                Keep it
              </PartsButton>
              <PartsButton variant="danger" className="!min-h-[44px]" disabled={busy} onClick={() => void forget()} data-testid="learned-forget">
                <DIcon name="delete" className="text-[18px]" /> {busy ? "Forgetting…" : "Forget it"}
              </PartsButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
