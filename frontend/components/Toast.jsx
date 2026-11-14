import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, Bell } from 'lucide-react';

const icons = {
    success: <CheckCircle className="text-emerald-600" size={18} aria-hidden="true" />,
    error: <AlertCircle className="text-red-600" size={18} aria-hidden="true" />,
    info: <Info className="text-slate-900" size={18} aria-hidden="true" />,
    order: <Bell className="text-orange-600" size={18} aria-hidden="true" />,
};

const borders = {
    success: 'border-emerald-200',
    error: 'border-red-200',
    info: 'border-slate-200',
    order: 'border-orange-200',
};

const Toast = ({ message, type = 'info', duration = 5000, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    return (
        <div role={type === 'error' ? 'alert' : 'status'} className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg animate-fade-in ${borders[type] || borders.info}`}>
            <div className="flex-shrink-0">{icons[type] || icons.info}</div>
            <p className="min-w-0 flex-1 text-sm font-semibold leading-tight text-slate-900">{message}</p>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss notification">
                <X size={14} />
            </button>
        </div>
    );
};

export const ToastContainer = ({ toasts, removeToast }) => {
    return (
        <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
            {toasts.map(toast => (
                <div key={toast.id} className="pointer-events-auto">
                    <Toast {...toast} onClose={() => removeToast(toast.id)} />
                </div>
            ))}
        </div>
    );
};

export default Toast;
