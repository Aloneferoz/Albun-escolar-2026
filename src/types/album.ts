import {
  ColorPalette,
  DEFAULT_PALETTE_CODE,
  DEFAULT_PALETTE_COLORS,
  DEFAULT_PALETTES,
  isValidHexColor,
  normalizeHexColor,
  PaletteColors,
  resolveAlbumPalette,
  sanitizePaletteColors
} from '../theme/palettes';

export type { ColorPalette, PaletteColors };
export {
  DEFAULT_PALETTE_CODE,
  DEFAULT_PALETTE_COLORS,
  DEFAULT_PALETTES,
  isValidHexColor,
  normalizeHexColor,
  resolveAlbumPalette,
  sanitizePaletteColors
};

export type NivelEducativo = 'Inicial' | 'Primaria' | 'Secundaria';

export type PaletaVisual = string;

export type PublishStatus = 'borrador' | 'publicado';

export interface FotoItem {
  titulo: string;
  categoria: string;
  url: string;
  descargaUrl?: string;
}

export interface VideoItem {
  titulo: string;
  duracion: string;
  descripcion?: string;
  portadaUrl?: string;
  embedUrl: string;
}

export interface PublicStudentCard {
  nombre: string;
  frase: string;
  fotoUrl: string;
}

export interface AnuarioDraftEntry {
  id?: string;
  nombre: string;
  frase: string;
  fotoUrl: string;
}

export interface DraftAlbum {
  id: string;
  slug: string;
  colegio: string;
  promocion: string;
  nivel: NivelEducativo;
  anio: string;
  paleta: PaletaVisual;
  paletaConfig?: PaletteColors;
  portadaUrl: string;
  musicaUrl: string;
  whatsappTexto: string;
  tutoraTitulo: string;
  tutoraNombre: string;
  tutoraCargo: string;
  tutoraFotoUrl: string;
  tutoraTexto: string;
  fotos: FotoItem[];
  videos: VideoItem[];
  allowGroupAnuario: boolean;
  generalShareEnabled: boolean;
  generalAccessToken: string;
  generalTokenRevoked: boolean;
  status: PublishStatus;
  ownerUid: string;
  hasUnpublishedChanges: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DraftStudent {
  id: string;
  albumId: string;
  slug: string;
  nombre: string;
  frase: string;
  fotoUrl: string;
  parentPhone: string;
  paleta?: PaletaVisual;
  paletaConfig?: PaletteColors;
  accessToken: string;
  tokenRevoked: boolean;
  status: PublishStatus;
  order: number;
  ownerUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AlbumAccessDoc {
  albumId: string;
  scope: 'student' | 'album';
  albumStatus: PublishStatus;
  studentStatus: PublishStatus;
  revoked: boolean;
  colegio: string;
  promocion: string;
  nivel: NivelEducativo;
  anio: string;
  paleta: PaletaVisual;
  paletaConfig?: PaletteColors;
  portadaUrl?: string;
  musicaUrl?: string;
  tutoraTitulo?: string;
  tutoraNombre?: string;
  tutoraCargo?: string;
  tutoraFotoUrl?: string;
  tutoraTexto?: string;
  fotos: FotoItem[];
  videos: VideoItem[];
  student?: PublicStudentCard;
  anuario: PublicStudentCard[];
  publishedBy: string;
  updatedAt?: unknown;
}

// Restricciones sincronizadas con firebase-blueprint.json
export const BLUEPRINT_LIMITS = {
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  SLUG_REGEX: /^[a-z0-9-]+$/,
  TOKEN_REGEX: /^[A-Za-z0-9_-]{32,64}$/,
  ANIO_REGEX: /^[0-9]{4}$/,
  ALBUM_SLUG_MIN: 3,
  STUDENT_SLUG_MIN: 2,
  TOKEN_MIN: 32,
  TOKEN_MAX: 64,
  SLUG_MAX: 80,
  COLEGIO_MAX: 140,
  PROMOCION_MAX: 140,
  URL_MAX: 500,
  WHATSAPP_MAX: 500,
  TUTORA_TITULO_MAX: 160,
  TUTORA_NOMBRE_MAX: 120,
  TUTORA_CARGO_MAX: 120,
  TUTORA_TEXTO_MAX: 4000,
  FOTOS_MAX: 60,
  VIDEOS_MAX: 20,
  FOTO_TITULO_MAX: 140,
  FOTO_CATEGORIA_MAX: 40,
  VIDEO_TITULO_MAX: 160,
  VIDEO_DURACION_MAX: 20,
  VIDEO_DESC_MAX: 400,
  STUDENT_NAME_MAX: 120,
  STUDENT_FRASE_MAX: 400,
  PARENT_PHONE_MAX: 30,
  ORDER_MAX: 5000,
  PALETTE_CODE_MIN: 3,
  PALETTE_CODE_MAX: 60,
  PALETTE_NAME_MIN: 2,
  PALETTE_NAME_MAX: 80,
  PALETTE_DESC_MAX: 240
} as const;

export function generateAccessToken(byteLength = 27): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  // 27 bytes -> 27 chars, expandimos si hace falta para asegurar >= 36 caracteres
  while (result.length < 36) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result.slice(0, 40);
}

export function isValidAccessToken(token: string | undefined | null): boolean {
  return Boolean(token && BLUEPRINT_LIMITS.TOKEN_REGEX.test(token));
}

export function slugify(raw: string, minLen = 2): string {
  const normalized = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BLUEPRINT_LIMITS.SLUG_MAX);

