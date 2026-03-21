import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const StatCard = ({ icon, label, value, change, changeLabel, color = 'bg-red-500/20 text-red-400' }) => (
  <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 hover:shadow-sm transition-shadow">
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      {change !== undefined && (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
          change > 0 ? 'text-green-400 bg-green-500/20' : change < 0 ? 'text-red-400 bg-red-500/20' : 'text-gray-400 bg-gray-9000/20'
        }`}>
          {change > 0 ? <TrendingUp size={12} /> : change < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
          {Math.abs(change)}%
        </span>
      )}
    </div>
    <p className="text-2xl font-bold text-white font-display">{value}</p>
    <p className="text-xs text-gray-400 mt-1">{label}</p>
    {changeLabel && <p className="text-[10px] text-gray-400 mt-0.5">{changeLabel}</p>}
  </div>
);

export default StatCard;


