import React, { useId } from 'react';
import { Search } from 'lucide-react';
import BrandButton from './BrandButton';
import Modal from '../owner/Modal';
import EmptyState from './EmptyState';
import StatusBadge from './StatusBadge';

export { default as Button } from './BrandButton';
export { default as Price } from './PriceDisplay';
export { default as Skeleton } from './LoadingSkeleton';
export { default as DataToolbar } from '../operations/FilterBar';

export const IconButton = ({ label, children, className = '', ...props }) => <button type="button" aria-label={label} className={`brand-icon-button ${className}`} {...props}>{children}</button>;

const Field = ({ as: Element = 'input', label, hint, error, id, className = '', children, ...props }) => {
  const generatedId = useId();
  const fieldId = id || generatedId;
  return <div className={`brand-field ${className}`}>
    {label && <label htmlFor={fieldId}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>}
    <Element id={fieldId} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${fieldId}-hint` : undefined} className="brand-input" {...props}>{children}</Element>
    {(hint || error) && <p id={`${fieldId}-hint`} role={error ? 'alert' : undefined} className={error ? 'brand-field-error' : 'brand-field-hint'}>{error || hint}</p>}
  </div>;
};

export const Input = (props) => <Field {...props} />;
export const Select = (props) => <Field as="select" {...props} />;
export const Textarea = (props) => <Field as="textarea" {...props} />;
export const SearchInput = ({ label = 'Search', className = '', ...props }) => <div className={`brand-search ${className}`}><Search size={18} aria-hidden="true" /><Field label={label} type="search" {...props} /></div>;
export const Checkbox = ({ label, className = '', ...props }) => <label className={`brand-choice ${className}`}><input type="checkbox" {...props} /><span>{label}</span></label>;
export const Radio = ({ label, className = '', ...props }) => <label className={`brand-choice ${className}`}><input type="radio" {...props} /><span>{label}</span></label>;
export const Card = ({ as: Element = 'section', className = '', children, ...props }) => <Element className={`brand-card ${className}`} {...props}>{children}</Element>;
export const SectionHeader = ({ title, description, action }) => <div className="brand-section-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
export const StockBadge = ({ quantity, minimum = 5 }) => <StatusBadge tone={quantity <= 0 ? 'danger' : quantity <= minimum ? 'warning' : 'success'} dot>{quantity <= 0 ? 'Out of stock' : quantity <= minimum ? `Low stock · ${quantity} left` : 'In stock'}</StatusBadge>;
export const DataTable = ({ label, children, className = '' }) => <div role="region" aria-label={label} tabIndex={0} className={`brand-table-scroll ${className}`}><table>{children}</table></div>;
export const Pagination = ({ page, totalPages, onChange }) => <nav className="brand-pagination" aria-label="Pagination"><BrandButton variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</BrandButton><span aria-live="polite">Page {page} of {totalPages}</span><BrandButton variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</BrandButton></nav>;
// Button navigation avoids ARIA tab semantics unless callers implement tab panels.
export const Tabs = ({ label, items, value, onChange }) => <nav className="brand-tabs" aria-label={label}>{items.map((item) => <button type="button" key={item.value} aria-current={value === item.value ? 'page' : undefined} onClick={() => onChange(item.value)}>{item.label}</button>)}</nav>;
export const Drawer = (props) => <Modal {...props} presentation="drawer" />;
export const BottomSheet = (props) => <Modal {...props} presentation="sheet" />;
export { default as Toast } from '../Toast';
export const ErrorState = (props) => <EmptyState tone="error" {...props} />;
export const ConfirmationDialog = ({ isOpen, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger = false, busy = false }) => <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"><p className="text-sm leading-6 text-slate-600">{description}</p><div className="mt-6 flex justify-end gap-3"><BrandButton variant="secondary" onClick={onClose} disabled={busy}>Cancel</BrandButton><BrandButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : confirmLabel}</BrandButton></div></Modal>;