  if (normalized.length >= minLen) return normalized;
  return `${normalized || 'item'}-${Math.random().toString(36).slice(2, 6)}`.slice(
    0,
    BLUEPRINT_LIMITS.SLUG_MAX
  );
}

export function clampStr(val: string | undefined | null, max: number): string {
  return String(val ?? '').trim().slice(0, max);
}

export function extractYouTubeId(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const match = rawUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return match ? match[1] : null;
}

export function getYouTubeThumbnailUrl(rawUrl: string): string {
  const ytId = extractYouTubeId(rawUrl);
  return ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '';
}

export function sanitizeFotoItem(item: FotoItem): FotoItem {
  const url =
    clampStr(item.url, BLUEPRINT_LIMITS.URL_MAX) ||
    '/src/assets/images/foto_ceremonia_1795554404001.jpg';
  const descargaUrl = clampStr(
    item.descargaUrl || url,
    BLUEPRINT_LIMITS.URL_MAX
  );
  return {
    titulo:
      clampStr(item.titulo, BLUEPRINT_LIMITS.FOTO_TITULO_MAX) ||
      'Recuerdo escolar',
    categoria:
      clampStr(item.categoria, BLUEPRINT_LIMITS.FOTO_CATEGORIA_MAX) ||
      'Ceremonia',
    url,
    descargaUrl
  };
}

export function sanitizeVideoItem(item: VideoItem): VideoItem {
  const embedUrl =
    clampStr(item.embedUrl, BLUEPRINT_LIMITS.URL_MAX) ||
    'https://youtu.be/5AM6ecA8zrk';
  const portadaFallback =
    getYouTubeThumbnailUrl(embedUrl) ||
    '/src/assets/images/foto_ceremonia_1795554404001.jpg';
  return {
    titulo:
      clampStr(item.titulo, BLUEPRINT_LIMITS.VIDEO_TITULO_MAX) ||
      'Video en YouTube',
    duracion:
      clampStr(item.duracion, BLUEPRINT_LIMITS.VIDEO_DURACION_MAX) || '02:00',
    descripcion: clampStr(item.descripcion, BLUEPRINT_LIMITS.VIDEO_DESC_MAX),
    portadaUrl: clampStr(
      item.portadaUrl || portadaFallback,
      BLUEPRINT_LIMITS.URL_MAX
    ),
    embedUrl
  };
}

export function sanitizePhoneForWhatsApp(phone: string): string {
  return String(phone || '').replace(/[^\d]/g, '');
}

