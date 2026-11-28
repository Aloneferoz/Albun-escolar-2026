import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  Edit3,
  Eye,
  Palette,
  Plus,
  Power,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  ColorPalette,
  DEFAULT_PALETTE_CODE,
  DEFAULT_PALETTE_COLORS,
  DEFAULT_PALETTES,
  DraftAlbum,
  DraftStudent,
  hasStudentCustomPalette,
  isValidHexColor,
  normalizeHexColor,
  PaletteColors,
  resolveAlbumPalette,
  resolveStudentEffectivePalette,
  slugify
} from '../../types/album';
import { derivePaletteCssVars } from '../../theme/palettes';

export type PaletteAssignmentTarget =
  | { scope: 'album' }
  | { scope: 'students'; studentIds: string[] };

interface AdminPaletteManagerProps {
  activeAlbum: DraftAlbum;
  allAlbums: DraftAlbum[];
  students: DraftStudent[];
  palettes: ColorPalette[];
  selectedCodigo: string;
  selectedColors?: PaletteColors;
  onAssignPalette: (
    palette: ColorPalette,
    target: PaletteAssignmentTarget
  ) => Promise<void> | void;
  onClearStudentPalette: (studentId: string) => Promise<void> | void;
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
}

interface ColorFieldConfig {
  key: keyof PaletteColors;
  label: string;
  hint: string;
}

const COLOR_FIELDS: ColorFieldConfig[] = [
  {
    key: 'colorPrincipal',
    label: 'Color principal',
    hint: 'Botones principales, enlaces activos y barra del navegador'
  },
  {
    key: 'colorSecundario',
    label: 'Color secundario',
    hint: 'Fondos suaves, tarjetas de estadísticas y lienzo'
  },
  {
    key: 'colorAcento',
    label: 'Color de acento',
    hint: 'Detalles decorativos, insignias y resaltados editoriales'
  },
  {
    key: 'colorTexto',
    label: 'Color de texto',
    hint: 'Títulos, párrafos y contrastes de lectura'
  }
];

function buildUniqueCopyCode(
  baseCode: string,
  existingCodes: Set<string>
): string {
  const cleanBase = slugify(baseCode, 3).slice(0, 48);
  let candidate = `${cleanBase}-copia`;
  let counter = 2;
  while (existingCodes.has(candidate)) {
    candidate = `${cleanBase}-copia-${counter}`;
    counter += 1;
  }
  return candidate.slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX);
}

