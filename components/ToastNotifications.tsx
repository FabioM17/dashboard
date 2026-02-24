import React from 'react';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

type ToastStatus = 'success' | 'info' | 'warning';

export type Toast = {
  id: string;
  status: ToastStatus;
  title?: string;
  message?: string;
  duration?: number;
};

type Props = {
  toasts: Toast[];
  onDismiss: (id: string) => void;
};

const statusStyles: Record<ToastStatus, { bg: string; border: string; text: string }> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  info: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
};

const StatusIcon: React.FC<{ status: ToastStatus }> = ({ status }) => {
  const common = 'w-4 h-4 flex-shrink-0';
  if (status === 'success') return <CheckCircle2 className={`${common} text-emerald-500`} />;
  if (status === 'warning') return <AlertTriangle className={`${common} text-amber-500`} />;
  return <Info className={`${common} text-slate-500`} />;
};

export const ToastNotifications: React.FC<Props> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-[320px] max-w-[90vw] pointer-events-none">
      {toasts.map(toast => {
        const styles = statusStyles[toast.status];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto shadow-lg rounded-lg border ${styles.border} ${styles.bg} ${styles.text} p-3 flex gap-3 items-start animate-in slide-in-from-right-4 fade-in duration-200`}
          >
            <StatusIcon status={toast.status} />
            <div className="flex-1 min-w-0">
              {toast.title && <p className="font-semibold text-sm truncate">{toast.title}</p>}
              {toast.message && <p className="text-xs text-slate-600 leading-snug line-clamp-2">{toast.message}</p>}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Cerrar notificación"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastNotifications;
