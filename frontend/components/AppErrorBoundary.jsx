import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('Application error:', error, info.componentStack);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="grid min-h-[70vh] place-items-center bg-slate-50 px-4 py-16">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600">
            <AlertTriangle size={26} aria-hidden="true" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-bold text-slate-950">This page could not load</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Your account and order data have not been changed. Refresh the page, or return to the storefront.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-5 text-sm font-semibold text-white"
            >
              <RotateCcw size={16} /> Refresh page
            </button>
            <a href="#/" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Return home
            </a>
          </div>
        </div>
      </main>
    );
  }
}

export default AppErrorBoundary;
