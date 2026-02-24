import React, { useState, useRef, useEffect } from 'react';
import { X, Download, AlertTriangle, Loader2, Play, Pause, Volume2, File, FileText } from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

// ==================== IMAGE VIEWER ====================
interface ImageViewerProps {
  src: string;
  alt?: string;
  onError?: () => void;
  onLoad?: () => void;
  isLoading?: boolean;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ src, alt, onError, onLoad, isLoading }) => {
  const [imgError, setImgError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (imgError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 max-w-sm">
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">No se pudo cargar la imagen</p>
            <p className="text-xs text-red-600 mt-1">Verifica que el archivo existe</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 flex items-center justify-center min-h-[160px] max-w-sm">
        <div className="text-center">
          <Loader2 size={28} className="animate-spin text-slate-400 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Cargando imagen...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-sm cursor-pointer rounded-lg overflow-hidden group">
        <img 
          src={src} 
          alt={alt || "Imagen"} 
          className="w-full h-auto max-h-72 object-cover rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 group-hover:brightness-95"
          onError={() => {
            setImgError(true);
            onError?.();
          }}
          onLoad={onLoad}
          onClick={() => setLightboxOpen(true)}
        />
      </div>

      {/* Lightbox para galería full-screen */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={[{ src }]}
        render={{
          buttonPrev: () => null,
          buttonNext: () => null,
          buttonClose: () => (
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 z-50 bg-black bg-opacity-50 hover:bg-opacity-75 text-white p-2 rounded-full transition-all"
              title="Cerrar (ESC)"
            >
              <X size={24} />
            </button>
          ),
        }}
      />
    </>
  );
};

// ==================== AUDIO PLAYER (WhatsApp-like) ====================
interface AudioPlayerProps {
  src: string;
  duration?: string;
  onError?: () => void;
  isLoading?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, duration, onError, isLoading }) => {
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  if (audioError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 max-w-sm">
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">No se pudo cargar el audio</p>
            <p className="text-xs text-red-600 mt-1">Verifica que el archivo existe</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center justify-center min-h-[60px] max-w-sm">
        <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
        <p className="text-xs text-slate-500">Cargando audio...</p>
      </div>
    );
  }

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-xs bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-full shadow-md hover:shadow-lg transition-shadow p-3 flex items-center gap-3">
      <audio
        ref={audioRef}
        src={src}
        onError={() => {
          setAudioError(true);
          onError?.();
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setTotalDuration(audioRef.current.duration || 0);
          }
        }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onEnded={() => setIsPlaying(false)}
      />
      
      <button
        onClick={handlePlayPause}
        className="bg-green-500 hover:bg-green-600 text-white rounded-full p-2.5 flex-shrink-0 cursor-pointer transition-all shadow-md active:scale-95"
      >
        {isPlaying ? (
          <Pause size={18} fill="currentColor" />
        ) : (
          <Play size={18} fill="currentColor" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-green-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all"
            style={{
              width: totalDuration ? `${(currentTime / totalDuration) * 100}%` : '0%'
            }}
          />
        </div>
        <div className="text-xs text-green-700 font-medium mt-1">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </div>
      </div>

      <button
        onClick={() => {
          if (audioRef.current) {
            audioRef.current.volume = audioRef.current.volume > 0 ? 0 : 1;
          }
        }}
        className="text-green-600 hover:text-green-700 flex-shrink-0 transition-colors"
      >
        <Volume2 size={18} />
      </button>
    </div>
  );
};


// ==================== VIDEO PLAYER ====================
interface VideoPlayerProps {
  src: string;
  onError?: () => void;
  isLoading?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, onError, isLoading }) => {
  const [videoError, setVideoError] = useState(false);

  if (videoError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 max-w-sm">
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">No se pudo cargar el video</p>
            <p className="text-xs text-red-600 mt-1">Verifica que el archivo existe</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 flex items-center justify-center min-h-[160px] max-w-sm">
        <div className="text-center">
          <Loader2 size={28} className="animate-spin text-slate-400 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Cargando video...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100 max-w-sm shadow-md">
      <video 
        controls 
        src={src}
        className="w-full h-auto max-h-72 bg-black"
        onError={() => {
          setVideoError(true);
          onError?.();
        }}
      />
    </div>
  );
};

