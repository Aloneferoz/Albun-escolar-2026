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

export function resolveAlbumPalette(
  paletaCode?: string | null,
  paletaConfig?: Partial<PaletteColors> | null,
  palettes: ColorPalette[] = DEFAULT_PALETTES
): {
  codigo: string;
  colors: PaletteColors;
  palette?: ColorPalette;
} {
  const rawCode = String(paletaCode || DEFAULT_PALETTE_CODE).trim();
  const normalizedCode = rawCode
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const code = normalizedCode.length >= 3 ? normalizedCode : DEFAULT_PALETTE_CODE;
  const found =
    palettes.find((p) => p.codigo === code) ||
    DEFAULT_PALETTES.find((p) => p.codigo === code);
  const defaultPalette =
    palettes.find((p) => p.esPredeterminada) ||
    palettes.find((p) => p.codigo === DEFAULT_PALETTE_CODE) ||
    DEFAULT_PALETTES[0];

  if (
    paletaConfig &&
    isValidHexColor(paletaConfig.colorPrincipal) &&
    isValidHexColor(paletaConfig.colorSecundario) &&
    isValidHexColor(paletaConfig.colorAcento) &&
    isValidHexColor(paletaConfig.colorTexto)
  ) {
    return {
      codigo: found ? found.codigo : code,
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

  return {
    codigo: defaultPalette.codigo,
    colors: sanitizePaletteColors(defaultPalette),
    palette: defaultPalette
  };
}
