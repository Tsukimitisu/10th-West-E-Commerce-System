import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CartProvider } from './context/CartContext';

// Global error handler for uncaught errors
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `<div style="padding:40px;color:red;font-family:monospace"><h2>App Error</h2><pre>${e.message}\n${e.filename}:${e.lineno}</pre></div>`;
  }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});

// Error boundary to catch render errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('React Error Boundary caught:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', { style: { padding: '40px', color: 'red', fontFamily: 'monospace' } },
        React.createElement('h2', null, 'React Render Error'),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap' } }, String(this.state.error)),
      );
    }
    return this.props.children;
  }
}

// Render immediately without waiting for Stripe
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <CartProvider>
        <App />
      </CartProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
