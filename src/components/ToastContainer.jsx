import React, { useEffect } from 'react';
import { useHomey } from '../context/HomeyContext';
import { CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';

const ICONS = {
    success: <CheckCircle size={16} color="var(--color-success, #22c55e)" />,
    warning: <AlertTriangle size={16} color="var(--color-warning, #f59e0b)" />,
    error:   <XCircle size={16} color="var(--color-danger, #ef4444)" />,
};

const BORDER_COLORS = {
    success: 'var(--color-success, #22c55e)',
    warning: 'var(--color-warning, #f59e0b)',
    error:   'var(--color-danger, #ef4444)',
};

const Toast = ({ toast, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), toast.duration || 4000);
        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onDismiss]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'var(--color-surface-raised, #1e2130)',
            borderLeft: `3px solid ${BORDER_COLORS[toast.type] || BORDER_COLORS.error}`,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            minWidth: '220px',
            maxWidth: '320px',
            pointerEvents: 'auto',
            animation: 'toast-slide-in 0.2s ease',
        }}>
            {ICONS[toast.type] || ICONS.error}
            <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--color-text-primary, #e2e8f0)', lineHeight: 1.3 }}>
                {toast.message}
            </span>
            <button
                onClick={() => onDismiss(toast.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--color-text-secondary, #94a3b8)', display: 'flex' }}
            >
                <X size={13} />
            </button>
        </div>
    );
};

const ToastContainer = () => {
    const { toasts, dismissToast } = useHomey();

    if (!toasts || toasts.length === 0) return null;

    return (
        <>
            <style>{`
                @keyframes toast-slide-in {
                    from { opacity: 0; transform: translateX(20px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
            `}</style>
            <div style={{
                position: 'fixed',
                bottom: '80px',
                right: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                zIndex: 9999,
                pointerEvents: 'none',
            }}>
                {toasts.map(toast => (
                    <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
                ))}
            </div>
        </>
    );
};

export default ToastContainer;
