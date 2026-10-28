import React, { useContext, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { OperationsDialogContext } from '../../context/OperationsDialogContext';

const sizeMap = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-xl', '2xl': 'sm:max-w-2xl', '3xl': 'sm:max-w-5xl' };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

// Staff can sign out from an open drawer. Release their body lock only after
// the final dialog closes, regardless of nested-dialog unmount order.
let staffDialogCount = 0;
let staffPreviousOverflow = '';
const lockStaffDialogScroll = () => {
  if (staffDialogCount === 0) staffPreviousOverflow = document.body.style.overflow;
  staffDialogCount += 1;
  document.body.style.overflow = 'hidden';
  return () => {
    staffDialogCount -= 1;
    if (staffDialogCount === 0) document.body.style.overflow = staffPreviousOverflow;
  };
};

const Modal = ({ isOpen, onClose, title, size = 'lg', returnFocusRef, presentation = 'modal', tone = 'default', children }) => {
  const operations = useContext(OperationsDialogContext);
  const panelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const releaseStaffScroll = operations === 'staff' || operations === 'owner' || operations === 'system' ? lockStaffDialogScroll() : null;
    if (!releaseStaffScroll) document.body.style.overflow = 'hidden';
    // Respect a child that already took focus (e.g. an autoFocus field); otherwise focus the dialog.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (releaseStaffScroll) releaseStaffScroll();
      else document.body.style.overflow = previousOverflow;
      const focusTarget = returnFocusRef?.current ?? previouslyFocused;
      if (focusTarget instanceof HTMLElement && focusTarget.isConnected) {
        focusTarget.focus({ preventScroll: true });
      }
    };
  }, [isOpen, returnFocusRef, operations]);

  if (!isOpen) return null;

  // Handled on the dialog element (not document) so a nested dialog consumes the key first.
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose?.();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter((element) => element.offsetParent !== null);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={`brand-overlay brand-overlay-${presentation} brand-overlay-tone-${tone} fixed inset-0 z-[90] flex items-end justify-center sm:items-start sm:overflow-y-auto sm:px-4 sm:py-[8vh]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
    >
      <button type="button" tabIndex={-1} className="fixed inset-0 bg-slate-950/55" onClick={onClose} aria-label="Close dialog" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`brand-dialog-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl outline-none animate-scaleIn sm:max-h-[84vh] sm:rounded-xl ${sizeMap[size] || sizeMap.lg}`}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 id={titleId} className="min-w-0 truncate font-display text-2xl font-semibold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className={`overscroll-contain flex-1 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${operations && tone === 'default' ? 'operations-dialog-content operations-content' : ''} ${operations === 'staff' && tone === 'default' ? 'staff-dialog-content' : ''} ${operations === 'owner' && tone === 'default' ? 'owner-dialog-content' : ''}`}>{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
