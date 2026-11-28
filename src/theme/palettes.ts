export interface PaletteColors {
  colorPrincipal: string;
  colorSecundario: string;
  colorAcento: string;
  colorTexto: string;
}

export interface ColorPalette extends PaletteColors {
  codigo: string;
  nombre: string;
  descripcion?: string;
  activa: boolean;
  esPredeterminada?: boolean;
  ownerUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export const DEFAULT_PALETTE_CODE = 'primaria-azul-oro';

export const DEFAULT_PALETTE_COLORS: PaletteColors = {
  colorPrincipal: '#183a6e',
  colorSecundario: '#edf2f8',
  colorAcento: '#b47b1b',
  colorTexto: '#142136'
};

export const DEFAULT_PALETTES: ColorPalette[] = [
  {
    codigo: 'primaria-azul-oro',
    nombre: 'Primaria Azul & Oro',
    descripcion: 'Azul marino académico con acento dorado y fondo suave.',
    colorPrincipal: '#183a6e',
    colorSecundario: '#edf2f8',
    colorAcento: '#b47b1b',
    colorTexto: '#142136',
    activa: true,
    esPredeterminada: true
  },
  {
    codigo: 'inicial-pastel',
    nombre: 'Inicial Pastel',
    descripcion: 'Terracota cálido, crema editorial y verde salvia.',
    colorPrincipal: '#b8583e',
    colorSecundario: '#f3ece4',
    colorAcento: '#5b7f6b',
    colorTexto: '#2d2522',
    activa: true,
    esPredeterminada: false
  },
  {
    codigo: 'secundaria-elegante',
    nombre: 'Secundaria Elegante',
    descripcion: 'Verde bosque profundo con arena cálida y dorado sobrio.',
    colorPrincipal: '#1d352b',
    colorSecundario: '#eae7de',
    colorAcento: '#987636',
    colorTexto: '#171c19',
    activa: true,
    esPredeterminada: false
  },
  {
    codigo: 'gala-vino-marfil',
    nombre: 'Gala Vino & Marfil',
    descripcion: 'Guinda institucional con detalle oro y papel marfil.',
    colorPrincipal: '#6e1d36',
    colorSecundario: '#f5ebe8',
    colorAcento: '#c4933b',
    colorTexto: '#26181d',
    activa: true,
    esPredeterminada: false
  },
  {
    codigo: 'jardin-cielo-menta',
    nombre: 'Jardín Cielo & Menta',
    descripcion: 'Azul cerúleo luminoso con acento menta y contraste nítido.',
    colorPrincipal: '#1c5d7d',
    colorSecundario: '#e7f2f6',
    colorAcento: '#2d8a68',
    colorTexto: '#162a36',
    activa: true,
    esPredeterminada: false
  }
];

export function isValidHexColor(value: string | undefined | null): boolean {
  return Boolean(value && HEX_COLOR_REGEX.test(value.trim()));
}

export function normalizeHexColor(
  value: string | undefined | null,
  fallback = '#183a6e'
): string {
  const trimmed = String(value || '').trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (HEX_COLOR_REGEX.test(withHash)) {
    return withHash.toLowerCase();
  }
  return fallback.toLowerCase();
}

export function sanitizePaletteColors(
  colors?: Partial<PaletteColors> | null,
  fallback: PaletteColors = DEFAULT_PALETTE_COLORS
): PaletteColors {
  return {
    colorPrincipal: normalizeHexColor(
      colors?.colorPrincipal,
      fallback.colorPrincipal
    ),
    colorSecundario: normalizeHexColor(
      colors?.colorSecundario,
      fallback.colorSecundario
    ),
    colorAcento: normalizeHexColor(colors?.colorAcento, fallback.colorAcento),
    colorTexto: normalizeHexColor(colors?.colorTexto, fallback.colorTexto)
  };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

export function mixHex(hexA: string, hexB: string, weightA: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightA));
  return rgbToHex(
    a.r * w + b.r * (1 - w),
    a.g * w + b.g * (1 - w),
    a.b * w + b.b * (1 - w)
  );
}

export function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

export function getContrastTextColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.42 ? '#142136' : '#ffffff';
}

export function derivePaletteCssVars(
  colors: PaletteColors
): Record<string, string> {
  const safe = sanitizePaletteColors(colors);
  return {
    '--bg-canvas': mixHex(safe.colorSecundario, '#ffffff', 0.45),
    '--bg-surface': '#ffffff',
    '--bg-subtle': safe.colorSecundario,
    '--text-primary': safe.colorTexto,
    '--text-secondary': mixHex(safe.colorTexto, '#ffffff', 0.76),
    '--text-muted': mixHex(safe.colorTexto, '#ffffff', 0.56),
    '--accent': safe.colorPrincipal,
    '--accent-hover': mixHex(safe.colorPrincipal, '#000000', 0.78),
    '--accent-contrast': getContrastTextColor(safe.colorPrincipal),
    '--accent-secondary': safe.colorAcento,
    '--accent-tint': rgbaFromHex(safe.colorPrincipal, 0.09),
    '--border-hairline': rgbaFromHex(safe.colorTexto, 0.11),
    '--shadow-card': `0 6px 24px ${rgbaFromHex(safe.colorPrincipal, 0.08)}`,
    '--shadow-modal': `0 24px 60px ${rgbaFromHex(safe.colorTexto, 0.36)}`,
    '--hero-overlay': `linear-gradient(180deg, ${rgbaFromHex(safe.colorPrincipal, 0.06)} 0%, ${rgbaFromHex(safe.colorPrincipal, 0.48)} 100%)`
  };
}

