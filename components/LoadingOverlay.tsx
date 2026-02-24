import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  show: boolean;
  message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ show, message = 'Cargando...' }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-xl p-4 shadow-xl flex items-center gap-3">
        <Loader2 size={20} className="animate-spin text-emerald-600" />
        <span className="text-sm font-medium text-slate-700">{message}</span>
      </div>
    </div>
  );
};

export default LoadingOverlay;
