import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FileClock,
  Globe,
  Lock,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  ShieldCheck
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  buildPublicTokenUrl,
  buildWhatsAppShareUrl,
  DraftAlbum,
  DraftStudent,
  isValidAccessToken,
  PublishStatus
} from '../../types/album';

interface AdminPublishPanelProps {
  album: DraftAlbum;
  students: DraftStudent[];
  onSaveSettings: (patch: {
    whatsappTexto?: string;
    allowGroupAnuario?: boolean;
    generalShareEnabled?: boolean;
  }) => Promise<void>;
  onRegenerateGeneralToken: () => Promise<void>;
  onOpenPreview: () => void;
  onPublish: (status?: PublishStatus) => Promise<void>;
  isPublishing: boolean;
  onCopyUrl: (url: string, label?: string) => void;
}

export const AdminPublishPanel: React.FC<AdminPublishPanelProps> = ({
  album,
  students,
  onSaveSettings,
  onRegenerateGeneralToken,
  onOpenPreview,
  onPublish,
  isPublishing,
  onCopyUrl
}) => {
  const [whatsappTexto, setWhatsappTexto] = useState(
    album.whatsappTexto ||
      '¡Hola familia de {alumno}! Les compartimos con mucho cariño el Álbum Digital privado de la {promocion} ({colegio}). Ábrelo aquí: {link}'
  );
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    setWhatsappTexto(
      album.whatsappTexto ||
        '¡Hola familia de {alumno}! Les compartimos con mucho cariño el Álbum Digital privado de la {promocion} ({colegio}). Ábrelo aquí: {link}'
    );
  }, [album.id, album.whatsappTexto]);

  const hasValidGeneralToken = isValidAccessToken(album.generalAccessToken);
  const generalUrl = hasValidGeneralToken
    ? buildPublicTokenUrl(album.generalAccessToken)
    : '';

  const resolvedGeneralMessage = whatsappTexto
    .replace(/\{colegio\}/g, album.colegio)
    .replace(/\{promocion\}/g, album.promocion)
    .replace(/\{alumno\}/g, 'la promoción')
    .replace(/\{link\}/g, generalUrl);

  const generalWaUrl = buildWhatsAppShareUrl({
    message: resolvedGeneralMessage.includes(generalUrl)
      ? resolvedGeneralMessage
      : `${resolvedGeneralMessage}\n${generalUrl}`
  });

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);
    try {
      await onSaveSettings({ whatsappTexto });
      setTemplateSaved(true);
      window.setTimeout(() => setTemplateSaved(false), 2500);
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control de Publicación y Privacidad de Menores */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {album.status === 'publicado' ? (
                <Globe className="w-4 h-4 text-emerald-700" />
              ) : (
                <Lock className="w-4 h-4 text-amber-700" />
              )}
              <h3 className="text-base font-semibold text-slate-900">
                Publicación y revocación por tokens
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              Los borradores nunca son accesibles para los padres. Solo existen tokens activos cuando el álbum está publicado y no revocado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenPreview}
              className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Vista previa de borrador
            </button>

            {album.status === 'publicado' ? (
              <button
                type="button"
                onClick={() => onPublish('borrador')}
                disabled={isPublishing}
                className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                Pasar a borrador (revocar todos)
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => onPublish('publicado')}
              disabled={isPublishing}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
            >
              <Send className="w-4 h-4" />
              {isPublishing ? 'Sincronizando...' : 'Publicar cambios'}
            </button>
          </div>
        </div>

        {/* Interruptores de privacidad de menores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 mb-1">
                <ShieldCheck className="w-4 h-4 text-[#183a6e]" />
                Anuario grupal en enlaces familiares
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Desactivado (recomendado): cada enlace individual muestra únicamente al alumno de esa familia, protegiendo nombres y retratos de otros menores.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onSaveSettings({ allowGroupAnuario: !album.allowGroupAnuario })
              }
              className={`h-8 px-3 rounded-lg text-xs font-semibold border shrink-0 cursor-pointer ${
                album.allowGroupAnuario
                  ? 'bg-[#183a6e] text-white border-[#183a6e]'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              {album.allowGroupAnuario ? 'Grupal activo' : 'Solo individual'}
            </button>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 mb-1">
                <Lock className="w-4 h-4 text-[#183a6e]" />
                Enlace general de promoción (por token)
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Opcional. Si lo desactivas, solo funcionarán los enlaces individuales generados por cada estudiante.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onSaveSettings({
                  generalShareEnabled: !album.generalShareEnabled
                })
              }
              className={`h-8 px-3 rounded-lg text-xs font-semibold border shrink-0 cursor-pointer ${
                album.generalShareEnabled
                  ? 'bg-[#183a6e] text-white border-[#183a6e]'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              {album.generalShareEnabled ? 'Habilitado' : 'Deshabilitado'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-200 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500 mb-0.5">Estado actual</div>
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              {album.status === 'publicado' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  Publicado con tokens privados
                </>
              ) : (
                <>
                  <FileClock className="w-3.5 h-3.5 text-amber-700" />
                  Borrador (inaccesible para padres)
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500 mb-0.5">Sincronización</div>
            <div className="font-semibold text-slate-900">
              {album.hasUnpublishedChanges
                ? 'Con cambios pendientes por publicar'
                : 'Al día con la última edición'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500 mb-0.5">Tokens individuales activos</div>
            <div className="font-semibold text-slate-900 tabular-nums">
              {
                students.filter(
                  (s) => s.status === 'publicado' && !s.tokenRevoked
                ).length
              }{' '}
              de {students.length} alumnos
            </div>
          </div>
        </div>
      </div>

      {/* Botón Exclusivo para Compartir por WhatsApp + Plantilla */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Botón exclusivo para compartir por WhatsApp
            </h3>
            <p className="text-xs text-slate-600">
              Solo existe en tu panel administrativo. Los enlaces individuales se envían desde la pestaña Alumnos; aquí puedes gestionar el enlace general opcional y la plantilla.
            </p>
          </div>
          {album.generalShareEnabled &&
          hasValidGeneralToken &&
          album.status === 'publicado' ? (
            <a
              href={generalWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#16794c] hover:bg-[#11613d] text-white text-xs font-semibold shrink-0 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Compartir enlace general WhatsApp
            </a>
          ) : null}
        </div>

        {album.generalShareEnabled && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Enlace general por token aleatorio
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                readOnly
                value={
                  hasValidGeneralToken
                    ? generalUrl
                    : 'Publica cambios para activar este token'
                }
                className="flex-1 h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700"
              />
              {hasValidGeneralToken && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      onCopyUrl(generalUrl, 'Enlace general por token copiado')
                    }
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar
                  </button>
                  <button
                    type="button"
                    disabled={regenerating}
                    onClick={async () => {
                      setRegenerating(true);
                      try {
                        await onRegenerateGeneralToken();
                      } finally {
                        setRegenerating(false);
                      }
                    }}
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Rotar token
                  </button>
                  <a
                    href={generalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir
                  </a>
                </>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={handleSaveTemplate}
          className="space-y-3 pt-2 border-t border-slate-200"
        >
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-700">
              Plantilla de mensaje de WhatsApp
            </label>
            <span className="text-[11px] text-slate-500">
              Variables: {'{colegio}'}, {'{promocion}'}, {'{alumno}'}, {'{link}'}
            </span>
          </div>
          <textarea
            rows={3}
            maxLength={BLUEPRINT_LIMITS.WHATSAPP_MAX}
            value={whatsappTexto}
            onChange={(e) => setWhatsappTexto(e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-200 text-sm text-slate-900"
          />

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 mb-1">
              Ejemplo del mensaje por alumno:
            </div>
            <p className="text-xs text-slate-700 whitespace-pre-wrap">
              {whatsappTexto
                .replace(/\{colegio\}/g, album.colegio)
                .replace(/\{promocion\}/g, album.promocion)
                .replace(/\{alumno\}/g, students[0]?.nombre || 'Valeria Sofía')
                .replace(
                  /\{link\}/g,
                  students[0]?.accessToken
                    ? buildPublicTokenUrl(students[0].accessToken)
                    : `${window.location.origin}/?t=...`
                )}
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            {templateSaved && (
              <span className="text-xs font-medium text-emerald-700">
                Plantilla guardada.
              </span>
            )}
            <button
              type="submit"
              disabled={savingTemplate}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-xs font-semibold cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {savingTemplate ? 'Guardando...' : 'Guardar plantilla'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
