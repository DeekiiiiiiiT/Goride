import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  dispatchResetErrorBoundary,
  ROAM_RECONNECTED_EVENT,
  ROAM_RESET_ERROR_BOUNDARY_EVENT,
} from '../../utils/networkReconnect';
import { readPersistedActiveRideId } from '../../utils/driverActiveRideSession';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  private onReconnected = () => {
    if (this.state.hasError) this.reset();
  };

  private onResetEvent = () => {
    if (this.state.hasError) this.reset();
  };

  componentDidMount() {
    window.addEventListener(ROAM_RECONNECTED_EVENT, this.onReconnected);
    window.addEventListener(ROAM_RESET_ERROR_BOUNDARY_EVENT, this.onResetEvent);
  }

  componentWillUnmount() {
    window.removeEventListener(ROAM_RECONNECTED_EVENT, this.onReconnected);
    window.removeEventListener(ROAM_RESET_ERROR_BOUNDARY_EVENT, this.onResetEvent);
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const hasActiveTrip = Boolean(readPersistedActiveRideId());

      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-100 px-6 text-center safe-x safe-t safe-b dark:bg-slate-900">
          <p className="text-lg font-semibold text-slate-900 dark:text-white">Something went wrong</p>
          <p className="mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-300">
            {hasActiveTrip
              ? 'Your active trip is saved on this device. Try again — you should not need to reload the whole app.'
              : 'Please try again. If the problem continues, contact support.'}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 touch-manipulation"
              onClick={() => {
                this.reset();
                dispatchResetErrorBoundary();
              }}
            >
              Try again
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 touch-manipulation dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
