import React from 'react';

const ChartCard = ({ title, subtitle, action, children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-100 p-5 ${className}`}>
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="font-display font-semibold text-sm text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

export default ChartCard;
