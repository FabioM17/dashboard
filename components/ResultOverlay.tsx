import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ResultStatus = 'success' | 'error' | 'info' | 'warning';

interface ResultOverlayProps {
  show: boolean;
  status: ResultStatus;
  title?: string;
  message?: string;
  onClose?: () => void;
  autoCloseMs?: number; // e.g. 3000 to auto close in 3s
}

const statusStyles: Record<ResultStatus, { bg: string; text: string; iconColor: string }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-700', iconColor: 'text-emerald-600' },
  error: { bg: 'bg-red-50', text: 'text-red-700', iconColor: 'text-red-600' },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', iconColor: 'text-blue-600' },
  warning: { bg: 'bg-yellow-50', text: 'text-yellow-700', iconColor: 'text-yellow-600' },
};

const StatusIcon: React.FC<{ status: ResultStatus }> = ({ status }) => {
  const common = 'w-6 h-6';
  switch (status) {
    case 'success':
      return <CheckCircle2 className={`${common} ${statusStyles.success.iconColor}`} />;
    case 'error':
      return <XCircle className={`${common} ${statusStyles.error.iconColor}`} />;
    case 'warning':
      return <AlertTriangle className={`${common} ${statusStyles.warning.iconColor}`} />;
    default:
      return <Info className={`${common} ${statusStyles.info.iconColor}`} />;
  }
};

const ResultOverlay: React.FC<ResultOverlayProps> = ({ show, status, title, message, onClose, autoCloseMs }) => {
  useEffect(() => {
    if (!show || !autoCloseMs) return;
    const t = setTimeout(() => onClose && onClose(), autoCloseMs);
    return () => clearTimeout(t);
  }, [show, autoCloseMs, onClose]);

  if (!show) return null;

  const styles = statusStyles[status];

  return (
    <div className="fixed inset-0 z-[61] bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
        <div className="flex items-start gap-3">
          <div className={`${styles.bg} rounded-lg p-2 shrink-0`}>
            <StatusIcon status={status} />
          </div>
          <div className="flex-1">
            {title && <h4 className={`font-bold text-sm ${styles.text}`}>{title}</h4>}
            {message && <p className="text-sm text-slate-700 mt-1">{message}</p>}
          </div>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          )}
        </div>
        {onClose && (
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-sm font-medium">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultOverlay;
