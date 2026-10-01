import React from 'react';
import { Link } from 'react-router-dom';

const BrandMark = ({ compact = false, dark = false, link = true, className = '', ...props }) => {
  const content = (
    <>
      <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[#e53935] to-[#f97316] text-sm font-black text-white shadow-[0_8px_24px_rgba(229,57,53,0.28)]">
        <span className="absolute -right-3 top-0 h-full w-5 -skew-x-12 bg-white/16" aria-hidden="true" />
        <span className="relative">10</span>
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className={`block font-display text-[17px] font-extrabold leading-none tracking-[-0.02em] ${dark ? 'text-white' : 'text-slate-950'}`}>
            10TH WEST
          </span>
          <span className="mt-1 block text-[9px] font-bold uppercase leading-none tracking-[0.25em] text-orange-500">
            Moto Parts
          </span>
        </span>
      )}
    </>
  );

  const classes = `inline-flex items-center gap-2.5 ${className}`;
  return link ? (
    <Link to="/" className={classes} aria-label="10th West Moto home" {...props}>
      {content}
    </Link>
  ) : (
    <div className={classes} aria-label="10th West Moto" {...props}>
      {content}
    </div>
  );
};

export default BrandMark;
