import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CartProvider } from './context/CartContext';
import AppErrorBoundary from './components/AppErrorBoundary';

// Render immediately.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <CartProvider>
        <App />
      </CartProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);


