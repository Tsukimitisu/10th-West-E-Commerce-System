import React from 'react';

const formatCurrency = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
}).format(Number(value) || 0);

const PriceDisplay = ({ price, salePrice, className = '' }) => {
  const onSale = Number(salePrice) > 0 && Number(salePrice) < Number(price);
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      <span className={`font-display text-base font-bold ${onSale ? 'text-red-600' : 'text-slate-950'}`}>
        {formatCurrency(onSale ? salePrice : price)}
      </span>
      {onSale && <span className="text-xs font-medium text-slate-500 line-through">{formatCurrency(price)}</span>}
    </div>
  );
};

export { formatCurrency };
export default PriceDisplay;
