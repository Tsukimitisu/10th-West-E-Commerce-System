import React from 'react';

const LoadingSkeleton = ({ className = '' }) => (
  <span className={`skeleton block rounded-lg ${className}`} aria-hidden="true" />
);

export default LoadingSkeleton;
