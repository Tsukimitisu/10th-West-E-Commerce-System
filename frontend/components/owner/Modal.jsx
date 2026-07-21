import React from 'react';
import { X } from 'lucide-react';

const sizeMap = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl' };

const Modal = ({ isOpen, onClose, title, size = 'lg', children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto px-4 py-[8vh]" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Close modal" />
      <div className={`relative flex max-h-[84vh] w-full ${sizeMap[size]} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-in`}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-display text-base font-semibold text-slate-950">{title}</h3>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
};

export default Modal;