const LiveAlbumPalettePreview: React.FC<{
  colors: PaletteColors;
  paletteName: string;
  colegio: string;
  promocion: string;
  nivel: string;
  anio: string;
  targetLabel?: string;
}> = ({ colors, paletteName, colegio, promocion, nivel, anio, targetLabel }) => {
  const safeColors: PaletteColors = {
    colorPrincipal: isValidHexColor(colors.colorPrincipal)
      ? normalizeHexColor(colors.colorPrincipal)
      : DEFAULT_PALETTE_COLORS.colorPrincipal,
    colorSecundario: isValidHexColor(colors.colorSecundario)
      ? normalizeHexColor(colors.colorSecundario)
      : DEFAULT_PALETTE_COLORS.colorSecundario,
    colorAcento: isValidHexColor(colors.colorAcento)
      ? normalizeHexColor(colors.colorAcento)
      : DEFAULT_PALETTE_COLORS.colorAcento,
    colorTexto: isValidHexColor(colors.colorTexto)
      ? normalizeHexColor(colors.colorTexto)
      : DEFAULT_PALETTE_COLORS.colorTexto
  };

  const cssVars = useMemo(
    () => derivePaletteCssVars(safeColors) as React.CSSProperties,
    [
      safeColors.colorPrincipal,
      safeColors.colorSecundario,
      safeColors.colorAcento,
      safeColors.colorTexto
    ]
  );

  return (
    <div
      style={cssVars}
      className="rounded-xl border border-[color:var(--border-hairline)] overflow-hidden bg-[color:var(--bg-canvas)] text-[color:var(--text-primary)] shadow-sm transition-colors"
    >
      {/* Barra superior simulada */}
      <div className="px-3.5 py-2.5 bg-[color:var(--bg-surface)] border-b border-[color:var(--border-hairline)] flex items-center justify-between gap-2">
        <span className="text-xs font-bold truncate text-[color:var(--text-primary)]">
          {colegio || 'Colegio Ejemplo'}
        </span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[color:var(--accent-tint)] text-[color:var(--accent)] shrink-0">
          {paletteName || 'Vista previa'}
        </span>
      </div>

      {/* Hero simulado */}
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--accent-secondary)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent-secondary)]" />
            Nivel {nivel} · Promoción {anio}
          </div>
          <h4 className="text-sm font-bold leading-snug text-[color:var(--text-primary)]">
            {targetLabel || promocion || 'Promoción Escolar'}
          </h4>
          <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
            Así verán las familias las portadas, pestañas, botones y tarjetas del anuario.
          </p>
        </div>

        {/* Botones y pestañas simuladas */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[color:var(--accent)] text-[color:var(--accent-contrast)]">
            Entrar al álbum
          </span>
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[color:var(--bg-subtle)] text-[color:var(--text-primary)] border border-[color:var(--border-hairline)]">
            Anuario y Videos
          </span>
        </div>

        {/* Tarjeta muestra */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="p-2.5 rounded-lg bg-[color:var(--bg-surface)] border border-[color:var(--border-hairline)] space-y-1">
            <div className="text-[10px] font-semibold text-[color:var(--accent-secondary)]">
              Recuerdos
            </div>
            <div className="text-xs font-bold text-[color:var(--text-primary)]">
              Galería escolar
            </div>
            <div className="text-[10px] text-[color:var(--text-muted)]">
              Ceremonia · {anio}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-[color:var(--bg-subtle)] border border-[color:var(--border-hairline)] space-y-1">
            <div className="text-[10px] font-semibold text-[color:var(--accent)]">
              Egresado
            </div>
            <div className="text-xs font-bold text-[color:var(--text-primary)]">
              {targetLabel ? targetLabel.split(' ')[0] : 'Dedicatoria'}
            </div>
            <div className="text-[10px] text-[color:var(--text-secondary)]">
              “Recuerdo de promoción”
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminPaletteManager: React.FC<AdminPaletteManagerProps> = ({
  activeAlbum,
  allAlbums,
  students,
  palettes,
  selectedCodigo,
  selectedColors,
  onAssignPalette,
  onClearStudentPalette,
  onSavePalette,
  onDeletePalette
}) => {
  const catalog = palettes.length > 0 ? palettes : DEFAULT_PALETTES;
  const allAlbumIds = useMemo(() => allAlbums.map((a) => a.id), [allAlbums]);

  const existingCodes = useMemo(
    () => new Set(catalog.map((p) => p.codigo)),
    [catalog]
  );

  const paletteNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    catalog.forEach((p) => map.set(p.codigo, p.nombre));
    return map;
  }, [catalog]);

  const assignmentsByCode = useMemo(() => {
    const map = new Map<string, DraftAlbum[]>();
    allAlbums.forEach((album) => {
      const code = album.paleta || DEFAULT_PALETTE_CODE;
      const list = map.get(code) || [];
      list.push(album);
      map.set(code, list);
    });
    return map;
  }, [allAlbums]);

  const studentAssignmentsByCode = useMemo(() => {
    const map = new Map<string, DraftStudent[]>();
    students.forEach((st) => {
      if (!hasStudentCustomPalette(st)) return;
      const effective = resolveStudentEffectivePalette(
        { paleta: selectedCodigo, paletaConfig: selectedColors },
        st,
        catalog
      );
      if (!effective.isStudentCustom) return;
      const list = map.get(effective.codigo) || [];
      list.push(st);
      map.set(effective.codigo, list);
    });
    return map;
  }, [students, selectedCodigo, selectedColors, catalog]);

  // Destinatario de aplicación en el colegio/evento actual: todo el álbum o alumna(s)/alumno(s) específicos
  const [targetScope, setTargetScope] = useState<'album' | 'students'>('album');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [applyOnSaveTarget, setApplyOnSaveTarget] = useState<
    'none' | 'album' | 'students'
  >('none');

  const selectedStudentsList = useMemo(
    () => students.filter((s) => selectedStudentIds.includes(s.id)),
    [students, selectedStudentIds]
  );

  const filteredStudents = useMemo(() => {
    const term = studentSearch.trim().toLowerCase();
    if (!term) return students;
    return students.filter((s) => s.nombre.toLowerCase().includes(term));
  }, [students, studentSearch]);

  // Paleta mostrada en la vista previa según si se inspecciona todo el álbum o un alumno seleccionado
  const previewSubject = useMemo(() => {
    const generalAlbumLike = {
      paleta: selectedCodigo,
      paletaConfig: selectedColors
    };
    if (targetScope === 'students' && selectedStudentsList.length > 0) {
      const first = selectedStudentsList[0];
      const resolved = resolveStudentEffectivePalette(
        generalAlbumLike,
        first,
        catalog
      );
      const label =
        selectedStudentsList.length === 1
          ? `Alumna/o: ${first.nombre}`
          : `${selectedStudentsList.length} alumnas/os seleccionados (${first.nombre}…)`;
      return {
        resolved,
        isStudentCustom: resolved.isStudentCustom,
        label,
        previewTitle:
          selectedStudentsList.length === 1
            ? first.nombre
            : `${selectedStudentsList.length} estudiantes`
      };
    }
    const resolved = resolveAlbumPalette(selectedCodigo, selectedColors, catalog);
    return {
      resolved,
      isStudentCustom: false,
      label: `Todo el colegio/evento: ${activeAlbum.colegio}`,
      previewTitle: activeAlbum.promocion
    };
  }, [
    targetScope,
    selectedStudentsList,
    selectedCodigo,
    selectedColors,
    catalog,
    activeAlbum.colegio,
    activeAlbum.promocion
  ]);

  // Estado del editor de paleta (crear / editar / duplicar)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formCodigo, setFormCodigo] = useState('');
  const [codigoTouched, setCodigoTouched] = useState(false);
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formActiva, setFormActiva] = useState(true);
  const [formPredeterminada, setFormPredeterminada] = useState(false);
  const [formColors, setFormColors] = useState<PaletteColors>(
    DEFAULT_PALETTE_COLORS
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [savingPalette, setSavingPalette] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [confirmDeletePalette, setConfirmDeletePalette] =
    useState<ColorPalette | null>(null);
  const [showLivePreview, setShowLivePreview] = useState(true);

  const toggleStudentSelection = (studentId: string) => {
    setAssignError(null);
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const openCreateEditor = () => {
    setEditorMode('create');
    setFormNombre('');
    setFormCodigo('');
    setCodigoTouched(false);
    setFormDescripcion('');
    setFormActiva(true);
    setFormPredeterminada(false);
    setFormColors({ ...previewSubject.resolved.colors });
    setApplyOnSaveTarget(
      targetScope === 'students' && selectedStudentIds.length > 0
        ? 'students'
        : 'none'
    );
    setFormError(null);
  };

  const openEditEditor = (palette: ColorPalette) => {
    setEditorMode('edit');
    setFormNombre(palette.nombre);
    setFormCodigo(palette.codigo);
    setCodigoTouched(true);
    setFormDescripcion(palette.descripcion || '');
    setFormActiva(palette.activa);
    setFormPredeterminada(Boolean(palette.esPredeterminada));
    setFormColors({
      colorPrincipal: palette.colorPrincipal,
      colorSecundario: palette.colorSecundario,
      colorAcento: palette.colorAcento,
      colorTexto: palette.colorTexto
    });
    setApplyOnSaveTarget('none');
    setFormError(null);
  };

  const openDuplicateEditor = (palette: ColorPalette) => {
    const newCode = buildUniqueCopyCode(palette.codigo, existingCodes);
    setEditorMode('create');
    setFormNombre(
      `Copia de ${palette.nombre}`.slice(0, BLUEPRINT_LIMITS.PALETTE_NAME_MAX)
    );
    setFormCodigo(newCode);
    setCodigoTouched(true);
    setFormDescripcion(palette.descripcion || '');
    setFormActiva(true);
    setFormPredeterminada(false);
    setFormColors({
      colorPrincipal: palette.colorPrincipal,
      colorSecundario: palette.colorSecundario,
      colorAcento: palette.colorAcento,
      colorTexto: palette.colorTexto
    });
    setApplyOnSaveTarget(
      targetScope === 'students' && selectedStudentIds.length > 0
        ? 'students'
        : 'none'
    );
    setFormError(null);
  };

  const handleNombreChange = (val: string) => {
    setFormNombre(val);
    if (editorMode === 'create' && !codigoTouched) {
      setFormCodigo(
        slugify(val, BLUEPRINT_LIMITS.PALETTE_CODE_MIN).slice(
          0,
          BLUEPRINT_LIMITS.PALETTE_CODE_MAX
        )
      );
    }
  };

  const handleHexInputChange = (key: keyof PaletteColors, raw: string) => {
    let val = raw.trim();
    if (val && !val.startsWith('#')) {
      val = `#${val}`;
    }
    setFormColors((prev) => ({
      ...prev,
      [key]: val.slice(0, 7)
    }));
  };

  const invalidColorKeys = COLOR_FIELDS.filter(
    (f) => !isValidHexColor(formColors[f.key])
  ).map((f) => f.label);

  const handleAssignClick = async (palette: ColorPalette) => {
    setAssignError(null);
    if (targetScope === 'students') {
      if (selectedStudentIds.length === 0) {
        setAssignError(
          'Selecciona al menos una alumna o alumno en la lista superior antes de aplicar esta paleta.'
        );
        return;
      }
      setBusyCode(palette.codigo);
      try {
        await onAssignPalette(palette, {
          scope: 'students',
          studentIds: selectedStudentIds
        });
      } finally {
        setBusyCode(null);
      }
      return;
    }

    setBusyCode(palette.codigo);
    try {
      await onAssignPalette(palette, { scope: 'album' });
    } finally {
      setBusyCode(null);
    }
  };

  const handleSavePaletteForm = async () => {
    setFormError(null);
    const cleanName = formNombre.trim();
    const cleanCode = slugify(
      formCodigo || cleanName,
      BLUEPRINT_LIMITS.PALETTE_CODE_MIN
    ).slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX);

    if (cleanName.length < BLUEPRINT_LIMITS.PALETTE_NAME_MIN) {
      setFormError('El nombre de la paleta debe tener al menos 2 caracteres.');
      return;
    }

    if (
      cleanCode.length < BLUEPRINT_LIMITS.PALETTE_CODE_MIN ||
      !BLUEPRINT_LIMITS.SLUG_REGEX.test(cleanCode)
    ) {
      setFormError(
        'El código identificador debe tener al menos 3 caracteres (solo minúsculas, números y guiones).'
      );
      return;
    }

    if (editorMode === 'create' && existingCodes.has(cleanCode)) {
      setFormError(
        `El identificador "${cleanCode}" ya existe. Usa un código diferente para evitar duplicados.`
      );
      return;
    }

    if (invalidColorKeys.length > 0) {
      setFormError(
        `Corrige el formato HEX (#RRGGBB) en: ${invalidColorKeys.join(', ')}.`
      );
      return;
    }

    if (
      applyOnSaveTarget === 'students' &&
      selectedStudentIds.length === 0
    ) {
      setFormError(
        'Has elegido aplicar a alumnas/os específicos, pero no hay ningún estudiante seleccionado.'
      );
      return;
    }

    setSavingPalette(true);
    try {
      const assignedIds = (assignmentsByCode.get(cleanCode) || []).map(
        (a) => a.id
      );
      const saved = await onSavePalette(
        {
          codigo: cleanCode,
          nombre: cleanName,
          descripcion: formDescripcion.trim(),
          colorPrincipal: normalizeHexColor(formColors.colorPrincipal),
          colorSecundario: normalizeHexColor(formColors.colorSecundario),
          colorAcento: normalizeHexColor(formColors.colorAcento),
          colorTexto: normalizeHexColor(formColors.colorTexto),
          activa: cleanCode === DEFAULT_PALETTE_CODE ? true : formActiva,
          esPredeterminada: formPredeterminada
        },
        {
          mode: editorMode === 'edit' ? 'edit' : 'create',
          assignedAlbumIds: assignedIds,
          allAlbumIds
        }
      );

      if (applyOnSaveTarget === 'album') {
        await onAssignPalette(saved, { scope: 'album' });
      } else if (
        applyOnSaveTarget === 'students' &&
        selectedStudentIds.length > 0
      ) {
        await onAssignPalette(saved, {
          scope: 'students',
          studentIds: selectedStudentIds
        });
      }

      setEditorMode(null);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la paleta en Firestore.'
      );
    } finally {
      setSavingPalette(false);
    }
  };

  const handleToggleActive = async (palette: ColorPalette) => {
    if (palette.codigo === DEFAULT_PALETTE_CODE) return;
    setBusyCode(palette.codigo);
    try {
      const assignedIds = (assignmentsByCode.get(palette.codigo) || []).map(
        (a) => a.id
      );
      await onSavePalette(
        {
          ...palette,
          activa: !palette.activa
        },
        {
          mode: 'edit',
          assignedAlbumIds: assignedIds,
          allAlbumIds
        }
      );
    } finally {
      setBusyCode(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeletePalette) return;
    const target = confirmDeletePalette;
    setBusyCode(target.codigo);
    try {
      const assignedIds = (assignmentsByCode.get(target.codigo) || []).map(
        (a) => a.id
      );
      await onDeletePalette(target.codigo, assignedIds, allAlbumIds);
      if (selectedCodigo === target.codigo) {
        const fallback =
          catalog.find((p) => p.codigo === DEFAULT_PALETTE_CODE) ||
          DEFAULT_PALETTES[0];
        await onAssignPalette(fallback, { scope: 'album' });
      }
      setConfirmDeletePalette(null);
    } finally {
      setBusyCode(null);
    }
  };

  const renderStudentChecklist = (compact = false) => (
    <div className="space-y-2.5 pt-2 border-t border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            placeholder={`Buscar alumna o alumno en ${activeAlbum.colegio}...`}
            className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-[#183a6e]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={students.length === 0}
            onClick={() => setSelectedStudentIds(students.map((s) => s.id))}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 disabled:opacity-45 cursor-pointer"
          >
            Todos ({students.length})
          </button>
          <button
            type="button"
            disabled={selectedStudentIds.length === 0}
            onClick={() => setSelectedStudentIds([])}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-600 disabled:opacity-45 cursor-pointer"
          >
            Limpiar
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="p-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500 text-center">
          Este colegio/evento aún no tiene alumnos registrados. Añádelos en la pestaña{' '}
          <strong>Anuario</strong> o en <strong>Alumnos y Tokens</strong>.
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
          } gap-2 max-h-48 overflow-y-auto pr-1`}
        >
          {filteredStudents.map((st) => {
            const isChecked = selectedStudentIds.includes(st.id);
            const hasCustom = hasStudentCustomPalette(st);
            const effective = resolveStudentEffectivePalette(
              { paleta: selectedCodigo, paletaConfig: selectedColors },
              st,
              catalog
            );
            const customPaletteName = hasCustom
              ? paletteNameByCode.get(effective.codigo) ||
                effective.palette?.nombre ||
                effective.codigo
              : null;
            return (
              <div
                key={st.id}
                className={`flex items-center justify-between gap-2 p-2 rounded-lg border transition-colors ${
                  isChecked
                    ? 'border-[#183a6e] bg-[#183a6e]/5'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleStudentSelection(st.id)}
                    className="rounded border-slate-300 text-[#183a6e] shrink-0"
                  />
                  <img
                    src={
                      st.fotoUrl ||
                      '/src/assets/images/alumno_1_1795554404726.jpg'
                    }
                    alt={st.nombre}
                    className="w-7 h-7 rounded-md object-cover bg-slate-100 border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {st.nombre}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 truncate">
                      {hasCustom && effective.isStudentCustom ? (
                        <>
                          <span
                            className="w-2 h-2 rounded-full shrink-0 border border-black/15"
                            style={{
                              backgroundColor: effective.colors.colorPrincipal
                            }}
                          />
                          <span className="truncate font-medium text-[#183a6e]">
                            {customPaletteName}
                          </span>
                        </>
                      ) : (
                        <span className="truncate">Hereda del colegio/evento</span>
                      )}
                    </div>
                  </div>
                </label>

                {hasCustom && (
                  <button
                    type="button"
                    title="Volver a heredar paleta del colegio/evento"
                    onClick={() => onClearStudentPalette(st.id)}
                    className="h-6 w-6 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      {/* Cabecera de Paleta visual del álbum público */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Palette className="w-4 h-4 text-[#183a6e]" />
            <span>Paleta visual del álbum público</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Aplica una paleta a todo <strong>{activeAlbum.colegio}</strong> o de forma individual a{' '}
            <strong>alumnas o alumnos específicos</strong> del colegio/evento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLivePreview((prev) => !prev)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            {showLivePreview ? 'Ocultar vista previa' : 'Ver vista previa'}
          </button>
          <button
            type="button"
            onClick={openCreateEditor}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-[11px] font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva paleta
          </button>
        </div>
      </div>

      {/* Selector explícito de destinatario: Todo el colegio/evento vs Alumna(s) o Alumno(s) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-800">
            ¿A quién se aplicará la paleta seleccionada en{' '}
            <span className="text-[#183a6e]">{activeAlbum.colegio}</span>?
          </div>
          <div className="inline-flex flex-wrap bg-slate-100 p-1 rounded-lg gap-1">
            <button
              type="button"
              onClick={() => {
                setTargetScope('album');
                setAssignError(null);
              }}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                targetScope === 'album'
                  ? 'bg-white text-[#183a6e] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Todo el colegio / evento
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetScope('students');
                setAssignError(null);
              }}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                targetScope === 'students'
                  ? 'bg-white text-[#183a6e] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Alumna o alumno específico ({selectedStudentIds.length})
            </button>
          </div>
        </div>

        {targetScope === 'album' ? (
          <p className="text-[11px] text-slate-500">
            Cualquier paleta que apliques ahora será la combinación general de{' '}
            <strong>{activeAlbum.colegio} ({activeAlbum.promocion})</strong>. Los estudiantes sin paleta propia heredarán estos colores.
          </p>
        ) : (
          renderStudentChecklist(false)
        )}

        {assignError && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{assignError}</span>
          </div>
        )}
      </div>

      {/* Vista previa del álbum o alumna/o seleccionado */}
      {showLivePreview && !editorMode && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-center bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {previewSubject.label}:
              </span>
              <span className="text-xs font-bold text-slate-900">
                {previewSubject.resolved.palette?.nombre ||
                  previewSubject.resolved.codigo}
              </span>
              {previewSubject.isStudentCustom ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#183a6e]/10 text-[#183a6e]">
                  Paleta individual
                </span>
              ) : previewSubject.resolved.codigo === DEFAULT_PALETTE_CODE ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  Predeterminada
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COLOR_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 bg-slate-50"
                >
                  <span
                    className="w-5 h-5 rounded-md border border-black/10 shrink-0"
                    style={{
                      backgroundColor: previewSubject.resolved.colors[field.key]
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 truncate">
                      {field.label.replace('Color ', '')}
                    </div>
                    <div className="text-[11px] font-mono font-semibold text-slate-800">
                      {previewSubject.resolved.colors[field.key]}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Cambiar la paleta modifica únicamente los colores del destinatario elegido; nunca altera fotografías, videos ni datos de los alumnos.
            </p>
          </div>

          <LiveAlbumPalettePreview
            colors={previewSubject.resolved.colors}
            paletteName={
              previewSubject.resolved.palette?.nombre ||
              previewSubject.resolved.codigo
            }
            colegio={activeAlbum.colegio}
            promocion={activeAlbum.promocion}
            nivel={activeAlbum.nivel}
            anio={activeAlbum.anio}
            targetLabel={previewSubject.previewTitle}
          />
        </div>
      )}

      {/* Editor / Creador inline de paleta con vista previa instantánea y selección de alumna/o */}
      {editorMode && (
        <div className="bg-white border-2 border-[#183a6e]/30 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#183a6e]" />
              <h4 className="text-xs font-bold text-slate-900">
                {editorMode === 'create'
                  ? 'Crear nueva paleta de 4 colores'
                  : `Editar paleta: ${formNombre || formCodigo}`}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setEditorMode(null)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              aria-label="Cerrar editor de paleta"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {formError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
            {/* Controles del formulario */}
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nombre de la combinación *
                  </label>
                  <input
                    type="text"
                    maxLength={BLUEPRINT_LIMITS.PALETTE_NAME_MAX}
                    value={formNombre}
                    onChange={(e) => handleNombreChange(e.target.value)}
                    placeholder="Ej: Promoción Gala Nocturna"
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#183a6e]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Código identificador único *
                  </label>
                  <input
                    type="text"
                    disabled={editorMode === 'edit'}
                    maxLength={BLUEPRINT_LIMITS.PALETTE_CODE_MAX}
                    value={formCodigo}
                    onChange={(e) => {
                      setCodigoTouched(true);
                      setFormCodigo(
                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                      );
                    }}
                    placeholder="ej: gala-nocturna"
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:border-[#183a6e]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Descripción opcional
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.PALETTE_DESC_MAX}
                  value={formDescripcion}
                  onChange={(e) => setFormDescripcion(e.target.value)}
                  placeholder="Ej: Tonos institucionales para nivel secundaria"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#183a6e]"
                />
              </div>

              {/* 4 Selectores visuales + entrada HEX manual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {COLOR_FIELDS.map((field) => {
                  const val = formColors[field.key];
                  const valid = isValidHexColor(val);
                  return (
                    <div
                      key={field.key}
                      className={`p-2.5 rounded-lg border ${
                        valid
                          ? 'border-slate-200 bg-slate-50/70'
                          : 'border-red-300 bg-red-50/50'
                      }`}
                    >
                      <div className="text-[11px] font-semibold text-slate-800">
                        {field.label}
                      </div>
                      <div className="text-[10px] text-slate-500 mb-2 leading-tight">
                        {field.hint}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={`Selector visual ${field.label}`}
                          value={
                            valid
                              ? normalizeHexColor(val)
                              : DEFAULT_PALETTE_COLORS[field.key]
                          }
                          onChange={(e) =>
                            setFormColors((prev) => ({
                              ...prev,
                              [field.key]: e.target.value.toLowerCase()
                            }))
                          }
                          className="w-9 h-9 rounded-md border border-slate-300 bg-white p-0.5 cursor-pointer shrink-0"
                        />
                        <input
                          type="text"
                          aria-label={`Código HEX ${field.label}`}
                          maxLength={7}
                          value={val}
                          onChange={(e) =>
                            handleHexInputChange(field.key, e.target.value)
                          }
                          placeholder="#183a6e"
                          className="w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-mono text-slate-900 focus:outline-none focus:border-[#183a6e]"
                        />
                      </div>
                      {!valid && (
                        <p className="text-[10px] text-red-600 mt-1">
                          Usa HEX de 6 dígitos (ej. #183a6e)
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Indicar a qué alumna, alumno o colegio se aplicará al guardar */}
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2">
                <label className="block text-[11px] font-semibold text-slate-800">
                  ¿A quién aplicar esta paleta al guardar? ({activeAlbum.colegio})
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      {
                        id: 'none',
                        label:
                          editorMode === 'edit'
                            ? 'Mantener asignaciones actuales'
                            : 'Solo guardar en catálogo'
                      },
                      {
                        id: 'album',
                        label: `Todo el colegio/evento (${activeAlbum.colegio})`
                      },
                      {
                        id: 'students',
                        label: `Alumna(s) o alumno(s) específicos (${selectedStudentIds.length})`
                      }
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setApplyOnSaveTarget(opt.id)}
                      className={`h-7 px-2.5 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                        applyOnSaveTarget === opt.id
                          ? 'bg-[#183a6e] text-white border-[#183a6e]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {applyOnSaveTarget === 'students' && renderStudentChecklist(true)}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={formCodigo === DEFAULT_PALETTE_CODE}
                    checked={formCodigo === DEFAULT_PALETTE_CODE ? true : formActiva}
                    onChange={(e) => setFormActiva(e.target.checked)}
                    className="rounded border-slate-300 text-[#183a6e]"
                  />
                  <span>
                    Paleta activa para asignar a álbumes y alumnos
                    {formCodigo === DEFAULT_PALETTE_CODE && ' (obligatorio)'}
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorMode(null)}
                    className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={savingPalette}
                    onClick={handleSavePaletteForm}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingPalette ? 'Guardando...' : 'Guardar paleta'}
                  </button>
                </div>
              </div>
            </div>

            {/* Vista previa en tiempo real */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Vista previa en tiempo real
              </div>
              <LiveAlbumPalettePreview
                colors={formColors}
                paletteName={formNombre || 'Nueva paleta'}
                colegio={activeAlbum.colegio}
                promocion={activeAlbum.promocion}
                nivel={activeAlbum.nivel}
                anio={activeAlbum.anio}
                targetLabel={
                  applyOnSaveTarget === 'students' &&
                  selectedStudentsList.length > 0
                    ? selectedStudentsList.length === 1
                      ? selectedStudentsList[0].nombre
                      : `${selectedStudentsList.length} alumnas/os seleccionados`
                    : activeAlbum.promocion
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Confirmación explícita antes de eliminar una paleta (incluyendo álbumes y alumnos asignados) */}
      {confirmDeletePalette && (
        <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 space-y-1">
              <div className="font-bold">
                ¿Eliminar la paleta «{confirmDeletePalette.nombre}»?
              </div>
              {(assignmentsByCode.get(confirmDeletePalette.codigo) || [])
                .length > 0 ||
              (studentAssignmentsByCode.get(confirmDeletePalette.codigo) || [])
                .length > 0 ? (
                <p>
                  Está asignada actualmente{' '}
                  {(assignmentsByCode.get(confirmDeletePalette.codigo) || [])
                    .length > 0 && (
                    <>
                      al álbum de{' '}
                      <strong>
                        {(
                          assignmentsByCode.get(confirmDeletePalette.codigo) ||
                          []
                        )
                          .map((a) => a.colegio)
                          .join(', ')}
                      </strong>
                    </>
                  )}
                  {(assignmentsByCode.get(confirmDeletePalette.codigo) || [])
                    .length > 0 &&
                    (
                      studentAssignmentsByCode.get(
                        confirmDeletePalette.codigo
                      ) || []
                    ).length > 0 &&
                    ' y '}
                  {(
                    studentAssignmentsByCode.get(confirmDeletePalette.codigo) ||
                    []
                  ).length > 0 && (
                    <>
                      a{' '}
                      <strong>
                        {(
                          studentAssignmentsByCode.get(
                            confirmDeletePalette.codigo
                          ) || []
                        )
                          .map((s) => s.nombre)
                          .join(', ')}
                      </strong>
                    </>
                  )}
                  . Si confirmas, volverán automáticamente a la paleta predeterminada/heredada sin perder fotografías, videos ni alumnos.
                </p>
              ) : (
                <p>
                  Esta paleta no está asignada a ningún álbum ni alumno actualmente.
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeletePalette(null)}
              className="h-8 px-3 rounded-lg border border-red-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busyCode === confirmDeletePalette.codigo}
              onClick={handleConfirmDelete}
              className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
            >
              {busyCode === confirmDeletePalette.codigo
                ? 'Eliminando...'
                : 'Sí, eliminar paleta'}
            </button>
          </div>
        </div>
      )}

      {/* Grid de paletas disponibles */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {catalog.map((palette) => {
          const isAlbumSelected = selectedCodigo === palette.codigo;
          const assignedAlbums = assignmentsByCode.get(palette.codigo) || [];
          const assignedStudents =
            studentAssignmentsByCode.get(palette.codigo) || [];
          const allSelectedStudentsHaveThis =
            targetScope === 'students' &&
            selectedStudentsList.length > 0 &&
            selectedStudentsList.every((s) => {
              if (!hasStudentCustomPalette(s)) return false;
              const eff = resolveStudentEffectivePalette(
                { paleta: selectedCodigo, paletaConfig: selectedColors },
                s,
                catalog
              );
              return eff.isStudentCustom && eff.codigo === palette.codigo;
            });

          const isHighlighted =
            targetScope === 'album'
              ? isAlbumSelected
              : allSelectedStudentsHaveThis;

          const isDefault = palette.codigo === DEFAULT_PALETTE_CODE;
          const canAssign =
            palette.activa || isAlbumSelected || assignedStudents.length > 0;

          return (
            <div
              key={palette.codigo}
              className={`rounded-xl border p-3.5 bg-white transition-all flex flex-col justify-between gap-3 ${
                isHighlighted
                  ? 'border-[#183a6e] ring-2 ring-[#183a6e]/15'
                  : 'border-slate-200 hover:border-slate-300'
              } ${!palette.activa ? 'opacity-75' : ''}`}
            >
              <div className="space-y-2.5">
                {/* Barra de 4 colores */}
                <div className="grid grid-cols-4 h-7 rounded-lg overflow-hidden border border-black/10">
                  <span
                    title={`Principal: ${palette.colorPrincipal}`}
                    style={{ backgroundColor: palette.colorPrincipal }}
                  />
                  <span
                    title={`Secundario: ${palette.colorSecundario}`}
                    style={{ backgroundColor: palette.colorSecundario }}
                  />
                  <span
                    title={`Acento: ${palette.colorAcento}`}
                    style={{ backgroundColor: palette.colorAcento }}
                  />
                  <span
                    title={`Texto: ${palette.colorTexto}`}
                    style={{ backgroundColor: palette.colorTexto }}
                  />
                </div>

                {/* Nombre, código y badges */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {palette.nombre}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate">
                        {palette.codigo}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 shrink-0">
                      {isDefault && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          Predeterminada
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          palette.activa
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {palette.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  </div>

                  {palette.descripcion && (
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {palette.descripcion}
                    </p>
                  )}

                  {/* Indicadores claros de dónde está aplicada la paleta */}
                  {(assignedAlbums.length > 0 || assignedStudents.length > 0) && (
                    <div className="mt-2 space-y-1">
                      {assignedAlbums.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-600">
                          <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">
                            General: {assignedAlbums.map((a) => a.colegio).join(', ')}
                          </span>
                        </div>
                      )}
                      {assignedStudents.length > 0 && (
                        <div className="flex items-start gap-1 text-[10px] font-medium text-[#183a6e]">
                          <Users className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">
                            Alumnas/os ({assignedStudents.length}):{' '}
                            {assignedStudents.map((s) => s.nombre).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Acciones de asignación y CRUD */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={!canAssign || busyCode === palette.codigo}
                  onClick={() => handleAssignClick(palette)}
                  className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    isHighlighted
                      ? 'bg-[#183a6e] text-white'
                      : 'border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 disabled:opacity-45 disabled:cursor-not-allowed'
                  }`}
                >
                  {isHighlighted && <Check className="w-3.5 h-3.5" />}
                  {busyCode === palette.codigo
                    ? 'Aplicando...'
                    : !canAssign
                      ? 'Inactiva'
                      : targetScope === 'album'
                        ? isAlbumSelected
                          ? 'Asignada al evento'
                          : 'Aplicar al evento'
                        : selectedStudentIds.length === 0
                          ? 'Elegir alumna/o'
                          : allSelectedStudentsHaveThis
                            ? `Asignada (${selectedStudentIds.length})`
                            : `Aplicar a ${selectedStudentIds.length} alumno(s)`}
                </button>

                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditEditor(palette)}
                    title="Editar paleta"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openDuplicateEditor(palette)}
                    title="Duplicar paleta"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {!isDefault && (
                    <>
                      <button
                        type="button"
                        disabled={busyCode === palette.codigo}
                        onClick={() => handleToggleActive(palette)}
                        title={
                          palette.activa
                            ? 'Desactivar paleta'
                            : 'Activar paleta'
                        }
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePalette(palette)}
                        title="Eliminar paleta"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:text-red-700 text-slate-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
