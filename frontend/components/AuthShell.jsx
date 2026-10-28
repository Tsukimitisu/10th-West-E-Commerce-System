import React from 'react';

const AuthShell = ({ active, children }) => {
  if (!active) return children;
  return <div className="auth-experience">
    <div className="auth-route-content">{children}</div>
  </div>;
};

export default AuthShell;
