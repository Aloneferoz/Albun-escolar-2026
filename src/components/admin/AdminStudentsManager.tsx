import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  Copy,
  ExternalLink,
  ListPlus,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  buildPublicTokenUrl,
  buildWhatsAppShareUrl,
  ColorPalette,
  DEFAULT_PALETTES,
  DraftAlbum,
  DraftStudent,
  isValidAccessToken,
  PaletteColors,
  PublishStatus,
  resolveAlbumPalette,
  slugify
} from '../../types/album';

interface AdminStudentsManagerProps {
  album: DraftAlbum;
  students: DraftStudent[];
  palettes?: ColorPalette[];
  onUpsertStudent: (
    studentId: string | null,
    input: {
      nombre: string;
      slug?: string;
      frase: string;
      fotoUrl: string;
      parentPhone: string;
      paleta?: string | null;
      paletaConfig?: PaletteColors;
      accessToken?: string;
      tokenRevoked?: boolean;
      status: PublishStatus;
      order: number;
    }
  ) => Promise<void>;
  onBatchImport: (rawLines: string) => Promise<number>;
  onDeleteStudent: (student: DraftStudent) => Promise<void>;
  onToggleRevoke: (student: DraftStudent, revoked: boolean) => Promise<void>;
  onRegenerateToken: (student: DraftStudent) => Promise<void>;
  onCopyUrl: (url: string, label?: string) => void;
}