export function applyPaletteToElement(
  element: HTMLElement | null,
  colors: PaletteColors
): void {
  if (!element) return;
  const vars = derivePaletteCssVars(colors);
  Object.entries(vars).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
}

export interface PaletteStudentLike {
  paleta?: string | null;
  paletaConfig?: Partial<PaletteColors> | null;
  paletaOverride?: string | Partial<PaletteColors> | null;
}

export interface PaletteAlbumLike {
  paleta?: string | null;
  paletaConfig?: Partial<PaletteColors> | null;
}

export interface ResolvedPaletteResult {
  codigo: string;
  colors: PaletteColors;
  palette?: ColorPalette;
}

export interface ResolvedStudentPaletteResult extends ResolvedPaletteResult {
  isStudentCustom: boolean;
}

export function isCompletePaletteColors(
  colors?: Partial<PaletteColors> | null
): colors is PaletteColors {
  return Boolean(
    colors &&
      isValidHexColor(colors.colorPrincipal) &&
      isValidHexColor(colors.colorSecundario) &&
      isValidHexColor(colors.colorAcento) &&
      isValidHexColor(colors.colorTexto)
  );
}

export function normalizePaletteCode(
  raw?: string | null
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized.length >= 3 ? normalized : undefined;
}

function getDefaultPaletteFromCatalog(
  palettes: ColorPalette[] = DEFAULT_PALETTES
): ColorPalette {
  return (
    palettes.find((p) => p.esPredeterminada) ||
    palettes.find((p) => p.codigo === DEFAULT_PALETTE_CODE) ||
    DEFAULT_PALETTES[0]
  );
}

function findPaletteByCode(
  code: string | undefined,
  palettes: ColorPalette[] = DEFAULT_PALETTES
): ColorPalette | undefined {
  if (!code) return undefined;
  return (
    palettes.find((p) => p.codigo === code) ||
    DEFAULT_PALETTES.find((p) => p.codigo === code)
  );
}

export function hasStudentCustomPalette(
  student?: PaletteStudentLike | null
): boolean {
  if (!student) return false;

  if (typeof student.paletaOverride === 'string') {
    if (normalizePaletteCode(student.paletaOverride)) {
      return true;
    }
  } else if (
    student.paletaOverride &&
    typeof student.paletaOverride === 'object' &&
    isCompletePaletteColors(student.paletaOverride)
  ) {
    return true;
  }

  if (normalizePaletteCode(student.paleta)) {
    return true;
  }

  // Si paleta fue limpiada explícitamente como string vacío, no heredar paletaConfig obsoleta
  if (student.paleta === '') {
    return false;
  }

  if (
    (student.paletaOverride === undefined || student.paletaOverride === null) &&
    isCompletePaletteColors(student.paletaConfig)
  ) {
    return true;
  }

  return false;
}

function isPaletteStudentInput(
  value: unknown
): value is PaletteStudentLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      ('paletaOverride' in value ||
        'paleta' in value ||
        'id' in value ||
        'nombre' in value ||
        'albumId' in value)
  );
}

function isPaletteAlbumInput(
  value: unknown
): value is PaletteAlbumLike {
  return Boolean(
    value &&
      typeof value === 'object' &&
      ('paleta' in value || 'colegio' in value || 'paletaConfig' in value)
  );
}

