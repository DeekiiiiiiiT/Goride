/**
 * WRA-33: one step failing never takes the whole week down. Each step panel on the week
 * page sits inside its own boundary; if it breaks (a service error, a failed screen load),
 * only that step shows "<Service> unavailable — Retry" and every other step keeps working.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export const STEP_SERVICE_NAME: Record<string, string> = {
  sources: 'Upload service',
  attribution: 'Service line service',
  tolls: 'Toll service',
  tag_account: 'Tag account service',
  fuel: 'Fuel service',
  trips_earnings: 'Earnings service',
  settlement_preview: 'Settlement service',
  close: 'Close service',
};

type Props = { step: string; children: ReactNode };
type State = { failed: boolean; attempt: number };

export class ReconStepBoundary extends Component<Props, State> {
  public state: State = { failed: false, attempt: 0 };

  public static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[recon] step ${this.props.step} failed`, error, info);
    Sentry.withScope((scope) => {
      scope.setTag('boundary', `recon-step-${this.props.step}`);
      Sentry.captureReactException(error, info);
    });
  }

  private retry = () => {
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  public render() {
    const service = STEP_SERVICE_NAME[this.props.step] ?? 'This step';
    if (this.state.failed) {
      return (
        <div
          data-testid="recon-step-unavailable"
          className="flex flex-col items-start gap-3 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-5"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-[#b91c1c]">
            <AlertTriangle className="h-5 w-5" />
            {service} unavailable
          </div>
          <p className="text-sm text-[#47464c]">
            This step could not load. The other steps of this week still work.
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-[#eff4ff] px-4 text-sm font-semibold text-[#0051d5] hover:bg-[#dbe7ff]"
          >
            <RefreshCcw className="h-4 w-4" />
            Retry
          </button>
        </div>
      );
    }
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}
