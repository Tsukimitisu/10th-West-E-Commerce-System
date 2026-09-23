import React from 'react';

const SectionCard = ({ title, description, action, children, className = '', padded = true }) => (
  <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
    {(title || description || action) && (
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5">
        <div>
          {title && <h2 className="font-display text-base font-semibold text-slate-950">{title}</h2>}
          {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
        {action}
      </header>
    )}
    <div className={padded ? 'p-4 sm:p-5' : ''}>{children}</div>
  </section>
);

export default SectionCard;
