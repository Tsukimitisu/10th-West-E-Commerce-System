import React from 'react';

const PageHeader = ({ title, description, eyebrow, actions, children }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-orange-600">{eyebrow}</p>}
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">{title}</h1>
      {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>}
      {children}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export default PageHeader;