export function buildPublicTokenUrl(accessToken: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/?t=${encodeURIComponent(accessToken)}`;
}

export function buildWhatsAppShareUrl(options: {
  phone?: string;
  message: string;
}): string {
  const cleanPhone = sanitizePhoneForWhatsApp(options.phone || '');
  const encodedText = encodeURIComponent(options.message);
  if (cleanPhone.length >= 7) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

export function parseAnuarioSnippet(rawInput: string): PublicStudentCard[] {
  const raw = String(rawInput || '').trim();
  if (!raw) return [];

  // Eliminar comentarios // y /* */ únicamente fuera de comillas (preservando https://)
  let withoutComments = '';
  let quoteChar: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (quoteChar) {
      withoutComments += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quoteChar) {
        quoteChar = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quoteChar = ch;
      withoutComments += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < raw.length && raw[i] !== '\n') i += 1;
      withoutComments += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) {
        i += 1;
      }
      i += 1;
      continue;
    }
    withoutComments += ch;
  }

  const trimmed = withoutComments.trim();
  if (trimmed.includes('{') && trimmed.includes('nombre')) {
    const firstBracket = trimmed.indexOf('[');
    let candidate =
      firstBracket >= 0 ? trimmed.slice(firstBracket) : `[${trimmed}]`;
    const lastBracket = candidate.lastIndexOf(']');
    if (lastBracket >= 0 && firstBracket >= 0) {
      candidate = candidate.slice(0, lastBracket + 1);
    } else if (!candidate.trim().endsWith(']')) {
      candidate = `${candidate.replace(/,\s*$/, '')}]`;
    }

    // Convertir comillas simples a dobles y citar claves sin comillas fuera de strings
    let normalized = '';
    let activeQuote: '"' | "'" | null = null;
    let esc = false;
    for (let i = 0; i < candidate.length; i += 1) {
      const ch = candidate[i];
      if (activeQuote) {
        if (esc) {
          normalized += activeQuote === "'" && ch === "'" ? "'" : `\\${ch}`;
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === activeQuote) {
          normalized += '"';
          activeQuote = null;
          continue;
        }
        if (activeQuote === "'" && ch === '"') {
          normalized += '\\"';
        } else {
          normalized += ch;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        activeQuote = ch;
        normalized += '"';
        continue;
      }
      normalized += ch;
    }

    // Citar claves de objeto fuera de strings
    let jsonReady = '';
    let inJsonStr = false;
    let jsonEsc = false;
    for (let i = 0; i < normalized.length; i += 1) {
      const ch = normalized[i];
      if (inJsonStr) {
        jsonReady += ch;
        if (jsonEsc) {
          jsonEsc = false;
        } else if (ch === '\\') {
          jsonEsc = true;
        } else if (ch === '"') {
          inJsonStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inJsonStr = true;
        jsonReady += ch;
        continue;
      }
      if (/[a-zA-Z_$]/.test(ch)) {
        let j = i;
        while (j < normalized.length && /[a-zA-Z0-9_$]/.test(normalized[j])) {
          j += 1;
        }
        const ident = normalized.slice(i, j);
        let k = j;
        while (k < normalized.length && /\s/.test(normalized[k])) k += 1;
        if (normalized[k] === ':') {
          jsonReady += `"${ident}"`;
          i = j - 1;
          continue;
        }
      }
      jsonReady += ch;
    }

    jsonReady = jsonReady.replace(/,\s*([}\]])/g, '$1');

    try {
      const parsed = JSON.parse(jsonReady);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item && typeof item.nombre === 'string' && item.nombre.trim().length >= 2)
          .map((item) => ({
            nombre: clampStr(item.nombre, BLUEPRINT_LIMITS.STUDENT_NAME_MAX),
            frase: clampStr(item.frase || '', BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
            fotoUrl:
              clampStr(item.fotoUrl || '', BLUEPRINT_LIMITS.URL_MAX) ||
              '/src/assets/images/alumno_1_1795554404726.jpg'
          }));
      }
    } catch {
      // Continuar al fallback por líneas si el JSON está incompleto
    }
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      return {
        nombre: clampStr(parts[0], BLUEPRINT_LIMITS.STUDENT_NAME_MAX),
        frase: clampStr(parts[1] || '', BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
        fotoUrl:
          clampStr(parts[2] || '', BLUEPRINT_LIMITS.URL_MAX) ||
          '/src/assets/images/alumno_1_1795554404726.jpg'
      };
    })
    .filter((item) => item.nombre.length >= 2);
}
