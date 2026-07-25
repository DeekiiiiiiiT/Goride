import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, ShieldAlert } from 'lucide-react';
import { projectId, publicAnonKey } from '@roam/api-client';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
  userId?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  logId?: string;
}

/**
 * Shared ErrorBoundary — migrate apps from local copies to `@roam/roam-shared`.
 * See packages/roam-shared/README.md.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in ${this.props.name || 'ErrorBoundary'}:`, error, errorInfo);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-37f42386/system/log-error`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            error: {
              message: error.message,
              stack: error.stack,
            },
            info: errorInfo,
            userId: this.props.userId,
            componentName: this.props.name || 'Anonymous Boundary',
          }),
        },
      );
      const data = await response.json();
      if (data.logId) {
        this.setState({ logId: data.logId });
      }
    } catch (e) {
      console.warn('Failed to log error to forensic audit server:', e);
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-red-200 rounded-xl bg-red-50 text-center space-y-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-full">
            {this.state.logId ? <ShieldAlert className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-900">Component Integrity Failure</h3>
            <p className="text-xs text-red-600 mt-1 max-w-[250px] mx-auto">
              A data anomaly or runtime error has occurred.{' '}
              {this.state.logId && 'Our forensic audit system has logged this incident.'}
            </p>
            {this.state.logId && (
              <p className="text-[10px] text-slate-400 mt-2 font-mono">
                Incident ID: {this.state.logId}
              </p>
            )}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 h-8 px-3 text-sm border border-red-200 text-red-700 rounded-md hover:bg-red-100"
            onClick={() => this.setState({ hasError: false, logId: undefined })}
          >
            <RefreshCcw className="w-3 h-3" />
            Recover View
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
