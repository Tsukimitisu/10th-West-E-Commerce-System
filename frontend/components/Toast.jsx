import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, Bell } from 'lucide-react';

const Toast = ({ message, type = 'info', duration = 5000, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const icons = {
        success: <CheckCircle className="text-green-500" size={18} />,
        error: <AlertCircle className="text-red-500" size={18} />,
        info: <Info className="text-blue-500" size={18} />,
        order: <Bell className="text-purple-500" size={18} />,
    };

    const bgColors = {
        success: 'bg-green-50 border-green-100',
        error: 'bg-red-50 border-red-100',
        info: 'bg-blue-50 border-blue-100',
        order: 'bg-purple-50 border-purple-100',
    };

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-lg backdrop-blur-md bg-white/80 animate-in fade-in slide-in-from-top-4 duration-300 ${bgColors[type] || bgColors.info}`}>
            <div className="flex-shrink-0">{icons[type] || icons.info}</div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 leading-tight">{message}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={14} />
            </button>
        </div>
    );
};

export const ToastContainer = ({ toasts, removeToast }) => {
    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
            {toasts.map(toast => (
                <div key={toast.id} className="pointer-events-auto">
                    <Toast {...toast} onClose={() => removeToast(toast.id)} />
                </div>
            ))}
        </div>
    );
};

export default Toast;
