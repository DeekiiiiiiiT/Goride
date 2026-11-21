import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, ChevronRight, Clock, Copy, ExternalLink, Info } from 'lucide-react';
import { openExternalUrl } from '../../utils/openExternalUrl';
import {
  DRIVER_TOLL_DISPUTES_KEY,
  DriverDisputeError,
  consequence,
  dayJm,
  daysLeftLine,
  fmtJmd,
  homeSummary,
  markDriverTollDisputeSent,
  placeLine,
  tripPill,
  uberHelpLine,
  useDriverTollDisputes,
  type DriverTollDispute,
} from './driverTollDisputes';

const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-800';
const BTN_PRIMARY = 'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[15px] font-semibold text-white active:bg-emerald-700 disabled:opacity-60';
const BTN_SECONDARY = 'flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-[15px] font-medium text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

function Plate({ plate }: { plate?: string | null }) {
  if (!plate) return null;
  return <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">{plate}</span>;
}

function StateChip({ d }: { d: DriverTollDispute }) {
  if (d.windowClosed) return <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">Time is up</span>;
  if (d.state === 'sent') return <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Sent · waiting on Uber</span>;
  if (d.red) return <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">{d.daysLeft === 1 ? '1 day left' : `${d.daysLeft} days left`}</span>;
  return <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Not sent yet</span>;
}

