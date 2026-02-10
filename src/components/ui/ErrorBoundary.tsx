import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from './button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in ${this.props.name || 'ErrorBoundary'}:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-red-200 rounded-xl bg-red-50 text-center space-y-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-full">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-900">Component Loading Error</h3>
            <p className="text-xs text-red-600 mt-1 max-w-[250px] mx-auto">
              We encountered an issue displaying this section. This is often caused by data anomalies.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="border-red-200 text-red-700 hover:bg-red-100 h-8 gap-2"
            onClick={() => this.setState({ hasError: false })}
          >
            <RefreshCcw className="w-3 h-3" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
