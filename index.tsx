import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CartProvider } from './context/CartContext';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Initialize Stripe
const stripePromise = fetch('http://localhost:5000/api/checkout/config')
  .then((response) => response.json())
  .then(({ publishableKey }) => loadStripe(publishableKey))
  .catch((error) => {
    console.error('Failed to initialize Stripe:', error);
    return null;
  });

const RootComponent: React.FC = () => (
  <React.StrictMode>
    <CartProvider>
      <Elements stripe={stripePromise}>
        <App />
      </Elements>
    </CartProvider>
  </React.StrictMode>
);

const root = ReactDOM.createRoot(rootElement);
root.render(<RootComponent />);
