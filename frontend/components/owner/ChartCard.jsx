import React from 'react';

const ChartCard = ({ title, subtitle, action, children, className = '' }) => (
  <div className={`bg-gray-800 rounded-xl border border-gray-700 p-5 ${className}`}>
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="font-display font-semibold text-sm text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

export default ChartCard;