// ==================== DOCUMENT VIEWER (With Office Support) ====================
interface DocumentViewerProps {
  src: string;
  fileName?: string;
  fileSize?: string;
  mimeType?: string;
  onError?: () => void;
  isLoading?: boolean;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
  src, 
  fileName, 
  fileSize, 
  mimeType,
  onError, 
  isLoading 
}) => {
  const [docError, setDocError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const getFileIcon = (mimeType?: string, fileName?: string) => {
    if (!mimeType && !fileName) return '📄';
    
    const combined = `${mimeType || ''} ${fileName || ''}`.toLowerCase();
    
    if (mimeType?.includes('pdf') || fileName?.includes('.pdf')) return '📕';
    if (combined.includes('word') || combined.includes('docx') || combined.includes('.doc')) return '📘';
    if (combined.includes('excel') || combined.includes('sheet') || combined.includes('xlsx') || combined.includes('.xls')) return '📗';
    if (combined.includes('powerpoint') || combined.includes('presentation') || combined.includes('pptx') || combined.includes('.ppt')) return '📙';
    if (combined.includes('text') || combined.includes('.txt')) return '📝';
    if (combined.includes('spreadsheet')) return '📊';
    return '📎';
  };

  const getColorClass = (mimeType?: string, fileName?: string) => {
    const combined = `${mimeType || ''} ${fileName || ''}`.toLowerCase();
    
    if (mimeType?.includes('pdf') || fileName?.includes('.pdf')) 
      return 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100';
    if (combined.includes('word') || combined.includes('docx') || combined.includes('.doc')) 
      return 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100';
    if (combined.includes('excel') || combined.includes('sheet') || combined.includes('xlsx') || combined.includes('.xls')) 
      return 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100';
    if (combined.includes('powerpoint') || combined.includes('presentation') || combined.includes('pptx') || combined.includes('.ppt')) 
      return 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100';
    if (combined.includes('spreadsheet'))
      return 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100';
    return 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100';
  };

  const isOfficeFile = (mimeType?: string, fileName?: string) => {
    const combined = `${mimeType || ''} ${fileName || ''}`.toLowerCase();
    return combined.includes('word') || 
           combined.includes('excel') || 
           combined.includes('powerpoint') ||
           combined.includes('docx') ||
           combined.includes('xlsx') ||
           combined.includes('pptx') ||
           combined.includes('.doc') ||
           combined.includes('.xls') ||
           combined.includes('.ppt');
  };

  if (docError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 max-w-sm">
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">No se pudo cargar el documento</p>
            <p className="text-xs text-red-600 mt-1">Verifica que el archivo existe</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center justify-center min-h-[80px] max-w-sm">
        <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
        <p className="text-xs text-slate-500">Cargando documento...</p>
      </div>
    );
  }

  const colorClass = getColorClass(mimeType, fileName);

  return (
    <div className="max-w-sm space-y-3">
      {/* Preview Card */}
      {isOfficeFile(mimeType, fileName) && (
        <div 
          onClick={() => setShowPreview(true)}
          className={`rounded-lg border ${colorClass} p-4 cursor-pointer transition-all shadow-md hover:shadow-lg`}
        >
          <div className="flex items-start gap-3">
            <div className="text-3xl flex-shrink-0">
              {getFileIcon(mimeType, fileName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate hover:underline">
                {fileName || 'Documento'}
              </p>
              <div className="text-xs opacity-70 mt-1 space-y-0.5">
                {mimeType && <p className="truncate">{mimeType}</p>}
                {fileSize && <p>{fileSize}</p>}
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPreview(true);
                }}
                className="text-xs mt-2 px-2 py-1 bg-white/50 hover:bg-white rounded transition-colors font-medium"
              >
                👁️ Ver Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Card */}
      <div className={`rounded-lg border ${colorClass} p-4 shadow-md hover:shadow-lg transition-shadow`}>
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0">
            {getFileIcon(mimeType, fileName)}
          </div>
          <div className="flex-1 min-w-0">
            <a
              href={src}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold hover:underline break-words flex items-center gap-2 group transition-colors"
            >
              {fileName || 'Descargar documento'}
              <Download size={14} className="flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
            </a>
            <div className="text-xs opacity-75 mt-1 space-y-0.5">
              {mimeType && <p>{mimeType}</p>}
              {fileSize && <p>{fileSize}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && isOfficeFile(mimeType, fileName) && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div 
            className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-slate-100 to-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-2xl flex-shrink-0">
                  {getFileIcon(mimeType, fileName)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{fileName || 'Documento'}</p>
                  <p className="text-xs text-slate-600">{mimeType || 'Archivo'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="text-slate-600 hover:text-slate-900 p-2 hover:bg-white rounded-lg transition-colors flex-shrink-0"
                title="Cerrar (ESC)"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50 p-6 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4 opacity-60">
                  {getFileIcon(mimeType, fileName)}
                </div>
                <p className="text-sm font-medium text-slate-700 mb-2">{fileName}</p>
                <p className="text-xs text-slate-500 mb-4">
                  Archivo {mimeType?.split('/').pop()?.toUpperCase() || 'documento'}
                </p>
                <a
                  href={src}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Download size={16} />
                  Descargar ahora
                </a>
                <p className="text-xs text-slate-500 mt-4">
                  Para ver el contenido completo, descarga el archivo
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
