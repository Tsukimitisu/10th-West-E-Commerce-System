import React from 'react';

// Keep editor state in StorefrontListingsView, outside this boundary. Retrying
// remounts only the editor controls, preserving the operator's unsaved work.
export function ListingEditorBody({ children }) { return children(); }

export default class ListingEditorBoundary extends React.Component {
  state = { failed:false };
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidUpdate(previous) {
    if (this.state.failed && previous.resetKey!==this.props.resetKey) this.setState({failed:false});
  }
  componentDidCatch(error,info) {
    // No form values, files, raw API bodies, credentials or complete URLs.
    const message = (typeof error?.message==='string' ? error.message : 'Editor render failed')
      .replace(/https?:\/\/\S+/gi,'[url]')
      .replace(/(?:bearer\s+\S+|\b(?:\w*(?:token|password|secret|cookie|authorization)\w*)\s*[:=]\s*\S+)/gi,'[redacted]')
      .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi,'[email]')
      .replace(/[A-Za-z0-9_+/=-]{32,}/g,'[redacted]').slice(0,400);
    console.error('Listing editor render failed',{
      name:error?.name || 'Error',message,
      component:info.componentStack?.split('\n').find(line=>line.trim())?.replace(/\(.*/, '').trim(),
    });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="font-semibold">Something went wrong while editing this listing.</p>
      <p>Your unsaved listing information is still available. Retry the editor or close this window.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={()=>this.setState({failed:false})} className="min-h-11 rounded-lg bg-orange-600 px-4 font-semibold text-white">Retry editor</button>
        <button type="button" onClick={this.props.onClose} className="min-h-11 rounded-lg border border-red-300 bg-white px-4 font-semibold">Close</button>
      </div>
    </div>;
  }
}
