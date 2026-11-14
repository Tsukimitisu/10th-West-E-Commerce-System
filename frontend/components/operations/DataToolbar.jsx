import React, { useId } from 'react';
import { SearchField } from './FilterBar';

export function FilterSelect({ label, children, className = '', ...props }) {
  const id = useId();
  return <div className={`ops-filter-select ${className}`}><label htmlFor={id}>{label}</label><select id={id} {...props}>{children}</select></div>;
}

export function MobileDataCard({ title, reference, status, children, actions }) {
  return <article className="ops-mobile-data-card"><div className="ops-mobile-data-heading"><div className="min-w-0">{reference && <p className="ops-reference">{reference}</p>}<h3>{title}</h3></div>{status}</div>{children}{actions && <div className="ops-mobile-data-actions">{actions}</div>}</article>;
}

export default function DataToolbar({ search, onSearchChange, searchPlaceholder, children, actions, label = 'Table controls' }) {
  return <div className="ops-data-toolbar" role="group" aria-label={label}>{onSearchChange && <SearchField value={search} onChange={onSearchChange} placeholder={searchPlaceholder} className="ops-toolbar-search" />}<div className="ops-toolbar-filters">{children}</div>{actions && <div className="ops-toolbar-actions">{actions}</div>}</div>;
}
