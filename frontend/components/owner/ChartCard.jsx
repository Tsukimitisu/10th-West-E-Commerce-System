import React from 'react';

const ChartCard = ({ title, subtitle, action, children, className = '' }) => (
  <div className={`bg-gradient-to-b from-[#1a1d23] to-[#111318] rounded-xl border border-white/5 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.5)] p-5 ${className}`}>
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