export const AdminStudentsManager: React.FC<AdminStudentsManagerProps> = ({
  album,
  students,
  palettes = DEFAULT_PALETTES,
  onUpsertStudent,
  onBatchImport,
  onDeleteStudent,
  onToggleRevoke,
  onRegenerateToken,
  onCopyUrl
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'todos' | PublishStatus | 'revocado'
  >('todos');
  const [editingStudent, setEditingStudent] = useState<DraftStudent | null>(
    null
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null);

  // Estado del modal de alumno
  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [frase, setFrase] = useState('');
  const [fotoUrl, setFotoUrl] = useState(
    '/src/assets/images/alumno_1_1795554404726.jpg'
  );
  const [parentPhone, setParentPhone] = useState('');
  const [studentPaleta, setStudentPaleta] = useState<string>('');
  const [status, setStatus] = useState<PublishStatus>('publicado');
  const [order, setOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  // Estado de carga rápida por lista
  const [batchText, setBatchText] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  const catalog = palettes.length > 0 ? palettes : DEFAULT_PALETTES;
  const albumResolvedPalette = useMemo(
    () => resolveAlbumPalette(album.paleta, album.paletaConfig, catalog),
    [album.paleta, album.paletaConfig, catalog]
  );

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return students.filter((st) => {
      if (statusFilter === 'revocado' && !st.tokenRevoked) return false;
      if (
        (statusFilter === 'publicado' || statusFilter === 'borrador') &&
        st.status !== statusFilter
      ) {
        return false;
      }
      if (!term) return true;
      return (
        st.nombre.toLowerCase().includes(term) ||
        st.accessToken.toLowerCase().includes(term) ||
        st.parentPhone.toLowerCase().includes(term)
      );
    });
  }, [students, searchTerm, statusFilter]);

  const openCreateModal = () => {
    setEditingStudent(null);
    setNombre('');
    setSlug('');
    setFrase(
      'Gracias por cada risa y aprendizaje compartido en nuestra promoción.'
    );
    setFotoUrl('/src/assets/images/alumno_1_1795554404726.jpg');
    setParentPhone('');
    setStudentPaleta('');
    setStatus('publicado');
    setOrder(students.length);
    setIsAddOpen(true);
  };

  const openEditModal = (st: DraftStudent) => {
    setEditingStudent(st);
    setNombre(st.nombre);
    setSlug(st.slug);
    setFrase(st.frase);
    setFotoUrl(st.fotoUrl);
    setParentPhone(st.parentPhone);
    setStudentPaleta(st.paleta || '');
    setStatus(st.status);
    setOrder(st.order);
    setIsAddOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const selectedPaletteObj = studentPaleta
        ? catalog.find((p) => p.codigo === studentPaleta)
        : undefined;
      const customColors = selectedPaletteObj
        ? {
            colorPrincipal: selectedPaletteObj.colorPrincipal,
            colorSecundario: selectedPaletteObj.colorSecundario,
            colorAcento: selectedPaletteObj.colorAcento,
            colorTexto: selectedPaletteObj.colorTexto
          }
        : editingStudent?.paleta === studentPaleta
          ? editingStudent?.paletaConfig
          : undefined;

      await onUpsertStudent(editingStudent ? editingStudent.id : null, {
        nombre,
        slug: slugify(slug || nombre, BLUEPRINT_LIMITS.STUDENT_SLUG_MIN),
        frase,
        fotoUrl,
        parentPhone,
        paleta: studentPaleta || null,
        paletaConfig: studentPaleta ? customColors : undefined,
        accessToken: editingStudent?.accessToken,
        tokenRevoked: editingStudent?.tokenRevoked ?? false,
        status,
        order
      });
      setIsAddOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchText.trim()) return;
    setBatchBusy(true);
    try {
      await onBatchImport(batchText);
      setBatchText('');
      setIsBatchOpen(false);
    } finally {
      setBatchBusy(false);
    }
  };

  const handleMoveOrder = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= students.length) return;
    const current = students[index];
    const swapWith = students[targetIdx];
    await onUpsertStudent(current.id, {
      nombre: current.nombre,
      slug: current.slug,
      frase: current.frase,
      fotoUrl: current.fotoUrl,
      parentPhone: current.parentPhone,
      paleta: current.paleta ?? null,
      paletaConfig: current.paletaConfig,
      accessToken: current.accessToken,
      tokenRevoked: current.tokenRevoked,
      status: current.status,
      order: targetIdx
    });
    await onUpsertStudent(swapWith.id, {
      nombre: swapWith.nombre,
      slug: swapWith.slug,
      frase: swapWith.frase,
      fotoUrl: swapWith.fotoUrl,
      parentPhone: swapWith.parentPhone,
      paleta: swapWith.paleta ?? null,
      paletaConfig: swapWith.paletaConfig,
      accessToken: swapWith.accessToken,
      tokenRevoked: swapWith.tokenRevoked,
      status: swapWith.status,
      order: index
    });
  };

  const buildStudentWhatsAppHref = (st: DraftStudent) => {
    const personalUrl = buildPublicTokenUrl(st.accessToken);
    const template =
      album.whatsappTexto && album.whatsappTexto.trim().length > 0
        ? album.whatsappTexto
        : '¡Hola familia de {alumno}! Les compartimos el Álbum Digital privado de la {promocion} ({colegio}). Pueden abrir su recuerdo aquí: {link}';

    const hasAlumnoTag = template.includes('{alumno}');
    const baseMsg = template
      .replace(/\{colegio\}/g, album.colegio)
      .replace(/\{promocion\}/g, album.promocion)
      .replace(/\{alumno\}/g, st.nombre)
      .replace(/\{link\}/g, personalUrl);

    const finalMsg = hasAlumnoTag
      ? baseMsg
      : `¡Hola familia de ${st.nombre}! ${baseMsg}${
          baseMsg.includes(personalUrl) ? '' : `\n${personalUrl}`
        }`;

    return buildWhatsAppShareUrl({
      phone: st.parentPhone,
      message: finalMsg
    });
  };

  const maskToken = (token: string) => {
    if (!isValidAccessToken(token)) return 'Sin token (publica para generar)';
    return `?t=${token.slice(0, 6)}…${token.slice(-6)}`;
  };

  return (
    <div className="space-y-4">
      {/* Barra de controles */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar alumno o teléfono..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-[#183a6e]"
            />
          </div>

          <div className="inline-flex flex-wrap bg-slate-100 p-1 rounded-lg self-start">
            {(
              [
                { id: 'todos', label: `Todos (${students.length})` },
                {
                  id: 'publicado',
                  label: `Publicados (${students.filter((s) => s.status === 'publicado').length})`
                },
                {
                  id: 'borrador',
                  label: `Borrador (${students.filter((s) => s.status === 'borrador').length})`
                },
                {
                  id: 'revocado',
                  label: `Revocados (${students.filter((s) => s.tokenRevoked).length})`
                }
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`h-8 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsBatchOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            <ListPlus className="w-4 h-4" />
            Importar lista
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Añadir alumno
          </button>
        </div>
      </div>

      {/* Tabla de alumnos */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-600">
              No hay alumnos que coincidan con tu búsqueda.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3 px-4">Alumno / Egresado</th>
                  <th className="py-3 px-3">Token privado</th>
                  <th className="py-3 px-3">Estado y revocación</th>
                  <th className="py-3 px-3">Envío exclusivo WhatsApp</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredStudents.map((st, idx) => {
                  const hasValidToken = isValidAccessToken(st.accessToken);
                  const personalUrl = hasValidToken
                    ? buildPublicTokenUrl(st.accessToken)
                    : '';
                  const waHref = hasValidToken ? buildStudentWhatsAppHref(st) : '#';
                  const isBusy = busyStudentId === st.id;

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-[210px]">
                          <img
                            src={
                              st.fotoUrl ||
                              '/src/assets/images/alumno_1_1795554404726.jpg'
                            }
                            alt={st.nombre}
                            className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 text-sm truncate max-w-[220px]">
                              {st.nombre}
                            </div>
                            <div className="text-xs text-slate-500 truncate max-w-[240px]">
                              {st.parentPhone
                                ? `Tel. padre: ${st.parentPhone}`
                                : 'Sin teléfono guardado'}
                            </div>
                            {st.paleta ? (
                              <div className="inline-flex items-center gap-1.5 mt-1 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-700">
                                {(() => {
                                  const resolved = resolveAlbumPalette(
                                    st.paleta,
                                    st.paletaConfig,
                                    catalog
                                  );
                                  return (
                                    <>
                                      <span className="inline-flex items-center gap-0.5">
                                        <span
                                          className="w-2 h-2 rounded-full"
                                          style={{
                                            backgroundColor:
                                              resolved.colors.colorPrincipal
                                          }}
                                        />
                                        <span
                                          className="w-2 h-2 rounded-full"
                                          style={{
                                            backgroundColor:
                                              resolved.colors.colorAcento
                                          }}
                                        />
                                      </span>
                                      <span className="truncate max-w-[160px]">
                                        Paleta:{' '}
                                        {resolved.palette?.nombre || st.paleta}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Paleta: hereda de {album.colegio}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-mono px-2 py-1 rounded-md max-w-[165px] truncate ${
                              st.tokenRevoked
                                ? 'bg-red-50 text-red-700 line-through'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {maskToken(st.accessToken)}
                          </span>
                          {hasValidToken && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  onCopyUrl(
                                    personalUrl,
                                    `Enlace privado de ${st.nombre} copiado`
                                  )
                                }
                                title="Copiar enlace privado"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={personalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir enlace privado"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onUpsertStudent(st.id, {
                                nombre: st.nombre,
                                slug: st.slug,
                                frase: st.frase,
                                fotoUrl: st.fotoUrl,
                                parentPhone: st.parentPhone,
                                paleta: st.paleta ?? null,
                                paletaConfig: st.paletaConfig,
                                accessToken: st.accessToken,
                                tokenRevoked: st.tokenRevoked,
                                status:
                                  st.status === 'publicado'
                                    ? 'borrador'
                                    : 'publicado',
                                order: st.order
                              })
                            }
                            className={`inline-flex items-center h-7 px-2.5 rounded-md text-xs font-semibold border cursor-pointer ${
                              st.status === 'publicado'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {st.status === 'publicado'
                              ? 'Publicado'
                              : 'Borrador'}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyStudentId(st.id);
                              try {
                                await onToggleRevoke(st, !st.tokenRevoked);
                              } finally {
                                setBusyStudentId(null);
                              }
                            }}
                            title={
                              st.tokenRevoked
                                ? 'Reactivar enlace'
                                : 'Revocar acceso inmediatamente'
                            }
                            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold border cursor-pointer ${
                              st.tokenRevoked
                                ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-red-50 hover:text-red-700'
                            }`}
                          >
                            {st.tokenRevoked ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                Reactivar
                              </>
                            ) : (
                              <>
                                <Ban className="w-3 h-3" />
                                Revocar
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyStudentId(st.id);
                              try {
                                await onRegenerateToken(st);
                              } finally {
                                setBusyStudentId(null);
                              }
                            }}
                            title="Invalidar enlace anterior y generar nuevo token"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {hasValidToken && !st.tokenRevoked ? (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#16794c] hover:bg-[#11613d] text-white text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Enviar WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {st.tokenRevoked
                              ? 'Enlace revocado'
                              : 'Publica para activar'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {searchTerm === '' && statusFilter === 'todos' && (
                            <>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveOrder(idx, -1)}
                                title="Subir orden"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-600 cursor-pointer"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === filteredStudents.length - 1}
                                onClick={() => handleMoveOrder(idx, 1)}
                                title="Bajar orden"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-35 text-slate-600 cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(st)}
                            title="Editar alumno"
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteStudent(st)}
                            title="Eliminar alumno"
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:text-red-700 text-slate-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Alumno */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveStudent}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-xl"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingStudent ? 'Editar alumno' : 'Nuevo alumno en anuario'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={BLUEPRINT_LIMITS.STUDENT_NAME_MAX}
                    value={nombre}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNombre(val);
                      if (!editingStudent) {
                        setSlug(slugify(val, BLUEPRINT_LIMITS.STUDENT_SLUG_MIN));
                      }
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referencia interna
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={BLUEPRINT_LIMITS.SLUG_MAX}
                    value={slug}
                    onChange={(e) =>
                      setSlug(
                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                      )
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Frase o dedicatoria del alumno
                </label>
                <textarea
                  rows={2}
                  maxLength={BLUEPRINT_LIMITS.STUDENT_FRASE_MAX}
                  value={frase}
                  onChange={(e) => setFrase(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  URL fotografía de retrato
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.URL_MAX}
                  value={fotoUrl}
                  onChange={(e) => setFotoUrl(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp del padre/madre (privado)
                  </label>
                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.PARENT_PHONE_MAX}
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="Ej: 51987654321"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Nunca sale de tu panel administrativo.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Estado
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PublishStatus)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white text-slate-900"
                  >
                    <option value="publicado">Publicado</option>
                    <option value="borrador">Borrador (oculto)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Paleta visual individual (opcional)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={studentPaleta}
                    onChange={(e) => setStudentPaleta(e.target.value)}
                    className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white text-slate-900"
                  >
                    <option value="">
                      Heredar del colegio/evento (
                      {albumResolvedPalette.palette?.nombre ||
                        albumResolvedPalette.codigo}
                      )
                    </option>
                    {catalog
                      .filter((p) => p.activa || p.codigo === studentPaleta)
                      .map((p) => (
                        <option key={p.codigo} value={p.codigo}>
                          {p.nombre} ({p.codigo})
                        </option>
                      ))}
                  </select>
                  {(() => {
                    const previewRes = studentPaleta
                      ? resolveAlbumPalette(
                          studentPaleta,
                          editingStudent?.paleta === studentPaleta
                            ? editingStudent.paletaConfig
                            : undefined,
                          catalog
                        )
                      : albumResolvedPalette;
                    return (
                      <div
                        className="inline-flex h-9 w-16 rounded-lg overflow-hidden border border-slate-200 shrink-0"
                        title={previewRes.palette?.nombre || previewRes.codigo}
                      >
                        <span
                          className="flex-1"
                          style={{
                            backgroundColor: previewRes.colors.colorPrincipal
                          }}
                        />
                        <span
                          className="flex-1"
                          style={{
                            backgroundColor: previewRes.colors.colorSecundario
                          }}
                        />
                        <span
                          className="flex-1"
                          style={{
                            backgroundColor: previewRes.colors.colorAcento
                          }}
                        />
                        <span
                          className="flex-1"
                          style={{
                            backgroundColor: previewRes.colors.colorTexto
                          }}
                        />
                      </div>
                    );
                  })()}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Si eliges una paleta distinta, aplicará solo al enlace familiar privado de este alumno(a).
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-xs font-semibold cursor-pointer"
              >
                {saving ? 'Guardando...' : 'Guardar alumno'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Importar Lista Rápida */}
      {isBatchOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleBatchSubmit}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-xl"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                Importar lista de alumnos
              </h3>
              <button
                type="button"
                onClick={() => setIsBatchOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Cada alumno recibirá automáticamente su token aleatorio único. Formato:{' '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                  Nombre | Frase opcional | Teléfono WhatsApp opcional
                </code>
                .
              </p>
              <textarea
                rows={7}
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={
                  'Sofía Ramírez | Siempre recordaré este gran año | 51999111222\nDiego Huamán | Gracias por su amistad | 51988222333'
                }
                className="w-full p-3 rounded-lg border border-slate-200 text-xs font-mono text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsBatchOpen(false)}
                className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={batchBusy}
                className="h-9 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-xs font-semibold cursor-pointer"
              >
                {batchBusy ? 'Importando...' : 'Importar alumnos'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
