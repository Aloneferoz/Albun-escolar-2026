import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Code2,
  ImagePlus,
  Music,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  Video,
  X
} from 'lucide-react';
import {
  AnuarioDraftEntry,
  BLUEPRINT_LIMITS,
  ColorPalette,
  DraftAlbum,
  DraftStudent,
  FotoItem,
  getYouTubeThumbnailUrl,
  NivelEducativo,
  PaletaVisual,
  PaletteColors,
  parseAnuarioSnippet,
  resolveAlbumPalette,
  slugify,
  VideoItem
} from '../../types/album';
import {
  AdminPaletteManager,
  PaletteAssignmentTarget
} from './AdminPaletteManager';

interface AdminAlbumEditorProps {
  album: DraftAlbum;
  allAlbums: DraftAlbum[];
  students: DraftStudent[];
  palettes: ColorPalette[];
  onSaveAlbum: (
    patch: Partial<
      Omit<DraftAlbum, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>
    >
  ) => Promise<void>;
  onAssignPaletteTargets: (
    palette: ColorPalette,
    target: PaletteAssignmentTarget
  ) => Promise<void>;
  onClearStudentPalette: (studentId: string) => Promise<void>;
  onSaveAnuario: (entries: AnuarioDraftEntry[]) => Promise<void>;
  onSavePalette: (
    input: {
      codigo: string;
      nombre: string;
      descripcion?: string;
      colorPrincipal: string;
      colorSecundario: string;
      colorAcento: string;
      colorTexto: string;
      activa: boolean;
      esPredeterminada?: boolean;
    },
    options: {
      mode: 'create' | 'edit';
      assignedAlbumIds: string[];
      allAlbumIds: string[];
    }
  ) => Promise<ColorPalette>;
  onDeletePalette: (
    paletteCode: string,
    assignedAlbumIds: string[],
    allAlbumIds: string[]
  ) => Promise<void>;
  onNavigateAlumnos: () => void;
  onDeleteAlbum: () => Promise<void>;
  canDeleteAlbum: boolean;
}