/** Roam Driver → "Tolls to dispute" (list → one toll). */
export function TollDisputesPage({ onBack }: { onBack: () => void }) {
  const query = useDriverTollDisputes();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = query.data?.disputes ?? [];
  const open = list.find((d) => d.id === openId) ?? null;

  if (open) return <OneToll d={open} onBack={() => setOpenId(null)} />;

  const sum = homeSummary(list);
  const toSend = list.filter((d) => d.state === 'to_send');
  const sent = list.filter((d) => d.state === 'sent');

  return (
    <div className="flex min-h-full flex-col bg-slate-100 dark:bg-slate-900" data-testid="toll-disputes-page">
      <Header title="Tolls to dispute" onBack={onBack} />
      <div className="flex flex-col gap-3 px-4 py-4">
        {query.isLoading ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : toSend.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" data-testid="toll-disputes-empty">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <Check className="h-7 w-7 text-emerald-600" aria-hidden />
            </span>
            <p className="text-[17px] font-semibold text-slate-900 dark:text-white">No tolls to dispute</p>
            <p className="text-[15px] text-slate-600 dark:text-slate-300">
              When Uber pays back less than a toll on one of your trips, it shows up here.
            </p>
          </div>
        ) : (
          <>
            <div className={`${CARD} px-4 py-3`}>
              <p className="text-[17px] font-semibold text-slate-900 dark:text-white">
                {sum.toSend} to send · <span className="text-amber-700">{fmtJmd(sum.toSendMinor)}</span> still owed
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Sent and waiting on Uber: {sum.sent}</p>
            </div>
            <p className="flex items-center gap-2 px-1 text-[13px] text-slate-600 dark:text-slate-300">
              <Info className="h-4 w-4 shrink-0" aria-hidden /> Uber only accepts these within {toSend[0]?.windowDays ?? 9} days of the trip.
            </p>
            <ul className="flex flex-col gap-3">
              {toSend.map((d) => (
                <ListCard key={d.id} d={d} onOpen={() => setOpenId(d.id)} />
              ))}
            </ul>
          </>
        )}
        {sent.length > 0 ? (
          <section className="mt-2 flex flex-col gap-3" data-testid="toll-disputes-sent">
            <h2 className="px-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
              Sent and waiting on Uber · {fmtJmd(sum.sentMinor)}
            </h2>
            <ul className="flex flex-col gap-3">
              {sent.map((d) => (
                <ListCard key={d.id} d={d} onOpen={() => setOpenId(d.id)} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-800">
      <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full" aria-label="Back">
        <ArrowLeft className="h-5 w-5 text-slate-900 dark:text-white" />
      </button>
      <h1 className="flex-1 truncate pr-11 text-center text-[17px] font-semibold text-slate-900 dark:text-white">{title}</h1>
    </div>
  );
}

function ListCard({ d, onOpen }: { d: DriverTollDispute; onOpen: () => void }) {
  const days = daysLeftLine(d);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`${CARD} flex w-full items-center gap-3 px-4 py-3 text-left ${d.red && d.state === 'to_send' ? 'border-l-4 border-l-red-500' : ''}`}
        data-testid={`toll-dispute-card-${d.id}`}
        aria-label={`${d.plazaName ?? 'Toll'} toll, ${placeLine(d)}, ${fmtJmd(d.leftMinor)} still owed${days ? `, ${days}` : ''}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-slate-900 dark:text-white">
            {placeLine(d)} <Plate plate={d.plate} />
          </span>
          <span className={`text-xl font-bold tabular-nums ${d.state === 'sent' ? 'text-slate-900 dark:text-white' : 'text-amber-700'}`}>
            {fmtJmd(d.leftMinor)} <span className="text-sm font-medium">still owed</span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <StateChip d={d} />
            {days && !d.windowClosed ? (
              <span className={`flex items-center gap-1 text-[13px] ${d.red ? 'text-red-600' : 'text-slate-600 dark:text-slate-300'}`}>
                <Clock className="h-3.5 w-3.5" aria-hidden /> {d.red ? `Send by ${d.daysLeft === 0 ? 'today' : dayJm(d.deadline)}` : days}
              </span>
            ) : null}
          </span>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      </button>
    </li>
  );
}

function OneToll({ d, onBack }: { d: DriverTollDispute; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closedNow, setClosedNow] = useState(false);
  const trip = tripPill(d);
  const days = daysLeftLine(d);
  const timeUp = d.windowClosed || closedNow;
  const c = consequence(d);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(d.text ?? '');
      setCopied(true);
      toast('Message copied. Now open Uber and paste it.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Press and hold the message to copy it.');
    }
  };

  const markSent = async () => {
    setSaving(true);
    try {
      await markDriverTollDisputeSent(d);
      setSheet(false);
      await queryClient.invalidateQueries({ queryKey: DRIVER_TOLL_DISPUTES_KEY });
    } catch (err) {
      setSheet(false);
      if (err instanceof DriverDisputeError && err.code === 'window_closed') {
        setClosedNow(true);
      } else {
        toast.error(err instanceof Error ? err.message : 'That did not work. Please try again.');
        await queryClient.invalidateQueries({ queryKey: DRIVER_TOLL_DISPUTES_KEY });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-100 dark:bg-slate-900" data-testid={`toll-dispute-page-${d.id}`}>
      <Header title="Dispute this toll with Uber" onBack={onBack} />
      {d.state === 'sent' ? (
        <p className="flex items-center gap-2 bg-emerald-50 px-4 py-3 text-[15px] text-emerald-800" data-testid="toll-dispute-sent-strip">
          <Check className="h-4 w-4" aria-hidden /> Sent. Nothing else to do.
        </p>
      ) : !timeUp && d.state === 'to_send' && d.daysLeft === 0 ? (
        <p className="bg-red-50 px-4 py-3 text-[15px] font-medium text-red-700">Last day to send this one.</p>
      ) : null}
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className={`${CARD} flex flex-col gap-2 p-4`}>
          <span className="flex items-start justify-between gap-2 text-[15px] font-medium text-slate-900 dark:text-white">
            {placeLine(d)} toll <Plate plate={d.plate} />
          </span>
          <span className={`text-[28px] font-bold leading-tight tabular-nums ${d.state === 'sent' ? 'text-slate-900 dark:text-white' : 'text-amber-700'}`}>
            {fmtJmd(d.leftMinor)} <span className="text-lg font-semibold">still owed</span>
          </span>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Toll {fmtJmd(d.tollMinor)} · Uber paid back {fmtJmd(d.paidMinor)}
          </span>
          {trip ? <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-[13px] text-slate-700 dark:bg-slate-700 dark:text-slate-100">{trip}</span> : null}
          <span className="flex flex-wrap items-center gap-2">
            {timeUp ? <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">Time is up</span> : <StateChip d={d} />}
            {days && !timeUp ? (
              <span className={`flex items-center gap-1 text-[13px] ${d.red ? 'font-medium text-red-600' : 'text-slate-600 dark:text-slate-300'}`}>
                <Clock className="h-3.5 w-3.5" aria-hidden /> {days} · send by {d.daysLeft === 0 ? 'today' : dayJm(d.deadline)}
              </span>
            ) : null}
          </span>
        </div>

        {timeUp ? (
          <>
            <div className="rounded-2xl bg-red-50 p-4 text-[15px] text-red-800" data-testid="toll-dispute-time-up">
              <p className="font-semibold">The {d.windowDays ?? 9} days to dispute this toll have passed.</p>
              <p className="mt-1">
                {c.tone === 'fleet' ? 'The fleet pays it, not you.' : `${fmtJmd(d.leftMinor)} will be charged to you on your settlement.`}
              </p>
            </div>
            <button type="button" className={BTN_SECONDARY} onClick={onBack}>
              Back to tolls
            </button>
          </>
        ) : d.state === 'sent' ? (
          <>
            <div className={`${CARD} px-4 py-3`}>
              <p className="flex items-center gap-3 text-[15px] text-slate-900 dark:text-white">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50">
                  <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                </span>
                Marked as sent
              </p>
            </div>
            <p className="px-2 text-center text-[13px] text-slate-600 dark:text-slate-300">
              Refunds usually arrive in the next pay period or the one after.
            </p>
          </>
        ) : (
          <>
            <Step n={1} title="Copy the message">
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] leading-relaxed text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" data-testid="toll-dispute-text">
                {d.text}
              </p>
              <button
                type="button"
                className={copied ? `${BTN_SECONDARY} border-emerald-300 bg-emerald-50 text-emerald-800` : BTN_SECONDARY}
                onClick={() => void copy()}
                data-testid="toll-dispute-copy"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? 'Copied' : 'Copy text'}
              </button>
            </Step>
            <Step n={2} title="Open Uber and paste it on this trip">
              <p className="text-[15px] text-slate-600 dark:text-slate-300">{uberHelpLine(d)}</p>
              <button type="button" className={BTN_SECONDARY} onClick={() => void openExternalUrl('uberdriver://')} data-testid="toll-dispute-open-uber">
                Open Uber App <ExternalLink className="h-4 w-4" aria-hidden />
              </button>
            </Step>
            <Step n={3} title="Mark as sent">
              <p className="text-[15px] text-slate-600 dark:text-slate-300">Tap this once you&apos;ve sent it in Uber.</p>
              <button type="button" className={BTN_PRIMARY} onClick={() => setSheet(true)} data-testid="toll-dispute-mark-sent">
                Mark as sent
              </button>
            </Step>
            {c.tone === 'fleet' ? (
              <p className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-[13px] text-blue-800" data-testid="toll-dispute-consequence">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {c.text}
              </p>
            ) : (
              <p className="flex items-start gap-2 px-1 text-[13px] text-slate-600 dark:text-slate-300" data-testid="toll-dispute-consequence">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {c.text}
              </p>
            )}
          </>
        )}
      </div>

      {sheet ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setSheet(false)}>
          <div
            className="w-full rounded-t-[20px] bg-white px-5 pb-8 pt-3 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Did you send it in Uber?"
            data-testid="toll-dispute-sheet"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300" />
            <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">Did you send it in Uber?</h2>
            <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              {d.plazaName || 'Toll'} · {placeLine(d).split(' · ')[0]} · {fmtJmd(d.leftMinor)}
            </p>
            <p className="mt-2 text-[15px] text-slate-600 dark:text-slate-300">
              The fleet will see the refund when Uber pays it, usually in the next pay period or the one after.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void markSent()} data-testid="toll-dispute-sheet-yes">
                Yes, I sent it
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setSheet(false)}>
                Not yet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4`}>
      <h2 className="flex items-center gap-3 text-[17px] font-semibold text-slate-900 dark:text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-100">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Home: "N tolls to dispute with Uber". Hidden when there is nothing to send. */
export function TollDisputesHomeCard({ onOpen }: { onOpen: () => void }) {
  const query = useDriverTollDisputes();
  const sum = homeSummary(query.data?.disputes ?? []);
  if (!query.data?.enabled || sum.toSend === 0) return null;
  return (
    <div className={`${CARD} mx-6 mb-2 mt-2 border-l-4 border-l-amber-500 p-4`} data-testid="toll-disputes-home-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[17px] font-semibold text-slate-900 dark:text-white">
          {sum.toSend} toll{sum.toSend === 1 ? '' : 's'} to dispute with Uber
        </p>
        {sum.urgentDays != null ? (
          <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
            {sum.urgentDays === 0 ? 'Last day' : `${sum.urgentDays} day${sum.urgentDays === 1 ? '' : 's'} left`} on the oldest
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[15px] text-slate-600 dark:text-slate-300">
        Uber still owes <span className="font-semibold text-slate-900 dark:text-white">{fmtJmd(sum.toSendMinor)}</span> on tolls from your
        trips. It takes about a minute each.
      </p>
      <button type="button" className={`${BTN_PRIMARY} mt-3`} onClick={onOpen} data-testid="toll-disputes-home-start">
        Start
      </button>
    </div>
  );
}
