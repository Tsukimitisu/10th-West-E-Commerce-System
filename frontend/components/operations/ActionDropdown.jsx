import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { createPortal } from 'react-dom';

const ActionDropdown = ({ items, label = 'Row actions' }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const openUpward = window.innerHeight - rect.bottom < 230;
      setPosition(openUpward
        ? { bottom: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right }
        : { top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setOpen((value) => !value);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeForViewportChange = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', closeForViewportChange);
    window.addEventListener('scroll', closeForViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', closeForViewportChange);
      window.removeEventListener('scroll', closeForViewportChange, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && position && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={position}
          className="fixed z-[150] w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.destructive
                    ? 'text-red-700 hover:bg-red-50'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {Icon && <Icon size={15} className="shrink-0" />}
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
};

export default ActionDropdown;