export function resolveAlbumPalette(
  paletaCode?: string | null,
  paletaConfig?: Partial<PaletteColors> | null,
  palettes?: ColorPalette[],
  fallback?: PaletteAlbumLike | null
): ResolvedPaletteResult;
export function resolveAlbumPalette(
  student: PaletteStudentLike | null | undefined,
  album: PaletteAlbumLike | null | undefined,
  palettes?: ColorPalette[]
): ResolvedStudentPaletteResult;
export function resolveAlbumPalette(
  codeOrStudent?: string | PaletteStudentLike | null,
  configOrAlbum?: Partial<PaletteColors> | PaletteAlbumLike | null,
  palettes: ColorPalette[] = DEFAULT_PALETTES,
  fallback?: PaletteAlbumLike | null
): ResolvedPaletteResult | ResolvedStudentPaletteResult {
  if (
    isPaletteStudentInput(codeOrStudent) ||
    ((codeOrStudent === null || codeOrStudent === undefined) &&
      isPaletteAlbumInput(configOrAlbum) &&
      'paleta' in configOrAlbum)
  ) {
    return resolveStudentEffectivePalette(
      configOrAlbum as PaletteAlbumLike | null | undefined,
      codeOrStudent as PaletteStudentLike | null | undefined,
      palettes
    );
  }

  const paletaCode = typeof codeOrStudent === 'string' ? codeOrStudent : undefined;
  const paletaConfig =
    configOrAlbum && typeof configOrAlbum === 'object'
      ? (configOrAlbum as Partial<PaletteColors>)
      : undefined;

  const code = normalizePaletteCode(paletaCode);
  const found = findPaletteByCode(code, palettes);
  const defaultPalette = getDefaultPaletteFromCatalog(palettes);

  // Si la personalización viene vacía/indefinida y existe paleta general de respaldo, devolver la general
  if (!code && !isCompletePaletteColors(paletaConfig)) {
    if (fallback && (normalizePaletteCode(fallback.paleta) || isCompletePaletteColors(fallback.paletaConfig))) {
      return resolveAlbumPalette(fallback.paleta, fallback.paletaConfig, palettes);
    }
    return {
      codigo: defaultPalette.codigo,
      colors: sanitizePaletteColors(defaultPalette),
      palette: defaultPalette
    };
  }

  if (isCompletePaletteColors(paletaConfig)) {
    return {
      codigo: found ? found.codigo : code || defaultPalette.codigo,
      colors: sanitizePaletteColors(paletaConfig),
      palette: found
    };
  }

  if (found) {
    return {
      codigo: found.codigo,
      colors: sanitizePaletteColors(found),
      palette: found
    };
  }

  if (
    fallback &&
    (normalizePaletteCode(fallback.paleta) ||
      isCompletePaletteColors(fallback.paletaConfig))
  ) {
    return resolveAlbumPalette(fallback.paleta, fallback.paletaConfig, palettes);
  }

  return {
    codigo: defaultPalette.codigo,
    colors: sanitizePaletteColors(defaultPalette),
    palette: defaultPalette
  };
}

export function resolveStudentEffectivePalette(
  album: PaletteAlbumLike | null | undefined,
  student: PaletteStudentLike | null | undefined,
  palettes: ColorPalette[] = DEFAULT_PALETTES
): ResolvedStudentPaletteResult {
  const general = resolveAlbumPalette(album?.paleta, album?.paletaConfig, palettes);

  if (!student) {
    return {
      ...general,
      isStudentCustom: false
    };
  }

  // 1. Prioridad máxima: paletaOverride presente y válida en DraftStudent
  if (
    student.paletaOverride &&
    typeof student.paletaOverride === 'object'
  ) {
    if (isCompletePaletteColors(student.paletaOverride)) {
      const overrideObj = student.paletaOverride as Partial<ColorPalette>;
      const overrideCode =
        normalizePaletteCode(overrideObj.codigo) ||
        normalizePaletteCode(student.paleta) ||
        'personalizada';
      const matched = findPaletteByCode(overrideCode, palettes);
      return {
        codigo: matched ? matched.codigo : overrideCode,
        colors: sanitizePaletteColors(student.paletaOverride),
        palette: matched,
        isStudentCustom: true
      };
    }
  } else if (typeof student.paletaOverride === 'string') {
    const overrideCode = normalizePaletteCode(student.paletaOverride);
    if (overrideCode) {
      const matched = findPaletteByCode(overrideCode, palettes);
      if (matched) {
        return {
          codigo: matched.codigo,
          colors: sanitizePaletteColors(matched),
          palette: matched,
          isStudentCustom: true
        };
      }
      if (isCompletePaletteColors(student.paletaConfig)) {
        return {
          codigo: overrideCode,
          colors: sanitizePaletteColors(student.paletaConfig),
          isStudentCustom: true
        };
      }
    }
  }

  // 2. Campo individual estándar: paleta + paletaConfig del estudiante
  const studentCode = normalizePaletteCode(student.paleta);
  if (studentCode) {
    const matched = findPaletteByCode(studentCode, palettes);
    if (isCompletePaletteColors(student.paletaConfig)) {
      return {
        codigo: matched ? matched.codigo : studentCode,
        colors: sanitizePaletteColors(student.paletaConfig),
        palette: matched,
        isStudentCustom: true
      };
    }
    if (matched) {
      return {
        codigo: matched.codigo,
        colors: sanitizePaletteColors(matched),
        palette: matched,
        isStudentCustom: true
      };
    }
  } else if (
    student.paleta !== '' &&
    (student.paletaOverride === undefined || student.paletaOverride === null) &&
    isCompletePaletteColors(student.paletaConfig)
  ) {
    return {
      codigo: 'personalizada',
      colors: sanitizePaletteColors(student.paletaConfig),
      isStudentCustom: true
    };
  }

  // 3. Sin personalización válida -> heredar automáticamente la paleta general del álbum
  return {
    ...general,
    isStudentCustom: false
  };
}

