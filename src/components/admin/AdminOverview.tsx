import React from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FileClock,
  GraduationCap,
  Images,
  Link2,
  Lock,
  Send,
  ShieldCheck,
  Users,
  Video
} from 'lucide-react';
import {
  buildPublicTokenUrl,
  DraftAlbum,
  DraftStudent,
  isValidAccessToken
} from '../../types/album';

interface AdminOverviewProps {
  albums: DraftAlbum[];
  activeAlbum: DraftAlbum;
  students: DraftStudent[];
  onSelectAlbum: (albumId: string) => void;
  onNavigateSection: (
    section: 'resumen' | 'multimedia' | 'alumnos' | 'publicar'
  ) => void;
  onOpenPreview: () => void;
  onPublish: () => Promise<void>;
  isPublishing: boolean;
  onCopyUrl: (url: string, label?: string) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  albums,
  activeAlbum,
  students,
  onSelectAlbum,
  onNavigateSection,
  onOpenPreview,
  onPublish,
  isPublishing,
  onCopyUrl
}) => {
  const activeTokensCount = students.filter(
    (s) =>
      s.status === 'publicado' &&
      !s.tokenRevoked &&
      isValidAccessToken(s.accessToken)
  ).length;

  const hasGeneralToken =
    activeAlbum.generalShareEnabled &&
    !activeAlbum.generalTokenRevoked &&
    isValidAccessToken(activeAlbum.generalAccessToken);

  const generalUrl = hasGeneralToken
    ? buildPublicTokenUrl(activeAlbum.generalAccessToken)
    : '';

  return (
    <div className="space-y-6">
      {/* Cabecera de contexto */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <span>Nivel {activeAlbum.nivel}</span>
            <span>·</span>
            <span className="tabular-nums">Promoción {activeAlbum.anio}</span>
            <span>·</span>
            <span
              className={
                activeAlbum.status === 'publicado'
                  ? 'text-emerald-700 font-semibold'
                  : 'text-amber-700 font-semibold'
              }
            >
              {activeAlbum.status === 'publicado' ? 'Publicado' : 'En borrador'}
            </span>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 truncate">
            {activeAlbum.colegio}
          </h2>
          <p className="text-sm text-slate-600 truncate">
            {activeAlbum.promocion}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenPreview}
            className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            Vista previa
          </button>

          <button
            type="button"
            onClick={onPublish}
            disabled={isPublishing}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {isPublishing
              ? 'Publicando...'
              : activeAlbum.hasUnpublishedChanges
                ? 'Publicar cambios'
                : 'Sincronizar tokens'}
          </button>
        </div>
      </div>

      {/* Aviso discreto si hay cambios sin publicar */}
      {activeAlbum.hasUnpublishedChanges && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
          <div className="flex items-center gap-2.5">
            <FileClock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Hay ediciones guardadas en borrador que aún no se han sincronizado con los enlaces privados de las familias.
            </span>
          </div>
          <button
            type="button"
            onClick={onPublish}
            disabled={isPublishing}
            className="text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 self-start sm:self-center cursor-pointer"
          >
            Publicar ahora
          </button>
        </div>
      )}

      {/* 4 KPIs esenciales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Álbumes totales</span>
            <GraduationCap className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums">
            {albums.length}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {albums.filter((a) => a.status === 'publicado').length} publicados
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Tokens individuales</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums">
            {activeTokensCount}
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            de {students.length} alumnos registrados
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Multimedia (YouTube)</span>
            <Images className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums">
            {activeAlbum.fotos.length}
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            fotos · {activeAlbum.videos.length} videos YouTube
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Privacidad menores</span>
            <ShieldCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-sm font-semibold text-slate-900 mt-1">
            {activeAlbum.allowGroupAnuario
              ? 'Anuario grupal activo'
              : 'Solo tarjeta individual'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {activeAlbum.status === 'publicado' ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Enlaces activos
              </span>
            ) : (
              'Borrador bloqueado'
            )}
          </p>
        </div>
      </div>

      {/* Privacidad y accesos directos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Acceso privado por token para familias
            </h3>
            <button
              type="button"
              onClick={() => onNavigateSection('publicar')}
              className="text-xs font-medium text-[#183a6e] hover:underline cursor-pointer"
            >
              Configurar privacidad y WhatsApp
            </button>
          </div>

          {hasGeneralToken ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 h-10 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 overflow-hidden">
                <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate font-mono">{generalUrl}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onCopyUrl(generalUrl, 'Enlace general por token copiado')
                }
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shrink-0 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar token
              </button>
              <a
                href={generalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Enlace general desactivado para mayor privacidad. Cada padre accede exclusivamente con su enlace individual desde la pestaña <strong>Alumnos</strong>.
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('alumnos')}
                className="text-xs font-semibold text-[#183a6e] whitespace-nowrap hover:underline cursor-pointer"
              >
                Ir a Alumnos
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigateSection('multimedia')}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left transition-colors cursor-pointer"
            >
              <Images className="w-4 h-4 text-[#183a6e] shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Fotos y música
                </div>
                <div className="text-[11px] text-slate-500">
                  Portada, paleta y galería
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSection('multimedia')}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left transition-colors cursor-pointer"
            >
              <Video className="w-4 h-4 text-[#183a6e] shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Videos YouTube
                </div>
                <div className="text-[11px] text-slate-500">
                  Enlaces desde tu cuenta
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSection('alumnos')}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4 text-[#183a6e] shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Tokens y WhatsApp
                </div>
                <div className="text-[11px] text-slate-500">
                  Envío y revocación individual
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Lista rápida de clientes/álbumes */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Álbumes recientes
          </h3>
          <div className="space-y-2">
            {albums.map((alb) => {
              const isCurrent = alb.id === activeAlbum.id;
              return (
                <button
                  key={alb.id}
                  type="button"
                  onClick={() => onSelectAlbum(alb.id)}
                  className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    isCurrent
                      ? 'border-[#183a6e] bg-slate-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {alb.colegio}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {alb.nivel} · {alb.anio}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-medium shrink-0 ${
                      alb.status === 'publicado'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {alb.status === 'publicado' ? 'Publicado' : 'Borrador'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