export const AdminAlbumEditor: React.FC<AdminAlbumEditorProps> = ({
  album,
  allAlbums,
  students,
  palettes,
  onSaveAlbum,
  onAssignPaletteTargets,
  onClearStudentPalette,
  onSaveAnuario,
  onSavePalette,
  onDeletePalette,
  onNavigateAlumnos,
  onDeleteAlbum,
  canDeleteAlbum
}) => {
  const [subTab, setSubTab] = useState<
    'datos' | 'fotos' | 'videos' | 'anuario' | 'tutora'
  >('datos');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [colegio, setColegio] = useState(album.colegio);
  const [promocion, setPromocion] = useState(album.promocion);
  const [slug, setSlug] = useState(album.slug);
  const [nivel, setNivel] = useState<NivelEducativo>(album.nivel);
  const [anio, setAnio] = useState(album.anio);
  const [paleta, setPaleta] = useState<PaletaVisual>(album.paleta);
  const [paletaConfig, setPaletaConfig] = useState<PaletteColors | undefined>(
    album.paletaConfig
  );
  const [portadaUrl, setPortadaUrl] = useState(album.portadaUrl);
  const [musicaUrl, setMusicaUrl] = useState(album.musicaUrl);

  const [tutoraTitulo, setTutoraTitulo] = useState(album.tutoraTitulo);
  const [tutoraNombre, setTutoraNombre] = useState(album.tutoraNombre);
  const [tutoraCargo, setTutoraCargo] = useState(album.tutoraCargo);
  const [tutoraFotoUrl, setTutoraFotoUrl] = useState(album.tutoraFotoUrl);
  const [tutoraTexto, setTutoraTexto] = useState(album.tutoraTexto);

  const [fotos, setFotos] = useState<FotoItem[]>(album.fotos);
  const [videos, setVideos] = useState<VideoItem[]>(album.videos);
  const [anuarioEntries, setAnuarioEntries] = useState<AnuarioDraftEntry[]>(() =>
    students.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      frase: s.frase,
      fotoUrl: s.fotoUrl
    }))
  );
  const [anuarioDirty, setAnuarioDirty] = useState(false);
  const [importSnippetOpen, setImportSnippetOpen] = useState(false);
  const [snippetText, setSnippetText] = useState('');

  useEffect(() => {
    setColegio(album.colegio);
    setPromocion(album.promocion);
    setSlug(album.slug);
    setNivel(album.nivel);
    setAnio(album.anio);
    setPaleta(album.paleta);
    setPaletaConfig(album.paletaConfig);
    setPortadaUrl(album.portadaUrl);
    setMusicaUrl(album.musicaUrl);
    setTutoraTitulo(album.tutoraTitulo);
    setTutoraNombre(album.tutoraNombre);
    setTutoraCargo(album.tutoraCargo);
    setTutoraFotoUrl(album.tutoraFotoUrl);
    setTutoraTexto(album.tutoraTexto);
    setFotos(album.fotos);
    setVideos(album.videos);
    setAnuarioDirty(false);
    setConfirmDelete(false);
  }, [album.id]);

  useEffect(() => {
    setPaleta(album.paleta);
    setPaletaConfig(album.paletaConfig);
  }, [album.paleta, album.paletaConfig]);

  useEffect(() => {
    if (!anuarioDirty) {
      setAnuarioEntries(
        students.map((s) => ({
          id: s.id,
          nombre: s.nombre,
          frase: s.frase,
          fotoUrl: s.fotoUrl
        }))
      );
    }
  }, [students, anuarioDirty]);

  const showNotice = (text: string) => {
    setSavedNotice(text);
    window.setTimeout(() => setSavedNotice(null), 3000);
  };

  const handleSaveDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const resolved = resolveAlbumPalette(paleta, paletaConfig, palettes);
      await onSaveAlbum({
        colegio,
        promocion,
        slug: slugify(slug, BLUEPRINT_LIMITS.ALBUM_SLUG_MIN),
        nivel,
        anio,
        paleta: resolved.codigo,
        paletaConfig: resolved.colors,
        portadaUrl,
        musicaUrl
      });
      showNotice('Datos del álbum guardados en borrador.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignPaletteTargets = async (
    palette: ColorPalette,
    target: PaletteAssignmentTarget
  ) => {
    if (target.scope === 'album') {
      const colors: PaletteColors = {
        colorPrincipal: palette.colorPrincipal,
        colorSecundario: palette.colorSecundario,
        colorAcento: palette.colorAcento,
        colorTexto: palette.colorTexto
      };
      setPaleta(palette.codigo);
      setPaletaConfig(colors);
      await onAssignPaletteTargets(palette, target);
      showNotice(`Paleta «${palette.nombre}» aplicada a ${album.colegio}.`);
    } else {
      await onAssignPaletteTargets(palette, target);
      showNotice(
        `Paleta «${palette.nombre}» aplicada a ${target.studentIds.length} ${
          target.studentIds.length === 1 ? 'alumno(a)' : 'alumnos(as)'
        } de ${album.colegio}.`
      );
    }
  };

  const handleSaveFotos = async () => {
    setSaving(true);
    try {
      await onSaveAlbum({ fotos });
      showNotice('Galería de fotos guardada en borrador.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVideos = async () => {
    setSaving(true);
    try {
      // Enviamos los videos Y forzamos a que el álbum se marque como publicado
      // y que no haya cambios pendientes.
      await onSaveAlbum({ 
        videos: videos,
        status: 'publicado',
        hasUnpublishedChanges: false
      });
      
      // Cambiamos el mensaje para que sea coherente con tu flujo
      showNotice('Videos guardados y publicados directamente.');
    } catch (error) {
      console.error("Error al guardar los videos:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTutora = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveAlbum({
        tutoraTitulo,
        tutoraNombre,
        tutoraCargo,
        tutoraFotoUrl,
        tutoraTexto
      });
      showNotice('Dedicatoria guardada en borrador.');
    } finally {
      setSaving(false);
    }
  };

  const addPhoto = () => {
    if (fotos.length >= BLUEPRINT_LIMITS.FOTOS_MAX) return;
    setFotos((prev) => [
      ...prev,
      {
        titulo: 'Nuevo momento escolar',
        categoria: 'Ceremonia',
        url: '/src/assets/images/foto_ceremonia_1795554404001.jpg',
        descargaUrl: '/src/assets/images/foto_ceremonia_1795554404001.jpg'
      }
    ]);
  };

  const addVideo = () => {
    if (videos.length >= BLUEPRINT_LIMITS.VIDEOS_MAX) return;
    
    setVideos((prev) => [
      ...prev,
      {
        titulo: 'Video de YouTube',
        duracion: '03:45',
        descripcion: '',
        portadaUrl: '',
        embedUrl: '' // <--- Vacío, para que tú pegues el enlace en la pantalla
      }
    ]);
  };

  const handleSaveAnuario = async () => {
    setSaving(true);
    try {
      await onSaveAnuario(anuarioEntries);
      setAnuarioDirty(false);
      showNotice('Anuario guardado y sincronizado con Alumnos y Tokens.');
    } finally {
      setSaving(false);
    }
  };

  const addAnuarioEntry = () => {
    setAnuarioDirty(true);
    setAnuarioEntries((prev) => [
      ...prev,
      {
        nombre: '',
        frase: 'Gracias por cada recuerdo compartido en nuestra promoción.',
        fotoUrl: '/src/assets/images/alumno_1_1795554404726.jpg'
      }
    ]);
  };

  const moveAnuarioEntry = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= anuarioEntries.length) return;
    setAnuarioDirty(true);
    setAnuarioEntries((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const parsedPreview = parseAnuarioSnippet(snippetText);

  const applySnippetImport = (mode: 'append' | 'replace') => {
    if (!parsedPreview.length) return;
    setAnuarioDirty(true);
    if (mode === 'replace') {
      setAnuarioEntries(parsedPreview);
    } else {
      setAnuarioEntries((prev) => [...prev, ...parsedPreview]);
    }
    setSnippetText('');
    setImportSnippetOpen(false);
    showNotice(
      `${parsedPreview.length} egresados cargados. Pulsa Guardar anuario para aplicar.`
    );
  };

  return (
    <div className="space-y-5">
      {/* Barra de sub-secciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'datos', label: 'Datos y Diseño' },
              { id: 'fotos', label: `Fotos (${fotos.length})` },
              { id: 'videos', label: `Videos YouTube (${videos.length})` },
              { id: 'anuario', label: `Anuario (${anuarioEntries.length})` },
              { id: 'tutora', label: 'Dedicatoria' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`h-9 px-3.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                subTab === tab.id
                  ? 'bg-[#183a6e] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {album.hasUnpublishedChanges && album.status === 'publicado' && (
            <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
              Cambios pendientes de publicar en enlaces públicos
            </span>
          )}
          {savedNotice && (
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              {savedNotice}
            </span>
          )}
        </div>
      </div>

      {/* 1. DATOS Y DISEÑO */}
      {subTab === 'datos' && (
        <form
          onSubmit={handleSaveDatos}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nombre del colegio
              </label>
              <input
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.COLEGIO_MAX}
                value={colegio}
                onChange={(e) => setColegio(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#183a6e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nombre de la promoción
              </label>
              <input
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.PROMOCION_MAX}
                value={promocion}
                onChange={(e) => setPromocion(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#183a6e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Código interno de referencia
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={BLUEPRINT_LIMITS.SLUG_MAX}
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                  )
                }
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-900 focus:outline-none focus:border-[#183a6e]"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Solo uso interno en tu panel. Los padres acceden únicamente por token aleatorio privado.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nivel educativo
                </label>
                <select
                  value={nivel}
                  onChange={(e) => setNivel(e.target.value as NivelEducativo)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:border-[#183a6e]"
                >
                  <option value="Inicial">Inicial</option>
                  <option value="Primaria">Primaria</option>
                  <option value="Secundaria">Secundaria</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Año
                </label>
                <input
                  type="text"
                  required
                  pattern="^[0-9]{4}$"
                  maxLength={4}
                  value={anio}
                  onChange={(e) =>
                    setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm tabular-nums text-slate-900 focus:outline-none focus:border-[#183a6e]"
                />
              </div>
            </div>
          </div>

          {/* Paleta visual administrable de 4 colores */}
          <AdminPaletteManager
            activeAlbum={album}
            allAlbums={allAlbums}
            students={students}
            palettes={palettes}
            selectedCodigo={paleta}
            selectedColors={paletaConfig}
            onAssignPalette={handleAssignPaletteTargets}
            onClearStudentPalette={async (studentId) => {
              await onClearStudentPalette(studentId);
              showNotice('El alumno volverá a usar la paleta del colegio/evento.');
            }}
            onSavePalette={onSavePalette}
            onDeletePalette={onDeletePalette}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                URL de fotografía principal (Portada)
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.URL_MAX}
                value={portadaUrl}
                onChange={(e) => setPortadaUrl(e.target.value)}
                placeholder="https://... o /src/assets/images/..."
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#183a6e]"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                <Music className="w-3.5 h-3.5" />
                URL de música MP3 instrumental (opcional)
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.URL_MAX}
                value={musicaUrl}
                onChange={(e) => setMusicaUrl(e.target.value)}
                placeholder="Vacío = melodía suave integrada"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#183a6e]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            {canDeleteAlbum ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-700 font-medium">
                    ¿Eliminar este álbum, alumnos y tokens?
                  </span>
                  <button
                    type="button"
                    onClick={onDeleteAlbum}
                    className="h-9 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Sí, eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-600 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-medium cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar álbum
                </button>
              )
            ) : (
              <div />
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-60 text-white text-sm font-medium cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar borrador'}
            </button>
          </div>
        </form>
      )}

      {/* 2. GALERÍA DE FOTOS */}
      {subTab === 'fotos' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Fotografías de la promoción
              </h3>
              <p className="text-xs text-slate-500">
                Máximo {BLUEPRINT_LIMITS.FOTOS_MAX} fotografías por álbum.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addPhoto}
                disabled={fotos.length >= BLUEPRINT_LIMITS.FOTOS_MAX}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <ImagePlus className="w-4 h-4" />
                Añadir foto
              </button>
              <button
                type="button"
                onClick={handleSaveFotos}
                disabled={saving}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-xs font-semibold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Guardando...' : 'Guardar fotos'}
              </button>
            </div>
          </div>

          {fotos.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              No hay fotos cargadas todavía. Añade la primera fotografía arriba.
            </p>
          ) : (
            <div className="space-y-3">
              {fotos.map((foto, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-[72px_1fr_160px_1fr_auto] gap-3 items-start p-3 rounded-xl border border-slate-200 bg-slate-50/50"
                >
                  <div className="w-[72px] h-[54px] rounded-lg overflow-hidden bg-slate-200 shrink-0">
                    <img
                      src={foto.url}
                      alt={foto.titulo}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Título
                    </label>
                    <input
                      type="text"
                      maxLength={BLUEPRINT_LIMITS.FOTO_TITULO_MAX}
                      value={foto.titulo}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFotos((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, titulo: val } : item
                          )
                        );
                      }}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Categoría
                    </label>
                    <input
                      type="text"
                      maxLength={BLUEPRINT_LIMITS.FOTO_CATEGORIA_MAX}
                      value={foto.categoria}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFotos((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, categoria: val } : item
                          )
                        );
                      }}
                      placeholder="Ceremonia"
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      URL imagen y descarga
                    </label>
                    <input
                      type="text"
                      maxLength={BLUEPRINT_LIMITS.URL_MAX}
                      value={foto.url}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFotos((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, url: val, descargaUrl: val } : item
                          )
                        );
                      }}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                    />
                  </div>
                  <div className="md:pt-5">
                    <button
                      type="button"
                      onClick={() =>
                        setFotos((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Eliminar foto"
                      className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:text-red-700 text-slate-500 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. VIDEOS DESDE YOUTUBE */}
      {subTab === 'videos' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Videos desde tu cuenta de YouTube
              </h3>
              <p className="text-xs text-slate-500">
                Pega enlaces de YouTube (<code className="font-mono">youtu.be/...</code> o{' '}
                <code className="font-mono">youtube.com/watch?v=...</code>), recomendados como «No listado» para mayor privacidad.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addVideo}
                disabled={videos.length >= BLUEPRINT_LIMITS.VIDEOS_MAX}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Añadir video YouTube
              </button>
              <button
                type="button"
                onClick={handleSaveVideos}
                disabled={saving}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-xs font-semibold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Guardando...' : 'Guardar videos'}
              </button>
            </div>
          </div>

          {videos.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              No hay videos de YouTube configurados en este álbum.
            </p>
          ) : (
            <div className="space-y-4">
              {videos.map((video, idx) => {
                const ytPreview = getYouTubeThumbnailUrl(video.embedUrl);
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <Video className="w-4 h-4 text-[#183a6e]" />
                        <span>Video YouTube #{idx + 1}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setVideos((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Quitar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Título del video
                        </label>
                        <input
                          type="text"
                          maxLength={BLUEPRINT_LIMITS.VIDEO_TITULO_MAX}
                          value={video.titulo}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVideos((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, titulo: val } : item
                              )
                            );
                          }}
                          className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Duración
                        </label>
                        <input
                          type="text"
                          maxLength={BLUEPRINT_LIMITS.VIDEO_DURACION_MAX}
                          value={video.duracion}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVideos((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, duracion: val } : item
                              )
                            );
                          }}
                          placeholder="03:45"
                          className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs tabular-nums text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Enlace de YouTube
                        </label>
                        <input
                          type="url"
                          maxLength={BLUEPRINT_LIMITS.URL_MAX}
                          value={video.embedUrl}
                          placeholder="https://youtu.be/..."
                          onChange={(e) => {
                            const val = e.target.value;
                            const autoThumb = getYouTubeThumbnailUrl(val);
                            setVideos((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? {
                                      ...item,
                                      embedUrl: val,
                                      portadaUrl: item.portadaUrl || autoThumb
                                    }
                                  : item
                              )
                            );
                          }}
                          className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          URL miniatura (vacío = automática de YouTube)
                        </label>
                        <input
                          type="text"
                          maxLength={BLUEPRINT_LIMITS.URL_MAX}
                          value={video.portadaUrl || ''}
                          placeholder={ytPreview || '/src/assets/images/...'}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVideos((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, portadaUrl: val } : item
                              )
                            );
                          }}
                          className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Descripción breve
                      </label>
                      <input
                        type="text"
                        maxLength={BLUEPRINT_LIMITS.VIDEO_DESC_MAX}
                        value={video.descripcion || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVideos((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, descripcion: val } : item
                            )
                          );
                        }}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. ANUARIO DE EGRESADOS ({ nombre, frase, fotoUrl }) */}
      {subTab === 'anuario' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-4 h-4 text-[#183a6e]" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Anuario de egresados (estilo anuario físico)
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  Edita directamente nombre, frase y fotoUrl de cada alumno. Se sincroniza automáticamente con sus enlaces individuales en{' '}
                  <button
                    type="button"
                    onClick={onNavigateAlumnos}
                    className="font-semibold text-[#183a6e] hover:underline cursor-pointer"
                  >
                    Alumnos y Tokens
                  </button>
                  .
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setImportSnippetOpen(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <Code2 className="w-4 h-4" />
                  Pegar bloque alumnos
                </button>
                <button
                  type="button"
                  onClick={addAnuarioEntry}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Añadir egresado
                </button>
                <button
                  type="button"
                  onClick={handleSaveAnuario}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Guardando...' : 'Guardar anuario'}
                </button>
              </div>
            </div>

            {/* Control rápido de visibilidad grupal como anuario físico */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#183a6e] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Visibilidad del anuario para las familias
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {album.allowGroupAnuario
                      ? 'Anuario grupal activo: cada familia verá la cuadrícula completa del salón (como un anuario físico).'
                      : 'Modo privado individual: cada familia verá únicamente la ficha de su hijo(a) hasta que actives el anuario grupal.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await onSaveAlbum({
                    allowGroupAnuario: !album.allowGroupAnuario
                  });
                  showNotice(
                    !album.allowGroupAnuario
                      ? 'Anuario grupal activado. Recuerda publicar cambios.'
                      : 'Modo individual activado. Recuerda publicar cambios.'
                  );
                }}
                className={`h-8 px-3 rounded-lg text-xs font-semibold border shrink-0 cursor-pointer ${
                  album.allowGroupAnuario
                    ? 'bg-[#183a6e] text-white border-[#183a6e]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {album.allowGroupAnuario
                  ? 'Anuario completo activo'
                  : 'Activar anuario completo'}
              </button>
            </div>

            {anuarioDirty && (
              <div className="px-3.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
                <span>Tienes cambios en el anuario sin guardar.</span>
                <button
                  type="button"
                  onClick={handleSaveAnuario}
                  disabled={saving}
                  className="font-semibold underline cursor-pointer"
                >
                  Guardar ahora
                </button>
              </div>
            )}

            {anuarioEntries.length === 0 ? (
              <div className="py-10 text-center space-y-3 border border-dashed border-slate-200 rounded-xl">
                <Users className="w-7 h-7 text-slate-400 mx-auto" />
                <p className="text-sm text-slate-600">
                  Aún no hay egresados en el anuario de este álbum.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={addAnuarioEntry}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#183a6e] text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Añadir primer egresado
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportSnippetOpen(true)}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    <Code2 className="w-4 h-4" />
                    Pegar bloque alumnos
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {anuarioEntries.map((entry, idx) => (
                  <div
                    key={entry.id || `new-${idx}`}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 border border-slate-200 shrink-0">
                        <img
                          src={
                            entry.fotoUrl ||
                            '/src/assets/images/alumno_1_1795554404726.jpg'
                          }
                          alt={entry.nombre || `Egresado ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 tabular-nums">
                            Ficha #{idx + 1}
                          </span>
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveAnuarioEntry(idx, -1)}
                              title="Subir orden"
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-600 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === anuarioEntries.length - 1}
                              onClick={() => moveAnuarioEntry(idx, 1)}
                              title="Bajar orden"
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-600 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAnuarioDirty(true);
                                setAnuarioEntries((prev) =>
                                  prev.filter((_, i) => i !== idx)
                                );
                              }}
                              title="Quitar del anuario"
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:text-red-700 text-slate-500 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          required
                          maxLength={BLUEPRINT_LIMITS.STUDENT_NAME_MAX}
                          value={entry.nombre}
                          placeholder="Nombre completo del alumno"
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnuarioDirty(true);
                            setAnuarioEntries((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, nombre: val } : item
                              )
                            );
                          }}
                          className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Frase de anuario
                      </label>
                      <textarea
                        rows={2}
                        maxLength={BLUEPRINT_LIMITS.STUDENT_FRASE_MAX}
                        value={entry.frase}
                        placeholder="Dedicatoria o recuerdo del egresado..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setAnuarioDirty(true);
                          setAnuarioEntries((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, frase: val } : item
                            )
                          );
                        }}
                        className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        fotoUrl (retrato)
                      </label>
                      <input
                        type="text"
                        maxLength={BLUEPRINT_LIMITS.URL_MAX}
                        value={entry.fotoUrl}
                        placeholder="/src/assets/images/alumno_1_...jpg o https://..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setAnuarioDirty(true);
                          setAnuarioEntries((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, fotoUrl: val } : item
                            )
                          );
                        }}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. DEDICATORIA DE LA TUTORA */}
      {subTab === 'tutora' && (
        <form
          onSubmit={handleSaveTutora}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nombre de la tutora o comité
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.TUTORA_NOMBRE_MAX}
                value={tutoraNombre}
                onChange={(e) => setTutoraNombre(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Cargo o sección
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.TUTORA_CARGO_MAX}
                value={tutoraCargo}
                onChange={(e) => setTutoraCargo(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Título de la carta
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.TUTORA_TITULO_MAX}
                value={tutoraTitulo}
                onChange={(e) => setTutoraTitulo(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                URL retrato de la tutora
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.URL_MAX}
                value={tutoraFotoUrl}
                onChange={(e) => setTutoraFotoUrl(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Texto completo de dedicatoria
            </label>
            <textarea
              rows={6}
              maxLength={BLUEPRINT_LIMITS.TUTORA_TEXTO_MAX}
              value={tutoraTexto}
              onChange={(e) => setTutoraTexto(e.target.value)}
              className="w-full p-3 rounded-lg border border-slate-200 text-sm text-slate-900 leading-relaxed"
            />
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-60 text-white text-sm font-medium cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar dedicatoria'}
            </button>
          </div>
        </form>
      )}

      {/* Modal Importar Bloque alumnos: [ { nombre, frase, fotoUrl } ] */}
      {importSnippetOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                Pegar estructura de anuario (alumnos)
              </h3>
              <button
                type="button"
                onClick={() => setImportSnippetOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Pega directamente el bloque <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">alumnos: [ {'{ nombre, frase, fotoUrl }'} ]</code> o líneas con formato <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">Nombre | Frase | fotoUrl</code>.
              </p>

              <textarea
                rows={10}
                value={snippetText}
                onChange={(e) => setSnippetText(e.target.value)}
                placeholder={`alumnos: [\n  {\n    nombre: "Valeria Sofía Paredes",\n    frase: "Gracias por cada risa en clase...",\n    fotoUrl: "/src/assets/images/alumno_1_1795554404726.jpg"\n  }\n]`}
                className="w-full p-3 rounded-lg border border-slate-200 text-xs font-mono text-slate-900"
              />

              <div className="text-xs font-medium text-slate-600">
                {parsedPreview.length > 0 ? (
                  <span className="text-emerald-700">
                    Detectados {parsedPreview.length} egresados válidos (primero: {parsedPreview[0].nombre}).
                  </span>
                ) : (
                  <span>Pega un bloque válido para detectar los egresados automáticamente.</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setImportSnippetOpen(false)}
                className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={parsedPreview.length === 0}
                onClick={() => applySnippetImport('append')}
                className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold text-slate-800 cursor-pointer"
              >
                Añadir al final ({parsedPreview.length})
              </button>
              <button
                type="button"
                disabled={parsedPreview.length === 0}
                onClick={() => applySnippetImport('replace')}
                className="h-9 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                Reemplazar anuario ({parsedPreview.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
