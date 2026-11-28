import React, { useState } from 'react';
import { Monitor, Smartphone, X, ExternalLink } from 'lucide-react';
import { DraftStudent, hasStudentCustomPalette } from '../../types/album';

interface AdminPreviewModalProps {
  albumId: string;
  albumTitle: string;
  students?: DraftStudent[];
  onClose: () => void;
}

export const AdminPreviewModal: React.FC<AdminPreviewModalProps> = ({
  albumId,
  albumTitle,
  students = [],
  onClose
}) => {
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  const previewUrl = selectedStudentId
    ? `${window.location.origin}/?previewDraft=${encodeURIComponent(
        albumId
      )}&studentId=${encodeURIComponent(selectedStudentId)}`
    : `${window.location.origin}/?previewDraft=${encodeURIComponent(albumId)}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa privada del álbum"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              Vista previa de borrador · {albumTitle}
            </h3>
            <p className="text-xs text-slate-500">
              Simulación exacta de la vista para padres antes de publicar cambios.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {students.length > 0 && (
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                aria-label="Seleccionar vista de alumno o evento general"
                className="h-8 max-w-[200px] px-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700"
              >
                <option value="">Vista general del evento</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                    {hasStudentCustomPalette(s) ? ' ★' : ''}
                  </option>
                ))}
              </select>
            )}

            <div className="inline-flex bg-slate-200/70 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setDevice('mobile')}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium cursor-pointer ${
                  device === 'mobile'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Móvil
              </button>
              <button
                type="button"
                onClick={() => setDevice('desktop')}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium cursor-pointer ${
                  device === 'desktop'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                Escritorio
              </button>
            </div>

            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Nueva pestaña
            </a>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa"
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 flex items-center justify-center p-4 overflow-hidden">
          <div
            className={`h-full bg-white rounded-xl border border-slate-300 shadow-md overflow-hidden transition-all ${
              device === 'mobile' ? 'w-full max-w-[400px]' : 'w-full'
            }`}
          >
            <iframe
              key={previewUrl}
              src={previewUrl}
              title="Vista previa del álbum"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
