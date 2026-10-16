import React from 'react';
import BrandLogo from './ui/BrandLogo';

const AuthShell = ({ active, children }) => {
  if (!active) return children;
  return <div className="auth-experience">
    <aside className="auth-brand-panel" aria-label="10th West Motorcycle Parts & Accessories">
      <div className="auth-brand-content">
        <BrandLogo dark link />
        <h2>Parts Built<br />for the Ride.</h2>
        <p>Your next ride starts with the right part. Shop, track your orders and stay connected with 10th West.</p>
      </div>
      <span className="auth-brand-signature" aria-hidden="true" />
    </aside>
    <div className="auth-route-content">{children}</div>
  </div>;
};

export default AuthShell;
