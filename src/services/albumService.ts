import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType
} from '../firebase';
import { DEFAULT_SEED_ALBUM } from '../data/defaultSeed';
import {
  AlbumAccessDoc,
  AnuarioDraftEntry,
  BLUEPRINT_LIMITS,
  clampStr,
  ColorPalette,
  DEFAULT_PALETTE_CODE,
  DEFAULT_PALETTE_COLORS,
  DEFAULT_PALETTES,
  DraftAlbum,
  DraftStudent,
  FotoItem,
  generateAccessToken,
  hasStudentCustomPalette,
  isCompletePaletteColors,
  isValidAccessToken,
  isValidHexColor,
  normalizePaletteCode,
  PaletteColors,
  PublicStudentCard,
  PublishStatus,
  resolveAlbumPalette,
  resolveStudentEffectivePalette,
  sanitizeFotoItem,
  sanitizePaletteColors,
  sanitizeVideoItem,
  slugify,
  VideoItem
} from '../types/album';

function parsePaletteConfig(raw: unknown): PaletteColors | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Partial<PaletteColors>;
  if (
    isValidHexColor(obj.colorPrincipal) &&
    isValidHexColor(obj.colorSecundario) &&
    isValidHexColor(obj.colorAcento) &&
    isValidHexColor(obj.colorTexto)
  ) {
    return sanitizePaletteColors(obj);
  }
  return undefined;
}

function parsePaletaOverride(
  raw: unknown
): string | PaletteColors | undefined {
  if (typeof raw === 'string') {
    return normalizePaletteCode(raw);
  }
  return parsePaletteConfig(raw);
}

export async function fetchPalettesCatalogSafe(): Promise<ColorPalette[]> {
  try {
    const snap = await getDocs(collection(db, 'palettes'));
    if (snap.empty) return DEFAULT_PALETTES;

    const byCode = new Map<string, ColorPalette>();
    DEFAULT_PALETTES.forEach((p) => byCode.set(p.codigo, p));

    snap.docs.forEach((d) => {
      const data = d.data();
      const code = String(data.codigo || d.id);
      const safeColors = sanitizePaletteColors({
        colorPrincipal: String(data.colorPrincipal || ''),
        colorSecundario: String(data.colorSecundario || ''),
        colorAcento: String(data.colorAcento || ''),
        colorTexto: String(data.colorTexto || '')
      });
      byCode.set(code, {
        codigo: code,
        nombre: String(data.nombre || code),
        descripcion: String(data.descripcion || ''),
        ...safeColors,
        activa: data.activa !== false,
        esPredeterminada: Boolean(data.esPredeterminada),
        ownerUid: String(data.ownerUid || ''),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });
    });

    return Array.from(byCode.values()).sort((a, b) => {
      if (a.esPredeterminada && !b.esPredeterminada) return -1;
      if (!a.esPredeterminada && b.esPredeterminada) return 1;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
  } catch {
    return DEFAULT_PALETTES;
  }
}

function getCurrentUidFallback(explicitUid?: string): string {
  const candidate =
    (typeof explicitUid === 'string' && explicitUid.trim()) ||
    auth.currentUser?.uid ||
    '';
  return candidate.slice(0, 128) || 'admin';
}

function resolvePreservedOwnerUid(
  existingData: Record<string, unknown> | undefined,
  fallbackUid?: string
): string {
  if (
    existingData &&
    typeof existingData.ownerUid === 'string' &&
    existingData.ownerUid.length >= 1 &&
    existingData.ownerUid.length <= 128
  ) {
    return existingData.ownerUid;
  }
  return getCurrentUidFallback(fallbackUid);
}

function isFirestoreTimestampLike(value: unknown): value is Timestamp {
  if (value instanceof Timestamp) return true;
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    seconds?: unknown;
    nanoseconds?: unknown;
    toMillis?: unknown;
  };
  return (
    typeof candidate.toMillis === 'function' ||
    (typeof candidate.seconds === 'number' &&
      typeof candidate.nanoseconds === 'number')
  );
}

function resolvePreservedCreatedAt(
  existingData: Record<string, unknown> | undefined
) {
  return isFirestoreTimestampLike(existingData?.createdAt)
    ? existingData.createdAt
    : serverTimestamp();
}

const ALLOWED_DRAFT_ALBUM_KEYS = new Set<string>([
  'slug',
  'colegio',
  'promocion',
  'nivel',
  'anio',
  'paleta',
  'paletaConfig',
  'portadaUrl',
  'musicaUrl',
  'whatsappTexto',
  'tutoraTitulo',
  'tutoraNombre',
  'tutoraCargo',
  'tutoraFotoUrl',
  'tutoraTexto',
  'fotos',
  'videos',
  'allowGroupAnuario',
  'generalShareEnabled',
  'generalAccessToken',
  'generalTokenRevoked',
  'status',
  'ownerUid',
  'hasUnpublishedChanges',
  'createdAt',
  'updatedAt'
]);

function canSafelyUpdateExistingAlbum(
  existingData: Record<string, unknown> | undefined
): existingData is Record<string, unknown> {
  if (!existingData) return false;
  const keys = Object.keys(existingData);
  if (keys.some((k) => !ALLOWED_DRAFT_ALBUM_KEYS.has(k))) {
    return false;
  }
  const hasValidOwner =
    typeof existingData.ownerUid === 'string' &&
    existingData.ownerUid.length >= 1 &&
    existingData.ownerUid.length <= 128;
  const hasValidCreatedAt = isFirestoreTimestampLike(existingData.createdAt);
  return hasValidOwner && hasValidCreatedAt;
}

function buildMutableAlbumFields(
  albumId: string,
  existingData: Record<string, unknown> | undefined,
  overrides: Record<string, unknown> = {},
  palettes: ColorPalette[] = DEFAULT_PALETTES
): Record<string, unknown> {
  const full = buildNormalizedAlbumPayload(
    albumId,
    existingData,
    undefined,
    overrides,
    palettes
  );
  const { ownerUid: _ownerUid, createdAt: _createdAt, ...mutableFields } = full;
  return mutableFields;
}

async function writeAlbumUpdateOrRepair(
  albumRef: ReturnType<typeof doc>,
  albumId: string,
  existingData: Record<string, unknown> | undefined,
  fallbackUid: string | undefined,
  overrides: Record<string, unknown> = {},
  palettes: ColorPalette[] = DEFAULT_PALETTES
): Promise<void> {
  if (canSafelyUpdateExistingAlbum(existingData)) {
    await updateDoc(
      albumRef,
      buildMutableAlbumFields(albumId, existingData, overrides, palettes)
    );
    return;
  }
  await setDoc(
    albumRef,
    buildNormalizedAlbumPayload(
      albumId,
      existingData,
      fallbackUid,
      overrides,
      palettes
    )
  );
}

function batchAlbumUpdateOrRepair(
  batch: ReturnType<typeof writeBatch>,
  albumRef: ReturnType<typeof doc>,
  albumId: string,
  existingData: Record<string, unknown> | undefined,
  fallbackUid: string | undefined,
  overrides: Record<string, unknown> = {},
  palettes: ColorPalette[] = DEFAULT_PALETTES
): void {
  if (canSafelyUpdateExistingAlbum(existingData)) {
    batch.update(
      albumRef,
      buildMutableAlbumFields(albumId, existingData, overrides, palettes)
    );
    return;
  }
  batch.set(
    albumRef,
    buildNormalizedAlbumPayload(
      albumId,
      existingData,
      fallbackUid,
      overrides,
      palettes
    )
  );
}

function buildNormalizedAlbumPayload(
  albumId: string,
  existingData: Record<string, unknown> | undefined,
  fallbackUid: string | undefined,
  overrides: Record<string, unknown> = {},
  palettes: ColorPalette[] = DEFAULT_PALETTES
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...(existingData || {}),
    ...overrides
  };

  const rawColegio = clampStr(
    typeof merged.colegio === 'string' ? merged.colegio : '',
    BLUEPRINT_LIMITS.COLEGIO_MAX
  );
  const safeColegio = rawColegio.length >= 2 ? rawColegio : 'Colegio';

  const rawPromocion = clampStr(
    typeof merged.promocion === 'string' ? merged.promocion : '',
    BLUEPRINT_LIMITS.PROMOCION_MAX
  );
  const safePromocion =
    rawPromocion.length >= 2 ? rawPromocion : 'Promoción Escolar';

  const safeNivel =
    merged.nivel === 'Inicial' ||
    merged.nivel === 'Primaria' ||
    merged.nivel === 'Secundaria'
      ? merged.nivel
      : 'Primaria';

  const rawAnio = typeof merged.anio === 'string' ? merged.anio.trim() : '';
  const safeAnio = BLUEPRINT_LIMITS.ANIO_REGEX.test(rawAnio) ? rawAnio : '2026';

  const safeSlug = slugify(
    typeof merged.slug === 'string' && merged.slug.trim()
      ? merged.slug
      : albumId,
    BLUEPRINT_LIMITS.ALBUM_SLUG_MIN
  );

  const resolvedPaleta = resolveAlbumPalette(
    typeof merged.paleta === 'string' ? merged.paleta : undefined,
    parsePaletteConfig(merged.paletaConfig),
    palettes
  );

  const rawFotos = Array.isArray(merged.fotos) ? merged.fotos : [];
  const sanitizedFotos = rawFotos
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object')
    )
    .slice(0, BLUEPRINT_LIMITS.FOTOS_MAX)
    .map((item) =>
      sanitizeFotoItem({
        titulo: String(item.titulo || ''),
        categoria: String(item.categoria || ''),
        url: String(item.url || ''),
        descargaUrl:
          typeof item.descargaUrl === 'string' ? item.descargaUrl : undefined
      })
    );

  const rawVideos = Array.isArray(merged.videos) ? merged.videos : [];
  const sanitizedVideos = rawVideos
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object')
    )
    .slice(0, BLUEPRINT_LIMITS.VIDEOS_MAX)
    .map((item) =>
      sanitizeVideoItem({
        titulo: String(item.titulo || ''),
        duracion: String(item.duracion || ''),
        descripcion:
          typeof item.descripcion === 'string' ? item.descripcion : undefined,
        portadaUrl:
          typeof item.portadaUrl === 'string' ? item.portadaUrl : undefined,
        embedUrl: String(item.embedUrl || '')
      })
    );

  const rawGeneralToken =
    typeof merged.generalAccessToken === 'string'
      ? merged.generalAccessToken
      : '';

  return {
    slug: safeSlug,
    colegio: safeColegio,
    promocion: safePromocion,
    nivel: safeNivel,
    anio: safeAnio,
    paleta: resolvedPaleta.codigo,
    paletaConfig: resolvedPaleta.colors,
    portadaUrl: clampStr(
      typeof merged.portadaUrl === 'string' ? merged.portadaUrl : '',
      BLUEPRINT_LIMITS.URL_MAX
    ),
    musicaUrl: clampStr(
      typeof merged.musicaUrl === 'string' ? merged.musicaUrl : '',
      BLUEPRINT_LIMITS.URL_MAX
    ),
    whatsappTexto: clampStr(
      typeof merged.whatsappTexto === 'string' ? merged.whatsappTexto : '',
      BLUEPRINT_LIMITS.WHATSAPP_MAX
    ),
    tutoraTitulo: clampStr(
      typeof merged.tutoraTitulo === 'string' ? merged.tutoraTitulo : '',
      BLUEPRINT_LIMITS.TUTORA_TITULO_MAX
    ),
    tutoraNombre: clampStr(
      typeof merged.tutoraNombre === 'string' ? merged.tutoraNombre : '',
      BLUEPRINT_LIMITS.TUTORA_NOMBRE_MAX
    ),
    tutoraCargo: clampStr(
      typeof merged.tutoraCargo === 'string' ? merged.tutoraCargo : '',
      BLUEPRINT_LIMITS.TUTORA_CARGO_MAX
    ),
    tutoraFotoUrl: clampStr(
      typeof merged.tutoraFotoUrl === 'string' ? merged.tutoraFotoUrl : '',
      BLUEPRINT_LIMITS.URL_MAX
    ),
    tutoraTexto: clampStr(
      typeof merged.tutoraTexto === 'string' ? merged.tutoraTexto : '',
      BLUEPRINT_LIMITS.TUTORA_TEXTO_MAX
    ),
    fotos: sanitizedFotos,
    videos: sanitizedVideos,
    allowGroupAnuario: Boolean(merged.allowGroupAnuario),
    generalShareEnabled: Boolean(merged.generalShareEnabled),
    generalAccessToken: isValidAccessToken(rawGeneralToken)
      ? rawGeneralToken
      : '',
    generalTokenRevoked: Boolean(merged.generalTokenRevoked),
    status: merged.status === 'publicado' ? 'publicado' : 'borrador',
    ownerUid: resolvePreservedOwnerUid(existingData, fallbackUid),
    hasUnpublishedChanges: Boolean(merged.hasUnpublishedChanges),
    createdAt: resolvePreservedCreatedAt(existingData),
    updatedAt: serverTimestamp()
  };
}

function buildNormalizedStudentPayload(
  albumId: string,
  studentId: string,
  existingData: Record<string, unknown> | undefined,
  fallbackUid: string | undefined,
  overrides: Record<string, unknown> & { clearPaleta?: boolean } = {},
  palettes: ColorPalette[] = DEFAULT_PALETTES
): Record<string, unknown> {
  const { clearPaleta, ...restOverrides } = overrides;
  const definedOverrides: Record<string, unknown> = {};
  Object.entries(restOverrides).forEach(([key, val]) => {
    if (val !== undefined) {
      definedOverrides[key] = val;
    }
  });
  const merged: Record<string, unknown> = {
    ...(existingData || {}),
    ...definedOverrides
  };

  const rawNombre = clampStr(
    typeof merged.nombre === 'string' ? merged.nombre : '',
    BLUEPRINT_LIMITS.STUDENT_NAME_MAX
  );
  const safeNombre = rawNombre.length >= 2 ? rawNombre : 'Alumno';
  const safeSlug = slugify(
    typeof merged.slug === 'string' && merged.slug.trim()
      ? merged.slug
      : safeNombre || studentId,
    BLUEPRINT_LIMITS.STUDENT_SLUG_MIN
  );
  const rawToken =
    typeof merged.accessToken === 'string' ? merged.accessToken : '';
  const safeToken = isValidAccessToken(rawToken)
    ? rawToken
    : generateAccessToken();
  const safeOrder = Math.max(
    0,
    Math.min(BLUEPRINT_LIMITS.ORDER_MAX, Number(merged.order) || 0)
  );

  const payload: Record<string, unknown> = {
    albumId,
    slug: safeSlug,
    nombre: safeNombre,
    frase: clampStr(
      typeof merged.frase === 'string' ? merged.frase : '',
      BLUEPRINT_LIMITS.STUDENT_FRASE_MAX
    ),
    fotoUrl: clampStr(
      typeof merged.fotoUrl === 'string' ? merged.fotoUrl : '',
      BLUEPRINT_LIMITS.URL_MAX
    ),
    parentPhone: clampStr(
      typeof merged.parentPhone === 'string' ? merged.parentPhone : '',
      BLUEPRINT_LIMITS.PARENT_PHONE_MAX
    ),
    accessToken: safeToken,
    tokenRevoked: Boolean(merged.tokenRevoked),
    status: merged.status === 'borrador' ? 'borrador' : 'publicado',
    order: safeOrder,
    ownerUid: resolvePreservedOwnerUid(existingData, fallbackUid),
    createdAt: resolvePreservedCreatedAt(existingData),
    updatedAt: serverTimestamp()
  };

  if (!clearPaleta) {
    const parsedOverride = parsePaletaOverride(merged.paletaOverride);
    const studentPaletteCandidate = {
      paleta: typeof merged.paleta === 'string' ? merged.paleta : undefined,
      paletaConfig: parsePaletteConfig(merged.paletaConfig),
      paletaOverride: parsedOverride
    };
    if (hasStudentCustomPalette(studentPaletteCandidate)) {
      const resolved = resolveStudentEffectivePalette(
        { paleta: DEFAULT_PALETTE_CODE, paletaConfig: DEFAULT_PALETTE_COLORS },
        studentPaletteCandidate,
        palettes
      );
      if (resolved.isStudentCustom) {
        const cleanSlugCode = slugify(
          resolved.codigo,
          BLUEPRINT_LIMITS.PALETTE_CODE_MIN
        ).slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX);
        payload.paleta = cleanSlugCode;
        payload.paletaConfig = resolved.colors;
        payload.paletaOverride =
          typeof parsedOverride === 'string'
            ? slugify(parsedOverride, BLUEPRINT_LIMITS.PALETTE_CODE_MIN).slice(
                0,
                BLUEPRINT_LIMITS.PALETTE_CODE_MAX
              )
            : resolved.colors;
      }
    }
  }

  return payload;
}

export function isSuperAdminUser(
  email: string | null | undefined,
  emailVerified: boolean | undefined
): boolean {
  return Boolean(emailVerified && email === BOOTSTRAPPED_ADMIN_EMAIL);
}

export async function checkIsAdmin(
  uid: string,
  email: string | null | undefined,
  emailVerified: boolean | undefined
): Promise<boolean> {
  if (!emailVerified) return false;
  if (email === BOOTSTRAPPED_ADMIN_EMAIL) return true;

  const path = `admins/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('permission')
    ) {
      return false;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeDraftAlbums(
  onData: (albums: DraftAlbum[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'albums';
  const q = query(collection(db, 'albums'), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items: DraftAlbum[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          slug: String(data.slug || d.id),
          colegio: String(data.colegio || ''),
          promocion: String(data.promocion || ''),
          nivel: (data.nivel as DraftAlbum['nivel']) || 'Primaria',
          anio: String(data.anio || '2026'),
          paleta: (data.paleta as DraftAlbum['paleta']) || DEFAULT_PALETTE_CODE,
          paletaConfig: parsePaletteConfig(data.paletaConfig),
          portadaUrl: String(data.portadaUrl || ''),
          musicaUrl: String(data.musicaUrl || ''),
          whatsappTexto: String(data.whatsappTexto || ''),
          tutoraTitulo: String(data.tutoraTitulo || ''),
          tutoraNombre: String(data.tutoraNombre || ''),
          tutoraCargo: String(data.tutoraCargo || ''),
          tutoraFotoUrl: String(data.tutoraFotoUrl || ''),
          tutoraTexto: String(data.tutoraTexto || ''),
          fotos: Array.isArray(data.fotos) ? data.fotos : [],
          videos: Array.isArray(data.videos) ? data.videos : [],
          allowGroupAnuario: Boolean(data.allowGroupAnuario),
          generalShareEnabled: Boolean(data.generalShareEnabled),
          generalAccessToken: String(data.generalAccessToken || ''),
          generalTokenRevoked: Boolean(data.generalTokenRevoked),
          status: (data.status as PublishStatus) || 'borrador',
          ownerUid: String(data.ownerUid || ''),
          hasUnpublishedChanges: Boolean(data.hasUnpublishedChanges),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeDraftStudents(
  albumId: string,
  onData: (students: DraftStudent[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `albums/${albumId}/students`;
  const q = query(
    collection(db, 'albums', albumId, 'students'),
    orderBy('order', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: DraftStudent[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          albumId: String(data.albumId || albumId),
          slug: String(data.slug || d.id),
          nombre: String(data.nombre || ''),
          frase: String(data.frase || ''),
          fotoUrl: String(data.fotoUrl || ''),
          parentPhone: String(data.parentPhone || ''),
          paleta:
            typeof data.paleta === 'string' && data.paleta.trim().length >= 3
              ? data.paleta.trim()
              : undefined,
          paletaConfig: parsePaletteConfig(data.paletaConfig),
          paletaOverride: parsePaletaOverride(data.paletaOverride),
          accessToken: String(data.accessToken || ''),
          tokenRevoked: Boolean(data.tokenRevoked),
          status: (data.status as PublishStatus) || 'publicado',
          order: typeof data.order === 'number' ? data.order : 0,
          ownerUid: String(data.ownerUid || ''),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribePalettes(
  onData: (palettes: ColorPalette[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'palettes';
  const q = query(collection(db, 'palettes'));
  return onSnapshot(
    q,
    (snap) => {
      const items: ColorPalette[] = snap.docs
        .map((d) => {
          const data = d.data();
          const safeColors = sanitizePaletteColors({
            colorPrincipal: String(data.colorPrincipal || ''),
            colorSecundario: String(data.colorSecundario || ''),
            colorAcento: String(data.colorAcento || ''),
            colorTexto: String(data.colorTexto || '')
          });
          return {
            codigo: String(data.codigo || d.id),
            nombre: String(data.nombre || d.id),
            descripcion: String(data.descripcion || ''),
            ...safeColors,
            activa: data.activa !== false,
            esPredeterminada: Boolean(data.esPredeterminada),
            ownerUid: String(data.ownerUid || ''),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          };
        })
        .sort((a, b) => {
          if (a.esPredeterminada && !b.esPredeterminada) return -1;
          if (!a.esPredeterminada && b.esPredeterminada) return 1;
          return a.nombre.localeCompare(b.nombre, 'es');
        });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function seedDefaultPalettes(ownerUid: string): Promise<void> {
  const path = 'palettes';
  try {
    const existingSnap = await getDocs(collection(db, 'palettes'));
    const existingIds = new Set(existingSnap.docs.map((d) => d.id));
    const missing = DEFAULT_PALETTES.filter((p) => !existingIds.has(p.codigo));
    if (missing.length === 0) return;

    const batch = writeBatch(db);
    missing.forEach((p) => {
      batch.set(doc(db, 'palettes', p.codigo), {
        codigo: p.codigo,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        colorPrincipal: p.colorPrincipal,
        colorSecundario: p.colorSecundario,
        colorAcento: p.colorAcento,
        colorTexto: p.colorTexto,
        activa: p.activa,
        esPredeterminada: Boolean(p.esPredeterminada),
        ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveColorPalette(
  ownerUid: string,
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
    assignedAlbumIds?: string[];
    allAlbumIds?: string[];
  }
): Promise<ColorPalette> {
  const cleanCodigo = slugify(
    input.codigo || input.nombre,
    BLUEPRINT_LIMITS.PALETTE_CODE_MIN
  ).slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX);

  if (
    cleanCodigo.length < BLUEPRINT_LIMITS.PALETTE_CODE_MIN ||
    !BLUEPRINT_LIMITS.SLUG_REGEX.test(cleanCodigo)
  ) {
    throw new Error(
      'El código identificador debe tener al menos 3 caracteres válidos (minúsculas, números o guiones).'
    );
  }

  const cleanNombre = clampStr(input.nombre, BLUEPRINT_LIMITS.PALETTE_NAME_MAX);
  if (cleanNombre.length < BLUEPRINT_LIMITS.PALETTE_NAME_MIN) {
    throw new Error('Ingresa un nombre válido para la paleta (mínimo 2 caracteres).');
  }

  if (
    !isValidHexColor(input.colorPrincipal) ||
    !isValidHexColor(input.colorSecundario) ||
    !isValidHexColor(input.colorAcento) ||
    !isValidHexColor(input.colorTexto)
  ) {
    throw new Error(
      'Todos los colores deben tener formato HEX válido de 6 dígitos (ej. #183a6e).'
    );
  }

  const cleanColors = sanitizePaletteColors(input);
  const cleanDesc = clampStr(input.descripcion, BLUEPRINT_LIMITS.PALETTE_DESC_MAX);
  const isDefaultCode = cleanCodigo === DEFAULT_PALETTE_CODE;
  const path = `palettes/${cleanCodigo}`;
  const paletteRef = doc(db, 'palettes', cleanCodigo);

  try {
    if (options.mode === 'create') {
      const existingSnap = await getDoc(paletteRef);
      if (existingSnap.exists()) {
        throw new Error(
          `Ya existe una paleta con el código identificador "${cleanCodigo}". Elige otro código único.`
        );
      }

      const batch = writeBatch(db);
      batch.set(paletteRef, {
        codigo: cleanCodigo,
        nombre: cleanNombre,
        descripcion: cleanDesc,
        colorPrincipal: cleanColors.colorPrincipal,
        colorSecundario: cleanColors.colorSecundario,
        colorAcento: cleanColors.colorAcento,
        colorTexto: cleanColors.colorTexto,
        activa: isDefaultCode ? true : Boolean(input.activa),
        esPredeterminada: Boolean(input.esPredeterminada || isDefaultCode),
        ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await batch.commit();
    } else {
      const batch = writeBatch(db);
      batch.update(paletteRef, {
        nombre: cleanNombre,
        descripcion: cleanDesc,
        colorPrincipal: cleanColors.colorPrincipal,
        colorSecundario: cleanColors.colorSecundario,
        colorAcento: cleanColors.colorAcento,
        colorTexto: cleanColors.colorTexto,
        activa: isDefaultCode ? true : Boolean(input.activa),
        esPredeterminada: Boolean(input.esPredeterminada || isDefaultCode),
        updatedAt: serverTimestamp()
      });

      const touchedAlbums = new Set<string>();
      const assignedSet = new Set(options.assignedAlbumIds || []);
      const albumIdsToScan = Array.from(
        new Set([...(options.allAlbumIds || []), ...(options.assignedAlbumIds || [])])
      );

      // Leer documentos de álbumes afectados para normalizarlos con set() y limpiar posibles campos heredados
      const albumSnapsMap = new Map<
        string,
        Record<string, unknown> | undefined
      >();
      await Promise.all(
        albumIdsToScan.map(async (albId) => {
          const snap = await getDoc(doc(db, 'albums', albId));
          if (snap.exists()) {
            albumSnapsMap.set(albId, snap.data());
          }
        })
      );

      const catalog = await fetchPalettesCatalogSafe();
      const updatedCatalog = catalog.map((item) =>
        item.codigo === cleanCodigo
          ? {
              ...item,
              nombre: cleanNombre,
              descripcion: cleanDesc,
              ...cleanColors,
              activa: isDefaultCode ? true : Boolean(input.activa),
              esPredeterminada: Boolean(input.esPredeterminada || isDefaultCode)
            }
          : item
      );

      assignedSet.forEach((albumId) => {
        touchedAlbums.add(albumId);
        batchAlbumUpdateOrRepair(
          batch,
          doc(db, 'albums', albumId),
          albumId,
          albumSnapsMap.get(albumId),
          ownerUid,
          {
            paleta: cleanCodigo,
            paletaConfig: cleanColors,
            hasUnpublishedChanges: true
          },
          updatedCatalog
        );
      });

      // Propagar colores actualizados a los alumnos que tienen esta paleta asignada individualmente
      for (const albId of albumIdsToScan) {
        const studentSnap = await getDocs(
          query(
            collection(db, 'albums', albId, 'students'),
            where('paleta', '==', cleanCodigo)
          )
        );
        if (!studentSnap.empty) {
          studentSnap.docs.forEach((sd) => {
            batch.set(
              sd.ref,
              buildNormalizedStudentPayload(
                albId,
                sd.id,
                sd.data(),
                ownerUid,
                {
                  paleta: cleanCodigo,
                  paletaConfig: cleanColors
                },
                updatedCatalog
              )
            );
          });
          if (!touchedAlbums.has(albId)) {
            touchedAlbums.add(albId);
            batchAlbumUpdateOrRepair(
              batch,
              doc(db, 'albums', albId),
              albId,
              albumSnapsMap.get(albId),
              ownerUid,
              { hasUnpublishedChanges: true },
              updatedCatalog
            );
          }
        }
      }

      await batch.commit();
    }

    return {
      codigo: cleanCodigo,
      nombre: cleanNombre,
      descripcion: cleanDesc,
      ...cleanColors,
      activa: isDefaultCode ? true : Boolean(input.activa),
      esPredeterminada: Boolean(input.esPredeterminada || isDefaultCode),
      ownerUid
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Ya existe una paleta') ||
        error.message.includes('HEX') ||
        error.message.includes('nombre válido'))
    ) {
      throw error;
    }
    handleFirestoreError(
      error,
      options.mode === 'create' ? OperationType.CREATE : OperationType.UPDATE,
      path
    );
  }
}

export async function deleteColorPalette(
  paletteCode: string,
  assignedAlbumIds: string[],
  allAlbumIds: string[] = []
): Promise<void> {
  if (paletteCode === DEFAULT_PALETTE_CODE) {
    throw new Error(
      'La paleta predeterminada del sistema no puede eliminarse.'
    );
  }

  const path = `palettes/${paletteCode}`;
  const fallbackUid = getCurrentUidFallback();
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'palettes', paletteCode));

    const touchedAlbums = new Set<string>();
    const albumIdsToScan = Array.from(
      new Set([...allAlbumIds, ...assignedAlbumIds])
    );

    const albumSnapsMap = new Map<string, Record<string, unknown> | undefined>();
    await Promise.all(
      albumIdsToScan.map(async (albId) => {
        const snap = await getDoc(doc(db, 'albums', albId));
        if (snap.exists()) {
          albumSnapsMap.set(albId, snap.data());
        }
      })
    );

    // Reasignar los álbumes afectados a la paleta predeterminada sin alterar fotos, videos ni alumnos
    assignedAlbumIds.forEach((albumId) => {
      touchedAlbums.add(albumId);
      batchAlbumUpdateOrRepair(
        batch,
        doc(db, 'albums', albumId),
        albumId,
        albumSnapsMap.get(albumId),
        fallbackUid,
        {
          paleta: DEFAULT_PALETTE_CODE,
          paletaConfig: DEFAULT_PALETTE_COLORS,
          hasUnpublishedChanges: true
        }
      );
    });

    // Limpiar asignación individual en alumnos que usaban esta paleta para que hereden la del álbum
    for (const albId of albumIdsToScan) {
      const studentSnap = await getDocs(
        query(
          collection(db, 'albums', albId, 'students'),
          where('paleta', '==', paletteCode)
        )
      );
      if (!studentSnap.empty) {
        studentSnap.docs.forEach((sd) => {
          batch.set(
            sd.ref,
            buildNormalizedStudentPayload(albId, sd.id, sd.data(), fallbackUid, {
              clearPaleta: true
            })
          );
        });
        if (!touchedAlbums.has(albId)) {
          touchedAlbums.add(albId);
          batchAlbumUpdateOrRepair(
            batch,
            doc(db, 'albums', albId),
            albId,
            albumSnapsMap.get(albId),
            fallbackUid,
            { hasUnpublishedChanges: true }
          );
        }
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function assignPaletteTargets(
  albumId: string,
  palette: ColorPalette,
  target:
    | { scope: 'album' }
    | { scope: 'students'; studentIds: string[] }
): Promise<void> {
  let currentPath = `albums/${albumId}`;
  const cleanCode = slugify(
    palette.codigo,
    BLUEPRINT_LIMITS.PALETTE_CODE_MIN
  ).slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX);
  const cleanColors = sanitizePaletteColors(palette);
  const fallbackUid = getCurrentUidFallback();

  try {
    if (target.scope === 'students' && target.studentIds.length === 0) {
      throw new Error(
        'Selecciona al menos una alumna o alumno para aplicar esta paleta.'
      );
    }

    const catalog = await fetchPalettesCatalogSafe();
    const albumRef = doc(db, 'albums', albumId);
    const albumSnap = await getDoc(albumRef);
    const existingAlbumData = albumSnap.exists() ? albumSnap.data() : undefined;

    if (target.scope === 'album') {
      await writeAlbumUpdateOrRepair(
        albumRef,
        albumId,
        existingAlbumData,
        fallbackUid,
        {
          paleta: cleanCode,
          paletaConfig: cleanColors,
          hasUnpublishedChanges: true
        },
        catalog
      );
    } else {
      const uniqueStudentIds = Array.from(new Set(target.studentIds));
      const studentSnaps = await Promise.all(
        uniqueStudentIds.map((studentId) =>
          getDoc(doc(db, 'albums', albumId, 'students', studentId))
        )
      );
      const validSnaps = studentSnaps.filter((s) => s.exists());
      const CHUNK_SIZE = 12;

      currentPath = `albums/${albumId}/students`;
      for (let i = 0; i < validSnaps.length; i += CHUNK_SIZE) {
        const chunk = validSnaps.slice(i, i + CHUNK_SIZE);
        const stBatch = writeBatch(db);
        chunk.forEach((stSnap) => {
          stBatch.set(
            stSnap.ref,
            buildNormalizedStudentPayload(
              albumId,
              stSnap.id,
              stSnap.data(),
              fallbackUid,
              {
                paleta: cleanCode,
                paletaConfig: cleanColors,
                paletaOverride: cleanColors
              },
              catalog
            )
          );
        });
        await stBatch.commit();
      }

      currentPath = `albums/${albumId}`;
      await writeAlbumUpdateOrRepair(
        albumRef,
        albumId,
        existingAlbumData,
        fallbackUid,
        {
          hasUnpublishedChanges: true
        },
        catalog
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Selecciona al menos')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, currentPath);
  }
}

export async function clearStudentPaletteOverride(
  albumId: string,
  studentId: string
): Promise<void> {
  const path = `albums/${albumId}/students/${studentId}`;
  const fallbackUid = getCurrentUidFallback();
  try {
    const albumRef = doc(db, 'albums', albumId);
    const studentRef = doc(db, 'albums', albumId, 'students', studentId);
    const [albumSnap, studentSnap, catalog] = await Promise.all([
      getDoc(albumRef),
      getDoc(studentRef),
      fetchPalettesCatalogSafe()
    ]);

    const batch = writeBatch(db);
    if (studentSnap.exists()) {
      batch.set(
        studentRef,
        buildNormalizedStudentPayload(
          albumId,
          studentId,
          studentSnap.data(),
          fallbackUid,
          { clearPaleta: true },
          catalog
        )
      );
    }
    batchAlbumUpdateOrRepair(
      batch,
      albumRef,
      albumId,
      albumSnap.exists() ? albumSnap.data() : undefined,
      fallbackUid,
      { hasUnpublishedChanges: true },
      catalog
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function seedDefaultAlbum(ownerUid: string): Promise<string> {
  const seed = DEFAULT_SEED_ALBUM;
  const path = `albums/${seed.id}`;
  const generalToken = generateAccessToken();
  const sanitizedFotos = seed.fotos.map(sanitizeFotoItem);
  const sanitizedVideos = seed.videos.map(sanitizeVideoItem);

  try {
    const batch = writeBatch(db);
    const albumRef = doc(db, 'albums', seed.id);

    batch.set(albumRef, {
      slug: seed.slug,
      colegio: seed.colegio,
      promocion: seed.promocion,
      nivel: seed.nivel,
      anio: seed.anio,
      paleta: seed.paleta,
      paletaConfig: seed.paletaConfig,
      portadaUrl: seed.portadaUrl,
      musicaUrl: seed.musicaUrl,
      whatsappTexto: seed.whatsappTexto,
      tutoraTitulo: seed.tutoraTitulo,
      tutoraNombre: seed.tutoraNombre,
      tutoraCargo: seed.tutoraCargo,
      tutoraFotoUrl: seed.tutoraFotoUrl,
      tutoraTexto: seed.tutoraTexto,
      fotos: sanitizedFotos,
      videos: sanitizedVideos,
      allowGroupAnuario: false,
      generalShareEnabled: false,
      generalAccessToken: generalToken,
      generalTokenRevoked: false,
      status: 'publicado',
      ownerUid,
      hasUnpublishedChanges: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    seed.alumnos.forEach((student, idx) => {
      const studentToken = generateAccessToken();
      const draftStudentRef = doc(
        db,
        'albums',
        seed.id,
        'students',
        student.id
      );
      batch.set(draftStudentRef, {
        albumId: seed.id,
        slug: student.slug,
        nombre: student.nombre,
        frase: student.frase,
        fotoUrl: student.fotoUrl,
        parentPhone: student.parentPhone,
        accessToken: studentToken,
        tokenRevoked: false,
        status: 'publicado',
        order: idx,
        ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const accessRef = doc(db, 'albumAccess', studentToken);
      batch.set(accessRef, {
        albumId: seed.id,
        scope: 'student',
        albumStatus: 'publicado',
        studentStatus: 'publicado',
        revoked: false,
        colegio: seed.colegio,
        promocion: seed.promocion,
        nivel: seed.nivel,
        anio: seed.anio,
        paleta: seed.paleta,
        paletaConfig: seed.paletaConfig,
        portadaUrl: seed.portadaUrl,
        musicaUrl: seed.musicaUrl,
        tutoraTitulo: seed.tutoraTitulo,
        tutoraNombre: seed.tutoraNombre,
        tutoraCargo: seed.tutoraCargo,
        tutoraFotoUrl: seed.tutoraFotoUrl,
        tutoraTexto: seed.tutoraTexto,
        fotos: sanitizedFotos,
        videos: sanitizedVideos,
        student: {
          nombre: student.nombre,
          frase: student.frase,
          fotoUrl: student.fotoUrl
        },
        anuario: [],
        publishedBy: ownerUid,
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
    return seed.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createDraftAlbum(
  ownerUid: string,
  input: {
    colegio: string;
    promocion: string;
    nivel: DraftAlbum['nivel'];
    anio: string;
    paleta: DraftAlbum['paleta'];
    paletaConfig?: PaletteColors;
    slug?: string;
  }
): Promise<string> {
  const baseSlug = slugify(
    input.slug || `${input.colegio}-${input.anio}`,
    BLUEPRINT_LIMITS.ALBUM_SLUG_MIN
  );
  const uniqueSuffix = Math.random().toString(36).slice(2, 5);
  const albumId = `${baseSlug}-${uniqueSuffix}`.slice(
    0,
    BLUEPRINT_LIMITS.SLUG_MAX
  );
  const finalSlug = input.slug ? slugify(input.slug, 3) : albumId;
  const anio = BLUEPRINT_LIMITS.ANIO_REGEX.test(input.anio)
    ? input.anio
    : '2026';
  const resolvedPaleta = resolveAlbumPalette(
    input.paleta,
    input.paletaConfig
  );

  const path = `albums/${albumId}`;
  try {
    await setDoc(doc(db, 'albums', albumId), {
      slug: finalSlug,
      colegio:
        clampStr(input.colegio, BLUEPRINT_LIMITS.COLEGIO_MAX) ||
        'Nuevo Colegio',
      promocion:
        clampStr(input.promocion, BLUEPRINT_LIMITS.PROMOCION_MAX) ||
        `Promoción ${anio}`,
      nivel: input.nivel,
      anio,
      paleta: resolvedPaleta.codigo,
      paletaConfig: resolvedPaleta.colors,
      portadaUrl: '/src/assets/images/hero_promocion_1795554401911.jpg',
      musicaUrl: '',
      whatsappTexto:
        '¡Hola familia de {alumno}! Les compartimos el Álbum Digital privado de la {promocion} ({colegio}). Ábrelo aquí: {link}',
      tutoraTitulo: 'Un recuerdo para toda la vida',
      tutoraNombre: 'Docente Tutor(a)',
      tutoraCargo: `Tutor(a) de ${input.nivel}`,
      tutoraFotoUrl: '/src/assets/images/retrato_tutora_1795554405296.jpg',
      tutoraTexto:
        'Con mucho cariño presentamos los mejores momentos de este año escolar.',
      fotos: DEFAULT_SEED_ALBUM.fotos.slice(0, 3).map(sanitizeFotoItem),
      videos: [],
      allowGroupAnuario: false,
      generalShareEnabled: false,
      generalAccessToken: generateAccessToken(),
      generalTokenRevoked: false,
      status: 'borrador',
      ownerUid,
      hasUnpublishedChanges: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return albumId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateDraftAlbum(
  albumId: string,
  patch: Partial<
    Omit<DraftAlbum, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>
  >
): Promise<void> {
  const path = `albums/${albumId}`;
  const overrides: Record<string, unknown> = {
    hasUnpublishedChanges:
      patch.hasUnpublishedChanges !== undefined
        ? patch.hasUnpublishedChanges
        : true
  };

  if (patch.slug !== undefined) {
    overrides.slug = slugify(patch.slug, BLUEPRINT_LIMITS.ALBUM_SLUG_MIN);
  }
  if (patch.colegio !== undefined) {
    overrides.colegio =
      clampStr(patch.colegio, BLUEPRINT_LIMITS.COLEGIO_MAX) || 'Colegio';
  }
  if (patch.promocion !== undefined) {
    overrides.promocion =
      clampStr(patch.promocion, BLUEPRINT_LIMITS.PROMOCION_MAX) || 'Promoción';
  }
  if (patch.nivel !== undefined) overrides.nivel = patch.nivel;
  if (patch.anio !== undefined) {
    overrides.anio = BLUEPRINT_LIMITS.ANIO_REGEX.test(patch.anio)
      ? patch.anio
      : '2026';
  }
  if (patch.paleta !== undefined) {
    overrides.paleta = slugify(
      patch.paleta,
      BLUEPRINT_LIMITS.PALETTE_CODE_MIN
    ).slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX);
  }
  if (patch.paletaConfig !== undefined) {
    overrides.paletaConfig = sanitizePaletteColors(patch.paletaConfig);
  }
  if (patch.portadaUrl !== undefined) {
    overrides.portadaUrl = clampStr(patch.portadaUrl, BLUEPRINT_LIMITS.URL_MAX);
  }
  if (patch.musicaUrl !== undefined) {
    overrides.musicaUrl = clampStr(patch.musicaUrl, BLUEPRINT_LIMITS.URL_MAX);
  }
  if (patch.whatsappTexto !== undefined) {
    overrides.whatsappTexto = clampStr(
      patch.whatsappTexto,
      BLUEPRINT_LIMITS.WHATSAPP_MAX
    );
  }
  if (patch.tutoraTitulo !== undefined) {
    overrides.tutoraTitulo = clampStr(
      patch.tutoraTitulo,
      BLUEPRINT_LIMITS.TUTORA_TITULO_MAX
    );
  }
  if (patch.tutoraNombre !== undefined) {
    overrides.tutoraNombre = clampStr(
      patch.tutoraNombre,
      BLUEPRINT_LIMITS.TUTORA_NOMBRE_MAX
    );
  }
  if (patch.tutoraCargo !== undefined) {
    overrides.tutoraCargo = clampStr(
      patch.tutoraCargo,
      BLUEPRINT_LIMITS.TUTORA_CARGO_MAX
    );
  }
  if (patch.tutoraFotoUrl !== undefined) {
    overrides.tutoraFotoUrl = clampStr(
      patch.tutoraFotoUrl,
      BLUEPRINT_LIMITS.URL_MAX
    );
  }
  if (patch.tutoraTexto !== undefined) {
    overrides.tutoraTexto = clampStr(
      patch.tutoraTexto,
      BLUEPRINT_LIMITS.TUTORA_TEXTO_MAX
    );
  }
  if (patch.fotos !== undefined) {
    overrides.fotos = patch.fotos
      .slice(0, BLUEPRINT_LIMITS.FOTOS_MAX)
      .map(sanitizeFotoItem);
  }
  if (patch.videos !== undefined) {
    overrides.videos = patch.videos
      .slice(0, BLUEPRINT_LIMITS.VIDEOS_MAX)
      .map(sanitizeVideoItem);
  }
  if (patch.allowGroupAnuario !== undefined) {
    overrides.allowGroupAnuario = Boolean(patch.allowGroupAnuario);
  }
  if (patch.generalShareEnabled !== undefined) {
    overrides.generalShareEnabled = Boolean(patch.generalShareEnabled);
  }
  if (patch.generalAccessToken !== undefined) {
    overrides.generalAccessToken = isValidAccessToken(patch.generalAccessToken)
      ? patch.generalAccessToken
      : '';
  }
  if (patch.generalTokenRevoked !== undefined) {
    overrides.generalTokenRevoked = Boolean(patch.generalTokenRevoked);
  }
  if (patch.status !== undefined) overrides.status = patch.status;
  overrides.updatedAt = serverTimestamp();
  try {
    const albumRef = doc(db, 'albums', albumId);
    const [albumSnap, catalog] = await Promise.all([
      getDoc(albumRef),
      fetchPalettesCatalogSafe()
    ]);
    await writeAlbumUpdateOrRepair(
      albumRef,
      albumId,
      albumSnap.exists() ? albumSnap.data() : undefined,
      getCurrentUidFallback(),
      overrides,
      catalog
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function arePaletaOverridesEqual(
  a: string | PaletteColors | undefined | null,
  b: string | PaletteColors | undefined | null
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return (
      a.colorPrincipal.toLowerCase() === b.colorPrincipal.toLowerCase() &&
      a.colorSecundario.toLowerCase() === b.colorSecundario.toLowerCase() &&
      a.colorAcento.toLowerCase() === b.colorAcento.toLowerCase() &&
      a.colorTexto.toLowerCase() === b.colorTexto.toLowerCase()
    );
  }
  return false;
}

export async function upsertDraftStudent(
  albumId: string,
  ownerUid: string,
  studentId: string | null,
  input: {
    nombre: string;
    slug?: string;
    frase: string;
    fotoUrl: string;
    parentPhone: string;
    paleta?: string | null;
    paletaConfig?: PaletteColors;
    paletaOverride?: string | PaletteColors | null;
    accessToken?: string;
    tokenRevoked?: boolean;
    status: PublishStatus;
    order: number;
  }
): Promise<string> {
  const cleanNombre =
    clampStr(input.nombre, BLUEPRINT_LIMITS.STUDENT_NAME_MAX) || 'Alumno';
  const cleanSlug = slugify(
    input.slug || cleanNombre,
    BLUEPRINT_LIMITS.STUDENT_SLUG_MIN
  );
  const targetId =
    studentId ||
    `${cleanSlug}-${Math.random().toString(36).slice(2, 5)}`.slice(0, 120);
  const path = `albums/${albumId}/students/${targetId}`;
  const safeToken = isValidAccessToken(input.accessToken)
    ? (input.accessToken as string)
    : generateAccessToken();

  try {
    const batch = writeBatch(db);
    const studentRef = doc(db, 'albums', albumId, 'students', targetId);
    const albumRef = doc(db, 'albums', albumId);
    const [albumSnap, existingStudentSnap, catalog] = await Promise.all([
      getDoc(albumRef),
      studentId ? getDoc(studentRef) : Promise.resolve(null),
      fetchPalettesCatalogSafe()
    ]);

    const existingStudentData = existingStudentSnap?.exists()
      ? existingStudentSnap.data()
      : undefined;
    const previousPaletaOverride = parsePaletaOverride(
      existingStudentData?.paletaOverride
    );

    const safeOrder = Math.max(
      0,
      Math.min(BLUEPRINT_LIMITS.ORDER_MAX, Number(input.order) || 0)
    );

    const candidate = {
      paleta: input.paleta,
      paletaConfig: input.paletaConfig,
      paletaOverride: input.paletaOverride
    };
    const isCustom = hasStudentCustomPalette(candidate);
    const resolvedStudentPalette = isCustom
      ? resolveStudentEffectivePalette(
          { paleta: DEFAULT_PALETTE_CODE, paletaConfig: DEFAULT_PALETTE_COLORS },
          candidate,
          catalog
        )
      : null;

    const normalizedInputOverride = parsePaletaOverride(input.paletaOverride);
    const computedOverrideValue =
      resolvedStudentPalette && resolvedStudentPalette.isStudentCustom
        ? typeof normalizedInputOverride === 'string'
          ? slugify(
              normalizedInputOverride,
              BLUEPRINT_LIMITS.PALETTE_CODE_MIN
            ).slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX)
          : resolvedStudentPalette.colors
        : undefined;

    let writtenStudentPayload: Record<string, unknown>;

    if (studentId) {
      const overrides: Record<string, unknown> & { clearPaleta?: boolean } = {
        slug: cleanSlug,
        nombre: cleanNombre,
        frase: clampStr(input.frase, BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
        fotoUrl: clampStr(input.fotoUrl, BLUEPRINT_LIMITS.URL_MAX),
        parentPhone: clampStr(
          input.parentPhone,
          BLUEPRINT_LIMITS.PARENT_PHONE_MAX
        ),
        accessToken: safeToken,
        tokenRevoked: Boolean(input.tokenRevoked),
        status: input.status,
        order: safeOrder
      };

      const explicitOverrideClear =
        input.paletaOverride === null || input.paletaOverride === '';
      const legacyPaletteClear =
        input.paletaOverride === undefined &&
        (input.paleta === null || input.paleta === '') &&
        !previousPaletaOverride;

      if (resolvedStudentPalette && resolvedStudentPalette.isStudentCustom) {
        overrides.paleta = resolvedStudentPalette.codigo;
        overrides.paletaConfig = resolvedStudentPalette.colors;
        overrides.paletaOverride = computedOverrideValue;
      } else if (explicitOverrideClear || legacyPaletteClear) {
        overrides.clearPaleta = true;
      }

      writtenStudentPayload = buildNormalizedStudentPayload(
        albumId,
        targetId,
        existingStudentData,
        ownerUid,
        overrides,
        catalog
      );
      batch.set(studentRef, writtenStudentPayload);
    } else {
      const createPayload: Record<string, unknown> = {
        albumId,
        slug: cleanSlug,
        nombre: cleanNombre,
        frase: clampStr(input.frase, BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
        fotoUrl: clampStr(input.fotoUrl, BLUEPRINT_LIMITS.URL_MAX),
        parentPhone: clampStr(
          input.parentPhone,
          BLUEPRINT_LIMITS.PARENT_PHONE_MAX
        ),
        accessToken: safeToken,
        tokenRevoked: Boolean(input.tokenRevoked),
        status: input.status,
        order: safeOrder,
        ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (resolvedStudentPalette && resolvedStudentPalette.isStudentCustom) {
        createPayload.paleta = slugify(
          resolvedStudentPalette.codigo,
          BLUEPRINT_LIMITS.PALETTE_CODE_MIN
        ).slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX);
        createPayload.paletaConfig = resolvedStudentPalette.colors;
        createPayload.paletaOverride = computedOverrideValue;
      }
      writtenStudentPayload = createPayload;
      batch.set(studentRef, createPayload);
    }

    batchAlbumUpdateOrRepair(
      batch,
      albumRef,
      albumId,
      albumSnap.exists() ? albumSnap.data() : undefined,
      ownerUid,
      { hasUnpublishedChanges: true },
      catalog
    );

    await batch.commit();

    // Verificación y log de depuración tras persistir en Firestore
    try {
      const persistedSnap = await getDoc(studentRef);
      const persistedData = persistedSnap.exists()
        ? persistedSnap.data()
        : undefined;
      const expectedOverride = parsePaletaOverride(
        writtenStudentPayload.paletaOverride
      );
      const persistedOverride = parsePaletaOverride(
        persistedData?.paletaOverride
      );
      const isExpectedClear =
        input.paletaOverride === null ||
        input.paletaOverride === '' ||
        (input.paletaOverride === undefined &&
          (input.paleta === null || input.paleta === '') &&
          !previousPaletaOverride);
      const persistedIntact = arePaletaOverridesEqual(
        expectedOverride,
        persistedOverride
      );
      const preservedAcrossNonPaletteUpdate =
        !isExpectedClear && previousPaletaOverride !== undefined
          ? arePaletaOverridesEqual(previousPaletaOverride, persistedOverride)
          : true;

      const debugDetails = {
        albumId,
        studentId: targetId,
        mode: studentId ? 'update' : 'create',
        previousPaletaOverride: previousPaletaOverride ?? null,
        inputPaletaOverride:
          input.paletaOverride === undefined ? '(omitido)' : input.paletaOverride,
        writtenPaletaOverride: expectedOverride ?? null,
        persistedPaletaOverride: persistedOverride ?? null,
        persistedIntact,
        preservedAcrossNonPaletteUpdate
      };

      if (!persistedIntact || !preservedAcrossNonPaletteUpdate) {
        console.error(
          '[upsertDraftStudent][paletaOverride] ALERTA: discrepancia o pérdida al persistir paletaOverride en Firestore',
          debugDetails
        );
      } else {
        console.info(
          '[upsertDraftStudent][paletaOverride] Persistencia verificada en Firestore',
          debugDetails
        );
      }
    } catch (verifyError) {
      console.warn(
        '[upsertDraftStudent][paletaOverride] No se pudo re-leer el documento para log de depuración:',
        verifyError
      );
    }

    return targetId;
  } catch (error) {
    handleFirestoreError(
      error,
      studentId ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

/**
 * Función de prueba determinista para verificar que `paletaOverride` se construye
 * íntegramente y no se sobrescribe ni se limpia accidentalmente ante actualizaciones
 * posteriores de otros campos del `DraftStudent`.
 */
export function testStudentPaletaOverrideIntegrity(
  palettes: ColorPalette[] = DEFAULT_PALETTES
): {
  passed: boolean;
  steps: Array<{ name: string; passed: boolean; paletaOverride: unknown }>;
} {
  const customOverride: PaletteColors = {
    colorPrincipal: '#6e1d36',
    colorSecundario: '#f5ebe8',
    colorAcento: '#c4933b',
    colorTexto: '#26181d'
  };

  // Paso 1: Guardar paleta personalizada en paletaOverride
  const initialDoc = buildNormalizedStudentPayload(
    'album-test',
    'student-test',
    undefined,
    'admin-uid',
    {
      nombre: 'Valeria Sofía',
      frase: 'Recuerdo de promoción',
      paleta: 'gala-vino-marfil',
      paletaConfig: customOverride,
      paletaOverride: customOverride,
      status: 'publicado',
      order: 1
    },
    palettes
  );
  const step1Passed = arePaletaOverridesEqual(
    parsePaletaOverride(initialDoc.paletaOverride),
    customOverride
  );

  // Paso 2: Actualización de otros campos (nombre/frase/order) omitiendo paletaOverride (undefined)
  const afterMetadataUpdate = buildNormalizedStudentPayload(
    'album-test',
    'student-test',
    initialDoc,
    'admin-uid',
    {
      nombre: 'Valeria Sofía Paredes',
      frase: 'Frase actualizada sin tocar paleta',
      order: 4,
      paletaOverride: undefined,
      paleta: undefined,
      paletaConfig: undefined
    },
    palettes
  );
  const step2Passed = arePaletaOverridesEqual(
    parsePaletaOverride(afterMetadataUpdate.paletaOverride),
    customOverride
  );

  // Paso 3: Limpieza explícita al volver a paleta general del colegio
  const afterExplicitClear = buildNormalizedStudentPayload(
    'album-test',
    'student-test',
    afterMetadataUpdate,
    'admin-uid',
    {
      nombre: 'Valeria Sofía Paredes',
      clearPaleta: true
    },
    palettes
  );
  const step3Passed =
    afterExplicitClear.paletaOverride === undefined &&
    afterExplicitClear.paleta === undefined &&
    afterExplicitClear.paletaConfig === undefined;

  const steps = [
    {
      name: 'Persistencia íntegra inicial de paletaOverride',
      passed: step1Passed,
      paletaOverride: initialDoc.paletaOverride ?? null
    },
    {
      name: 'Preservación de paletaOverride ante actualización parcial de DraftStudent',
      passed: step2Passed,
      paletaOverride: afterMetadataUpdate.paletaOverride ?? null
    },
    {
      name: 'Limpieza controlada solo cuando se solicita explícitamente',
      passed: step3Passed,
      paletaOverride: afterExplicitClear.paletaOverride ?? null
    }
  ];

  return {
    passed: steps.every((s) => s.passed),
    steps
  };
}

export async function batchImportStudents(
  albumId: string,
  ownerUid: string,
  rawLines: string,
  startingOrder: number
): Promise<number> {
  const lines = rawLines
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 80);

  if (lines.length === 0) return 0;

  const path = `albums/${albumId}/students`;
  try {
    const batch = writeBatch(db);
    lines.forEach((line, idx) => {
      const parts = line.split('|').map((p) => p.trim());
      const nombre = clampStr(parts[0], BLUEPRINT_LIMITS.STUDENT_NAME_MAX);
      if (nombre.length < 2) return;
      const frase = clampStr(
        parts[1] || 'Recuerdo especial de nuestra promoción escolar.',
        BLUEPRINT_LIMITS.STUDENT_FRASE_MAX
      );
      const parentPhone = clampStr(
        parts[2] || '',
        BLUEPRINT_LIMITS.PARENT_PHONE_MAX
      );
      const cleanSlug = slugify(nombre, BLUEPRINT_LIMITS.STUDENT_SLUG_MIN);
      const studentId = `${cleanSlug}-${Math.random().toString(36).slice(2, 5)}`.slice(
        0,
        120
      );

      batch.set(doc(db, 'albums', albumId, 'students', studentId), {
        albumId,
        slug: cleanSlug,
        nombre,
        frase,
        fotoUrl: '/src/assets/images/alumno_1_1795554404726.jpg',
        parentPhone,
        accessToken: generateAccessToken(),
        tokenRevoked: false,
        status: 'publicado',
        order: Math.min(BLUEPRINT_LIMITS.ORDER_MAX, startingOrder + idx),
        ownerUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    const albumRef = doc(db, 'albums', albumId);
    const albumSnap = await getDoc(albumRef);
    batchAlbumUpdateOrRepair(
      batch,
      albumRef,
      albumId,
      albumSnap.exists() ? albumSnap.data() : undefined,
      ownerUid,
      { hasUnpublishedChanges: true }
    );

    await batch.commit();
    return lines.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncAnuarioEntries(
  albumId: string,
  ownerUid: string,
  existingStudents: DraftStudent[],
  entries: AnuarioDraftEntry[]
): Promise<void> {
  const path = `albums/${albumId}/students`;
  const existingMap = new Map(existingStudents.map((s) => [s.id, s]));
  const retainedIds = new Set(
    entries.map((e) => e.id).filter((id): id is string => Boolean(id))
  );

  try {
    const albumRef = doc(db, 'albums', albumId);
    const [albumSnap, currentStudentsSnap, catalog] = await Promise.all([
      getDoc(albumRef),
      getDocs(collection(db, 'albums', albumId, 'students')),
      fetchPalettesCatalogSafe()
    ]);
    const rawStudentDataMap = new Map(
      currentStudentsSnap.docs.map((d) => [d.id, d.data()])
    );

    const batch = writeBatch(db);

    // Eliminar alumnos quitados del anuario (y su token publicado si existe)
    existingStudents.forEach((st) => {
      if (!retainedIds.has(st.id)) {
        batch.delete(doc(db, 'albums', albumId, 'students', st.id));
        if (isValidAccessToken(st.accessToken)) {
          batch.delete(doc(db, 'albumAccess', st.accessToken));
        }
      }
    });

    entries.slice(0, 120).forEach((entry, idx) => {
      const cleanNombre =
        clampStr(entry.nombre, BLUEPRINT_LIMITS.STUDENT_NAME_MAX) || 'Egresado';
      const cleanFrase = clampStr(
        entry.frase,
        BLUEPRINT_LIMITS.STUDENT_FRASE_MAX
      );
      const cleanFotoUrl =
        clampStr(entry.fotoUrl, BLUEPRINT_LIMITS.URL_MAX) ||
        '/src/assets/images/alumno_1_1795554404726.jpg';
      const safeOrder = Math.max(0, Math.min(BLUEPRINT_LIMITS.ORDER_MAX, idx));

      const existing = entry.id ? existingMap.get(entry.id) : undefined;
      if (existing) {
        const safeToken = isValidAccessToken(existing.accessToken)
          ? existing.accessToken
          : generateAccessToken();
        batch.set(
          doc(db, 'albums', albumId, 'students', existing.id),
          buildNormalizedStudentPayload(
            albumId,
            existing.id,
            rawStudentDataMap.get(existing.id),
            ownerUid,
            {
              slug:
                existing.slug ||
                slugify(cleanNombre, BLUEPRINT_LIMITS.STUDENT_SLUG_MIN),
              nombre: cleanNombre,
              frase: cleanFrase,
              fotoUrl: cleanFotoUrl,
              parentPhone: existing.parentPhone || '',
              accessToken: safeToken,
              tokenRevoked: Boolean(existing.tokenRevoked),
              status: existing.status || 'publicado',
              order: safeOrder
            },
            catalog
          )
        );
      } else {
        const cleanSlug = slugify(cleanNombre, BLUEPRINT_LIMITS.STUDENT_SLUG_MIN);
        const studentId = `${cleanSlug}-${Math.random().toString(36).slice(2, 5)}`.slice(
          0,
          120
        );
        batch.set(doc(db, 'albums', albumId, 'students', studentId), {
          albumId,
          slug: cleanSlug,
          nombre: cleanNombre,
          frase: cleanFrase,
          fotoUrl: cleanFotoUrl,
          parentPhone: '',
          accessToken: generateAccessToken(),
          tokenRevoked: false,
          status: 'publicado',
          order: safeOrder,
          ownerUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    });

    batchAlbumUpdateOrRepair(
      batch,
      albumRef,
      albumId,
      albumSnap.exists() ? albumSnap.data() : undefined,
      ownerUid,
      { hasUnpublishedChanges: true },
      catalog
    );

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteDraftStudent(
  albumId: string,
  student: DraftStudent
): Promise<void> {
  const path = `albums/${albumId}/students/${student.id}`;
  try {
    const albumRef = doc(db, 'albums', albumId);
    const albumSnap = await getDoc(albumRef);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'albums', albumId, 'students', student.id));
    if (isValidAccessToken(student.accessToken)) {
      batch.delete(doc(db, 'albumAccess', student.accessToken));
    }
    batchAlbumUpdateOrRepair(
      batch,
      albumRef,
      albumId,
      albumSnap.exists() ? albumSnap.data() : undefined,
      getCurrentUidFallback(),
      { hasUnpublishedChanges: true }
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function setStudentTokenRevocation(
  album: DraftAlbum,
  student: DraftStudent,
  revoked: boolean,
  publisherUid: string
): Promise<void> {
  const path = `albums/${album.id}/students/${student.id}`;
  const validToken = isValidAccessToken(student.accessToken)
    ? student.accessToken
    : generateAccessToken();

  try {
    const studentRef = doc(db, 'albums', album.id, 'students', student.id);
    const [studentSnap, catalog] = await Promise.all([
      getDoc(studentRef),
      fetchPalettesCatalogSafe()
    ]);
    const batch = writeBatch(db);
    batch.set(
      studentRef,
      buildNormalizedStudentPayload(
        album.id,
        student.id,
        studentSnap.exists() ? studentSnap.data() : undefined,
        publisherUid,
        {
          accessToken: validToken,
          tokenRevoked: revoked
        },
        catalog
      )
    );

    if (isValidAccessToken(student.accessToken)) {
      const accessRef = doc(db, 'albumAccess', student.accessToken);
      const accessSnap = await getDoc(accessRef);
      if (accessSnap.exists()) {
        batch.update(accessRef, {
          revoked,
          publishedBy: publisherUid,
          updatedAt: serverTimestamp()
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function regenerateStudentToken(
  album: DraftAlbum,
  allStudents: DraftStudent[],
  targetStudent: DraftStudent,
  publisherUid: string
): Promise<string> {
  const newToken = generateAccessToken();
  const path = `albums/${album.id}/students/${targetStudent.id}`;

  try {
    const studentRef = doc(db, 'albums', album.id, 'students', targetStudent.id);
    const [studentSnap, catalog] = await Promise.all([
      getDoc(studentRef),
      fetchPalettesCatalogSafe()
    ]);
    const batch = writeBatch(db);
    batch.set(
      studentRef,
      buildNormalizedStudentPayload(
        album.id,
        targetStudent.id,
        studentSnap.exists() ? studentSnap.data() : undefined,
        publisherUid,
        {
          accessToken: newToken,
          tokenRevoked: false
        },
        catalog
      )
    );

    if (isValidAccessToken(targetStudent.accessToken)) {
      batch.delete(doc(db, 'albumAccess', targetStudent.accessToken));
    }

    if (album.status === 'publicado') {
      const anuarioCards: PublicStudentCard[] = album.allowGroupAnuario
        ? allStudents
            .filter((s) => s.status === 'publicado' && !s.tokenRevoked)
            .map((s) => ({
              nombre:
                clampStr(s.nombre, BLUEPRINT_LIMITS.STUDENT_NAME_MAX) ||
                'Egresado',
              frase: clampStr(s.frase, BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
              fotoUrl: clampStr(s.fotoUrl, BLUEPRINT_LIMITS.URL_MAX)
            }))
        : [];

      const catalog = await fetchPalettesCatalogSafe();
      const effectiveStudentPaleta = resolveStudentEffectivePalette(
        album,
        targetStudent,
        catalog
      );
      const rawColegio = clampStr(album.colegio, BLUEPRINT_LIMITS.COLEGIO_MAX);
      const rawPromocion = clampStr(
        album.promocion,
        BLUEPRINT_LIMITS.PROMOCION_MAX
      );
      const safeNivel =
        album.nivel === 'Inicial' ||
        album.nivel === 'Primaria' ||
        album.nivel === 'Secundaria'
          ? album.nivel
          : 'Primaria';
      const rawNombre = clampStr(
        targetStudent.nombre,
        BLUEPRINT_LIMITS.STUDENT_NAME_MAX
      );

      batch.set(doc(db, 'albumAccess', newToken), {
        albumId: album.id,
        scope: 'student',
        albumStatus: album.status,
        studentStatus: targetStudent.status,
        revoked: false,
        colegio: rawColegio.length >= 2 ? rawColegio : 'Colegio',
        promocion:
          rawPromocion.length >= 2 ? rawPromocion : 'Promoción Escolar',
        nivel: safeNivel,
        anio: BLUEPRINT_LIMITS.ANIO_REGEX.test(album.anio) ? album.anio : '2026',
        paleta: effectiveStudentPaleta.codigo,
        paletaConfig: effectiveStudentPaleta.colors,
        portadaUrl: clampStr(album.portadaUrl, BLUEPRINT_LIMITS.URL_MAX),
        musicaUrl: clampStr(album.musicaUrl, BLUEPRINT_LIMITS.URL_MAX),
        tutoraTitulo: clampStr(
          album.tutoraTitulo,
          BLUEPRINT_LIMITS.TUTORA_TITULO_MAX
        ),
        tutoraNombre: clampStr(
          album.tutoraNombre,
          BLUEPRINT_LIMITS.TUTORA_NOMBRE_MAX
        ),
        tutoraCargo: clampStr(
          album.tutoraCargo,
          BLUEPRINT_LIMITS.TUTORA_CARGO_MAX
        ),
        tutoraFotoUrl: clampStr(album.tutoraFotoUrl, BLUEPRINT_LIMITS.URL_MAX),
        tutoraTexto: clampStr(
          album.tutoraTexto,
          BLUEPRINT_LIMITS.TUTORA_TEXTO_MAX
        ),
        fotos: album.fotos
          .slice(0, BLUEPRINT_LIMITS.FOTOS_MAX)
          .map(sanitizeFotoItem),
        videos: album.videos
          .slice(0, BLUEPRINT_LIMITS.VIDEOS_MAX)
          .map(sanitizeVideoItem),
        student: {
          nombre: rawNombre.length >= 2 ? rawNombre : 'Egresado',
          frase: clampStr(
            targetStudent.frase,
            BLUEPRINT_LIMITS.STUDENT_FRASE_MAX
          ),
          fotoUrl: clampStr(targetStudent.fotoUrl, BLUEPRINT_LIMITS.URL_MAX)
        },
        anuario: anuarioCards,
        publishedBy: publisherUid,
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    return newToken;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function regenerateGeneralAlbumToken(
  album: DraftAlbum,
  students: DraftStudent[],
  publisherUid: string
): Promise<string> {
  const newToken = generateAccessToken();
  const oldToken = album.generalAccessToken;
  const path = `albums/${album.id}`;

  try {
    const albumRef = doc(db, 'albums', album.id);
    const albumSnap = await getDoc(albumRef);
    const batch = writeBatch(db);
    batchAlbumUpdateOrRepair(
      batch,
      albumRef,
      album.id,
      albumSnap.exists() ? albumSnap.data() : undefined,
      publisherUid,
      {
        generalAccessToken: newToken,
        generalTokenRevoked: false
      }
    );

    if (isValidAccessToken(oldToken)) {
      batch.delete(doc(db, 'albumAccess', oldToken));
    }

    if (album.status === 'publicado' && album.generalShareEnabled) {
      const anuarioCards: PublicStudentCard[] = album.allowGroupAnuario
        ? students
            .filter((s) => s.status === 'publicado' && !s.tokenRevoked)
            .map((s) => {
              const nm = clampStr(s.nombre, BLUEPRINT_LIMITS.STUDENT_NAME_MAX);
              return {
                nombre: nm.length >= 2 ? nm : 'Egresado',
                frase: clampStr(s.frase, BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
                fotoUrl: clampStr(s.fotoUrl, BLUEPRINT_LIMITS.URL_MAX)
              };
            })
        : [];
      const catalog = await fetchPalettesCatalogSafe();
      const resolvedPaleta = resolveAlbumPalette(
        album.paleta,
        album.paletaConfig,
        catalog
      );
      const rawColegio = clampStr(album.colegio, BLUEPRINT_LIMITS.COLEGIO_MAX);
      const rawPromocion = clampStr(
        album.promocion,
        BLUEPRINT_LIMITS.PROMOCION_MAX
      );
      const safeNivel =
        album.nivel === 'Inicial' ||
        album.nivel === 'Primaria' ||
        album.nivel === 'Secundaria'
          ? album.nivel
          : 'Primaria';

      batch.set(doc(db, 'albumAccess', newToken), {
        albumId: album.id,
        scope: 'album',
        albumStatus: album.status,
        studentStatus: album.status,
        revoked: false,
        colegio: rawColegio.length >= 2 ? rawColegio : 'Colegio',
        promocion:
          rawPromocion.length >= 2 ? rawPromocion : 'Promoción Escolar',
        nivel: safeNivel,
        anio: BLUEPRINT_LIMITS.ANIO_REGEX.test(album.anio) ? album.anio : '2026',
        paleta: resolvedPaleta.codigo,
        paletaConfig: resolvedPaleta.colors,
        portadaUrl: clampStr(album.portadaUrl, BLUEPRINT_LIMITS.URL_MAX),
        musicaUrl: clampStr(album.musicaUrl, BLUEPRINT_LIMITS.URL_MAX),
        tutoraTitulo: clampStr(
          album.tutoraTitulo,
          BLUEPRINT_LIMITS.TUTORA_TITULO_MAX
        ),
        tutoraNombre: clampStr(
          album.tutoraNombre,
          BLUEPRINT_LIMITS.TUTORA_NOMBRE_MAX
        ),
        tutoraCargo: clampStr(
          album.tutoraCargo,
          BLUEPRINT_LIMITS.TUTORA_CARGO_MAX
        ),
        tutoraFotoUrl: clampStr(album.tutoraFotoUrl, BLUEPRINT_LIMITS.URL_MAX),
        tutoraTexto: clampStr(
          album.tutoraTexto,
          BLUEPRINT_LIMITS.TUTORA_TEXTO_MAX
        ),
        fotos: album.fotos
          .slice(0, BLUEPRINT_LIMITS.FOTOS_MAX)
          .map(sanitizeFotoItem),
        videos: album.videos
          .slice(0, BLUEPRINT_LIMITS.VIDEOS_MAX)
          .map(sanitizeVideoItem),
        anuario: anuarioCards,
        publishedBy: publisherUid,
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();
    return newToken;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteDraftAlbum(albumId: string): Promise<void> {
  const path = `albums/${albumId}`;
  try {
    const draftStudentsSnap = await getDocs(
      collection(db, 'albums', albumId, 'students')
    );
    const accessSnap = await getDocs(
      query(collection(db, 'albumAccess'), where('albumId', '==', albumId))
    );

    const batch = writeBatch(db);
    draftStudentsSnap.docs.forEach((d) => batch.delete(d.ref));
    accessSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'albums', albumId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function inspectDraftAlbumPayloadAgainstRules(
  albumId: string,
  existingData: Record<string, unknown> | undefined,
  outgoingFields: Record<string, unknown> | undefined
): string {
  if (!outgoingFields) return 'sin-payload';
  const merged: Record<string, unknown> = {
    ...(existingData || {}),
    ...outgoingFields
  };
  const issues: string[] = [];
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(albumId)) issues.push('albumId');
  const slug = merged.slug;
  if (
    typeof slug !== 'string' ||
    slug.length < 3 ||
    slug.length > 80 ||
    !/^[a-z0-9-]+$/.test(slug)
  ) {
    issues.push(`slug(${String(slug)})`);
  }
  const colegio = merged.colegio;
  if (typeof colegio !== 'string' || colegio.length < 2 || colegio.length > 140) {
    issues.push(`colegio(len=${typeof colegio === 'string' ? colegio.length : 'no-str'})`);
  }
  const promocion = merged.promocion;
  if (typeof promocion !== 'string' || promocion.length < 2 || promocion.length > 140) {
    issues.push(`promocion(len=${typeof promocion === 'string' ? promocion.length : 'no-str'})`);
  }
  if (!['Inicial', 'Primaria', 'Secundaria'].includes(String(merged.nivel))) {
    issues.push(`nivel(${String(merged.nivel)})`);
  }
  if (typeof merged.anio !== 'string' || !/^[0-9]{4}$/.test(merged.anio)) {
    issues.push(`anio(${String(merged.anio)})`);
  }
  const paleta = merged.paleta;
  if (
    typeof paleta !== 'string' ||
    paleta.length < 3 ||
    paleta.length > 80 ||
    !/^[a-z0-9-]+$/.test(paleta)
  ) {
    issues.push(`paleta(${String(paleta)})`);
  }
  if ('paletaConfig' in merged && !isCompletePaletteColors(merged.paletaConfig as PaletteColors)) {
    issues.push('paletaConfig');
  }
  const urlFields = ['portadaUrl', 'musicaUrl', 'tutoraFotoUrl'];
  for (const f of urlFields) {
    if (f in merged && (typeof merged[f] !== 'string' || (merged[f] as string).length > 500)) {
      issues.push(f);
    }
  }
  if (Array.isArray(merged.fotos)) {
    if (merged.fotos.length > 60) issues.push(`fotos.len=${merged.fotos.length}`);
    if (merged.fotos.length > 0) {
      const f0 = merged.fotos[0] as Record<string, unknown>;
      const f0Keys = f0 && typeof f0 === 'object' ? Object.keys(f0) : [];
      const f0Allowed = new Set(['titulo', 'categoria', 'url', 'descargaUrl']);
      if (
        !f0 ||
        typeof f0 !== 'object' ||
        !['titulo', 'categoria', 'url'].every((k) => k in f0) ||
        f0Keys.some((k) => !f0Allowed.has(k)) ||
        typeof f0.titulo !== 'string' ||
        f0.titulo.length < 1 ||
        f0.titulo.length > 140 ||
        typeof f0.categoria !== 'string' ||
        f0.categoria.length < 1 ||
        f0.categoria.length > 40 ||
        typeof f0.url !== 'string' ||
        f0.url.length < 1 ||
        f0.url.length > 500 ||
        ('descargaUrl' in f0 && (typeof f0.descargaUrl !== 'string' || f0.descargaUrl.length > 500))
      ) {
        issues.push(`fotos[0](${f0Keys.join('|')})`);
      }
    }
  } else if ('fotos' in merged) {
    issues.push('fotos(no-list)');
  }
  if (Array.isArray(merged.videos)) {
    if (merged.videos.length > 20) issues.push(`videos.len=${merged.videos.length}`);
    if (merged.videos.length > 0) {
      const v0 = merged.videos[0] as Record<string, unknown>;
      const v0Keys = v0 && typeof v0 === 'object' ? Object.keys(v0) : [];
      const v0Allowed = new Set(['titulo', 'duracion', 'descripcion', 'portadaUrl', 'embedUrl']);
      if (
        !v0 ||
        typeof v0 !== 'object' ||
        !['titulo', 'duracion', 'embedUrl'].every((k) => k in v0) ||
        v0Keys.some((k) => !v0Allowed.has(k)) ||
        typeof v0.titulo !== 'string' ||
        v0.titulo.length < 1 ||
        v0.titulo.length > 160 ||
        typeof v0.duracion !== 'string' ||
        v0.duracion.length < 1 ||
        v0.duracion.length > 20 ||
        typeof v0.embedUrl !== 'string' ||
        v0.embedUrl.length < 1 ||
        v0.embedUrl.length > 500
      ) {
        issues.push(`videos[0](${v0Keys.join('|')})`);
      }
    }
  } else if ('videos' in merged) {
    issues.push('videos(no-list)');
  }
  const gt = merged.generalAccessToken;
  if ('generalAccessToken' in merged && (typeof gt !== 'string' || (gt !== '' && !/^[A-Za-z0-9_-]{32,64}$/.test(gt)))) {
    issues.push('generalAccessToken');
  }
  return issues.length === 0 ? 'reglaLocal=OK' : `reglaLocal=FALLO(${issues.join(';')})`;
}

function inspectAlbumAccessPayloadAgainstRules(
  token: string | undefined,
  payload: Record<string, unknown> | undefined
): string {
  if (!payload) return 'sin-payload-access';
  const issues: string[] = [];
  if (!token || !/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
    issues.push(`token(${String(token)})`);
  }
  const required = [
    'albumId',
    'scope',
    'albumStatus',
    'studentStatus',
    'revoked',
    'colegio',
    'promocion',
    'nivel',
    'anio',
    'paleta',
    'publishedBy',
    'updatedAt'
  ];
  const allowed = new Set([
    ...required,
    'paletaConfig',
    'portadaUrl',
    'musicaUrl',
    'tutoraTitulo',
    'tutoraNombre',
    'tutoraCargo',
    'tutoraFotoUrl',
    'tutoraTexto',
    'fotos',
    'videos',
    'student',
    'anuario'
  ]);
  for (const k of required) {
    if (!(k in payload)) issues.push(`falta(${k})`);
  }
  for (const k of Object.keys(payload)) {
    if (!allowed.has(k)) issues.push(`extra(${k})`);
  }
  if (
    typeof payload.albumId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.albumId)
  ) {
    issues.push(`albumId(${String(payload.albumId)})`);
  }
  if (!['student', 'album'].includes(String(payload.scope))) {
    issues.push(`scope(${String(payload.scope)})`);
  }
  if (!['borrador', 'publicado'].includes(String(payload.albumStatus))) {
    issues.push(`albumStatus(${String(payload.albumStatus)})`);
  }
  if (!['borrador', 'publicado'].includes(String(payload.studentStatus))) {
    issues.push(`studentStatus(${String(payload.studentStatus)})`);
  }
  if (typeof payload.revoked !== 'boolean') {
    issues.push('revoked(no-bool)');
  }
  if (
    typeof payload.colegio !== 'string' ||
    payload.colegio.length < 2 ||
    payload.colegio.length > 140
  ) {
    issues.push(`colegio(${String(payload.colegio).length})`);
  }
  if (
    typeof payload.promocion !== 'string' ||
    payload.promocion.length < 2 ||
    payload.promocion.length > 140
  ) {
    issues.push(`promocion(${String(payload.promocion).length})`);
  }
  if (!['Inicial', 'Primaria', 'Secundaria'].includes(String(payload.nivel))) {
    issues.push(`nivel(${String(payload.nivel)})`);
  }
  if (typeof payload.anio !== 'string' || !/^[0-9]{4}$/.test(payload.anio)) {
    issues.push(`anio(${String(payload.anio)})`);
  }
  if (
    typeof payload.paleta !== 'string' ||
    payload.paleta.length < 3 ||
    payload.paleta.length > 80 ||
    !/^[a-z0-9-]+$/.test(payload.paleta)
  ) {
    issues.push(`paleta(${String(payload.paleta)})`);
  }
  if (
    'paletaConfig' in payload &&
    !isCompletePaletteColors(payload.paletaConfig as PaletteColors)
  ) {
    issues.push('paletaConfig');
  }
  const maxLenMap: Array<[string, number]> = [
    ['portadaUrl', 500],
    ['musicaUrl', 500],
    ['tutoraTitulo', 160],
    ['tutoraNombre', 120],
    ['tutoraCargo', 120],
    ['tutoraFotoUrl', 500],
    ['tutoraTexto', 4000]
  ];
  for (const [field, maxLen] of maxLenMap) {
    if (
      field in payload &&
      (typeof payload[field] !== 'string' ||
        (payload[field] as string).length > maxLen)
    ) {
      issues.push(field);
    }
  }
  if ('fotos' in payload) {
    if (!Array.isArray(payload.fotos) || payload.fotos.length > 60) {
      issues.push('fotos');
    } else if (payload.fotos.length > 0) {
      const f0 = payload.fotos[0] as Record<string, unknown>;
      const f0Allowed = new Set(['titulo', 'categoria', 'url', 'descargaUrl']);
      if (
        !f0 ||
        typeof f0 !== 'object' ||
        !['titulo', 'categoria', 'url'].every((k) => k in f0) ||
        Object.keys(f0).some((k) => !f0Allowed.has(k)) ||
        typeof f0.titulo !== 'string' ||
        f0.titulo.length < 1 ||
        f0.titulo.length > 140 ||
        typeof f0.categoria !== 'string' ||
        f0.categoria.length < 1 ||
        f0.categoria.length > 40 ||
        typeof f0.url !== 'string' ||
        f0.url.length < 1 ||
        f0.url.length > 500 ||
        ('descargaUrl' in f0 &&
          (typeof f0.descargaUrl !== 'string' || f0.descargaUrl.length > 500))
      ) {
        issues.push('fotos[0]');
      }
    }
  }
  if ('videos' in payload) {
    if (!Array.isArray(payload.videos) || payload.videos.length > 20) {
      issues.push('videos');
    } else if (payload.videos.length > 0) {
      const v0 = payload.videos[0] as Record<string, unknown>;
      const v0Allowed = new Set([
        'titulo',
        'duracion',
        'descripcion',
        'portadaUrl',
        'embedUrl'
      ]);
      if (
        !v0 ||
        typeof v0 !== 'object' ||
        !['titulo', 'duracion', 'embedUrl'].every((k) => k in v0) ||
        Object.keys(v0).some((k) => !v0Allowed.has(k)) ||
        typeof v0.titulo !== 'string' ||
        v0.titulo.length < 1 ||
        v0.titulo.length > 160 ||
        typeof v0.duracion !== 'string' ||
        v0.duracion.length < 1 ||
        v0.duracion.length > 20 ||
        ('descripcion' in v0 &&
          (typeof v0.descripcion !== 'string' || v0.descripcion.length > 400)) ||
        ('portadaUrl' in v0 &&
          (typeof v0.portadaUrl !== 'string' || v0.portadaUrl.length > 500)) ||
        typeof v0.embedUrl !== 'string' ||
        v0.embedUrl.length < 1 ||
        v0.embedUrl.length > 500
      ) {
        issues.push('videos[0]');
      }
    }
  }
  const isValidCard = (card: unknown): boolean => {
    if (!card || typeof card !== 'object') return false;
    const c = card as Record<string, unknown>;
    const allowedCard = new Set(['nombre', 'frase', 'fotoUrl']);
    return (
      'nombre' in c &&
      Object.keys(c).every((k) => allowedCard.has(k)) &&
      typeof c.nombre === 'string' &&
      c.nombre.length >= 2 &&
      c.nombre.length <= 120 &&
      (!('frase' in c) || (typeof c.frase === 'string' && c.frase.length <= 400)) &&
      (!('fotoUrl' in c) ||
        (typeof c.fotoUrl === 'string' && c.fotoUrl.length <= 500))
    );
  };
  if ('student' in payload && !isValidCard(payload.student)) {
    issues.push('student');
  }
  if ('anuario' in payload) {
    if (!Array.isArray(payload.anuario) || payload.anuario.length > 120) {
      issues.push('anuario');
    } else if (payload.anuario.length > 0 && !isValidCard(payload.anuario[0])) {
      issues.push('anuario[0]');
    }
  }
  if (
    typeof payload.publishedBy !== 'string' ||
    payload.publishedBy.length < 1 ||
    payload.publishedBy.length > 128
  ) {
    issues.push('publishedBy');
  }
  return issues.length === 0
    ? 'reglaAccessLocal=OK'
    : `reglaAccessLocal=FALLO(${issues.join(';')})`;
}

function buildAlbumRuleDiagnosticSummary(
  albumId: string,
  step: string,
  writeMode: string,
  existingData: Record<string, unknown> | undefined,
  outgoingFields: Record<string, unknown> | undefined,
  accessTokenForDiag?: string
): string {
  if (!existingData && !step.startsWith('paso_3')) {
    return `paso=${step}, modo=${writeMode}, existing=no-encontrado`;
  }
  const keys = existingData ? Object.keys(existingData) : [];
  const unknownKeys = keys.filter((k) => !ALLOWED_DRAFT_ALBUM_KEYS.has(k));
  const hasOwner =
    Boolean(existingData) &&
    typeof existingData?.ownerUid === 'string' &&
    (existingData.ownerUid as string).length > 0;
  const hasCreatedAtTs = Boolean(
    existingData && isFirestoreTimestampLike(existingData.createdAt)
  );
  const localRuleCheck = step.startsWith('paso_3')
    ? inspectAlbumAccessPayloadAgainstRules(accessTokenForDiag, outgoingFields)
    : inspectDraftAlbumPayloadAgainstRules(albumId, existingData, outgoingFields);
  const parts = [
    `paso=${step}`,
    `modo=${writeMode}`,
    `ownerUid=${hasOwner ? String(existingData?.ownerUid) : 'falta'}`,
    `createdAtTs=${hasCreatedAtTs ? 'si' : 'no'}`,
    localRuleCheck
  ];
  if (unknownKeys.length > 0) {
    parts.push(`clavesExtra=${unknownKeys.join('|')}`);
  }
  return parts.join(', ');
}

export interface PublishSnapshotResult {
  albumDocSynced: boolean;
  syncedAccessCount: number;
  warning?: string;
}

export async function publishAlbumSnapshot(
  album: DraftAlbum,
  students: DraftStudent[],
  publisherUid: string,
  overrideStatus?: PublishStatus
): Promise<PublishSnapshotResult> {
  const effectiveStatus: PublishStatus = overrideStatus ?? album.status;
  const path = `albums/${album.id}`;
  let currentPath = path;
  let currentStep = 'paso_0_lectura_inicial';
  let writeMode = 'ninguno';
  let debugExistingAlbumData: Record<string, unknown> | undefined;
  let debugOutgoingFields: Record<string, unknown> | undefined;
  let debugAccessToken: string | undefined;

  try {
    const albumRef = doc(db, 'albums', album.id);
    const [albumSnap, liveStudentsSnap, catalog] = await Promise.all([
      getDocFromServer(albumRef).catch(() => getDoc(albumRef)),
      getDocs(
        query(
          collection(db, 'albums', album.id, 'students'),
          orderBy('order', 'asc')
        )
      ).catch(() => null),
      fetchPalettesCatalogSafe()
    ]);

    const existingAlbumData = albumSnap.exists() ? albumSnap.data() : undefined;
    debugExistingAlbumData = existingAlbumData;
    const rawStudentDataMap = new Map<string, Record<string, unknown>>();
    const authoritativeStudents: DraftStudent[] =
      liveStudentsSnap && !liveStudentsSnap.empty
        ? liveStudentsSnap.docs.map((d) => {
            const s = d.data();
            rawStudentDataMap.set(d.id, s);
            return {
              id: d.id,
              albumId: String(s.albumId || album.id),
              slug: String(s.slug || d.id),
              nombre: String(s.nombre || ''),
              frase: String(s.frase || ''),
              fotoUrl: String(s.fotoUrl || ''),
              parentPhone: String(s.parentPhone || ''),
              paleta:
                typeof s.paleta === 'string' && s.paleta.trim().length >= 3
                  ? s.paleta.trim()
                  : undefined,
              paletaConfig: parsePaletteConfig(s.paletaConfig),
              paletaOverride: parsePaletaOverride(s.paletaOverride),
              accessToken: String(s.accessToken || ''),
              tokenRevoked: Boolean(s.tokenRevoked),
              status: (s.status as PublishStatus) || 'publicado',
              order: typeof s.order === 'number' ? s.order : 0,
              ownerUid: String(s.ownerUid || ''),
              createdAt: s.createdAt,
              updatedAt: s.updatedAt
            };
          })
        : students;

    const effectiveAlbum: DraftAlbum = existingAlbumData
      ? {
          ...album,
          slug: String(existingAlbumData.slug || album.slug),
          colegio: String(existingAlbumData.colegio || album.colegio),
          promocion: String(existingAlbumData.promocion || album.promocion),
          nivel:
            existingAlbumData.nivel === 'Inicial' ||
            existingAlbumData.nivel === 'Primaria' ||
            existingAlbumData.nivel === 'Secundaria'
              ? existingAlbumData.nivel
              : album.nivel,
          anio: String(existingAlbumData.anio || album.anio),
          paleta:
            typeof existingAlbumData.paleta === 'string'
              ? existingAlbumData.paleta
              : album.paleta,
          paletaConfig:
            parsePaletteConfig(existingAlbumData.paletaConfig) ??
            album.paletaConfig,
          portadaUrl: String(existingAlbumData.portadaUrl ?? album.portadaUrl),
          musicaUrl: String(existingAlbumData.musicaUrl ?? album.musicaUrl),
          whatsappTexto: String(
            existingAlbumData.whatsappTexto ?? album.whatsappTexto
          ),
          tutoraTitulo: String(
            existingAlbumData.tutoraTitulo ?? album.tutoraTitulo
          ),
          tutoraNombre: String(
            existingAlbumData.tutoraNombre ?? album.tutoraNombre
          ),
          tutoraCargo: String(
            existingAlbumData.tutoraCargo ?? album.tutoraCargo
          ),
          tutoraFotoUrl: String(
            existingAlbumData.tutoraFotoUrl ?? album.tutoraFotoUrl
          ),
          tutoraTexto: String(
            existingAlbumData.tutoraTexto ?? album.tutoraTexto
          ),
          fotos: Array.isArray(existingAlbumData.fotos)
            ? existingAlbumData.fotos
            : album.fotos,
          videos: Array.isArray(existingAlbumData.videos)
            ? existingAlbumData.videos
            : album.videos,
          allowGroupAnuario: Boolean(existingAlbumData.allowGroupAnuario),
          generalShareEnabled: Boolean(existingAlbumData.generalShareEnabled),
          generalAccessToken: String(
            existingAlbumData.generalAccessToken || album.generalAccessToken || ''
          ),
          generalTokenRevoked: Boolean(existingAlbumData.generalTokenRevoked)
        }
      : album;

    const resolvedPaleta = resolveAlbumPalette(
      effectiveAlbum.paleta,
      effectiveAlbum.paletaConfig,
      catalog
    );
    const safeAlbumPaletaCode = slugify(
      resolvedPaleta.codigo,
      BLUEPRINT_LIMITS.PALETTE_CODE_MIN
    ).slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX);

    const rawColegio = clampStr(
      effectiveAlbum.colegio,
      BLUEPRINT_LIMITS.COLEGIO_MAX
    );
    const safeColegio = rawColegio.length >= 2 ? rawColegio : 'Colegio';
    const rawPromocion = clampStr(
      effectiveAlbum.promocion,
      BLUEPRINT_LIMITS.PROMOCION_MAX
    );
    const safePromocion =
      rawPromocion.length >= 2 ? rawPromocion : 'Promoción Escolar';
    const safeNivel =
      effectiveAlbum.nivel === 'Inicial' ||
      effectiveAlbum.nivel === 'Primaria' ||
      effectiveAlbum.nivel === 'Secundaria'
        ? effectiveAlbum.nivel
        : 'Primaria';
    const safeAnio = BLUEPRINT_LIMITS.ANIO_REGEX.test(effectiveAlbum.anio)
      ? effectiveAlbum.anio
      : '2026';

    const normalizePublicName = (name: string | undefined | null) => {
      const clamped = clampStr(name, BLUEPRINT_LIMITS.STUDENT_NAME_MAX);
      return clamped.length >= 2 ? clamped : 'Egresado';
    };

    const usedStudentTokens = new Set<string>();
    const preparedStudents = authoritativeStudents.map((st) => {
      let safeToken = isValidAccessToken(st.accessToken)
        ? st.accessToken
        : generateAccessToken();
      while (usedStudentTokens.has(safeToken)) {
        safeToken = generateAccessToken();
      }
      usedStudentTokens.add(safeToken);
      return {
        ...st,
        safeStatus: (st.status === 'borrador'
          ? 'borrador'
          : 'publicado') as PublishStatus,
        safeNombre: normalizePublicName(st.nombre),
        safeToken,
        needsTokenUpdate: safeToken !== st.accessToken
      };
    });

    let generalToken = isValidAccessToken(effectiveAlbum.generalAccessToken)
      ? effectiveAlbum.generalAccessToken
      : generateAccessToken();
    while (usedStudentTokens.has(generalToken)) {
      generalToken = generateAccessToken();
    }

    const sanitizedFotos = (Array.isArray(effectiveAlbum.fotos)
      ? effectiveAlbum.fotos
      : []
    )
      .filter((item): item is FotoItem => Boolean(item && typeof item === 'object'))
      .slice(0, BLUEPRINT_LIMITS.FOTOS_MAX)
      .map(sanitizeFotoItem);
    const sanitizedVideos = (Array.isArray(effectiveAlbum.videos)
      ? effectiveAlbum.videos
      : []
    )
      .filter((item): item is VideoItem => Boolean(item && typeof item === 'object'))
      .slice(0, BLUEPRINT_LIMITS.VIDEOS_MAX)
      .map(sanitizeVideoItem);

    // 1. Solo crear el documento padre /albums/{id} si NO existe todavía; si ya existe, no reescribir sus 24 campos antes de sincronizar /albumAccess
    if (!existingAlbumData) {
      currentStep = 'paso_1_album_borrador';
      currentPath = `albums/${album.id}`;
      const createPayload = buildNormalizedAlbumPayload(
        album.id,
        undefined,
        publisherUid,
        {
          slug: effectiveAlbum.slug,
          colegio: safeColegio,
          promocion: safePromocion,
          nivel: safeNivel,
          anio: safeAnio,
          paleta: safeAlbumPaletaCode,
          paletaConfig: resolvedPaleta.colors,
          portadaUrl: effectiveAlbum.portadaUrl,
          musicaUrl: effectiveAlbum.musicaUrl,
          whatsappTexto: effectiveAlbum.whatsappTexto,
          tutoraTitulo: effectiveAlbum.tutoraTitulo,
          tutoraNombre: effectiveAlbum.tutoraNombre,
          tutoraCargo: effectiveAlbum.tutoraCargo,
          tutoraFotoUrl: effectiveAlbum.tutoraFotoUrl,
          tutoraTexto: effectiveAlbum.tutoraTexto,
          fotos: sanitizedFotos,
          videos: sanitizedVideos,
          allowGroupAnuario: effectiveAlbum.allowGroupAnuario,
          generalShareEnabled: effectiveAlbum.generalShareEnabled,
          generalAccessToken: generalToken,
          generalTokenRevoked: effectiveAlbum.generalTokenRevoked,
          status: effectiveStatus,
          hasUnpublishedChanges: true
        },
        catalog
      );
      writeMode = 'setDoc';
      debugOutgoingFields = createPayload;
      await setDoc(albumRef, createPayload);
    }

    // 2. Asegurar tokens válidos en alumnos que todavía no tengan uno (lotes <= 5 para respetar límites de reglas Firestore)
    const CHUNK_SIZE = 5;
    const studentsNeedingToken = preparedStudents.filter(
      (st) => st.needsTokenUpdate
    );
    if (studentsNeedingToken.length > 0) {
      currentStep = 'paso_2_tokens_alumnos';
      currentPath = `albums/${album.id}/students`;
      writeMode = 'batch.set';
      if (rawStudentDataMap.size === 0) {
        const rawStudentsSnap = await getDocs(
          collection(db, 'albums', album.id, 'students')
        );
        rawStudentsSnap.docs.forEach((d) => rawStudentDataMap.set(d.id, d.data()));
      }
      for (let i = 0; i < studentsNeedingToken.length; i += CHUNK_SIZE) {
        const chunk = studentsNeedingToken.slice(i, i + CHUNK_SIZE);
        const stBatch = writeBatch(db);
        chunk.forEach((st) => {
          stBatch.set(
            doc(db, 'albums', album.id, 'students', st.id),
            buildNormalizedStudentPayload(
              album.id,
              st.id,
              rawStudentDataMap.get(st.id),
              publisherUid,
              {
                accessToken: st.safeToken,
                tokenRevoked: Boolean(st.tokenRevoked)
              },
              catalog
            )
          );
        });
        await stBatch.commit();
      }
    }

    // 3. Preparar operaciones de /albumAccess en lotes <= 5 para no exceder límites de exists()/get() en Firestore Rules
    currentStep = 'paso_3a_leer_album_access';
    currentPath = 'albumAccess';
    writeMode = 'getDocs';
    const existingTokensSnap = await getDocs(
      query(collection(db, 'albumAccess'), where('albumId', '==', album.id))
    );
    const existingAccessScopeByToken = new Map<string, string>();
    existingTokensSnap.docs.forEach((d) => {
      const sc = d.data()?.scope;
      if (typeof sc === 'string') {
        existingAccessScopeByToken.set(d.id, sc);
      }
    });

    const anuarioCards: PublicStudentCard[] = effectiveAlbum.allowGroupAnuario
      ? preparedStudents
          .filter((s) => s.safeStatus === 'publicado' && !s.tokenRevoked)
          .slice(0, 120)
          .map((s) => ({
            nombre: s.safeNombre,
            frase: clampStr(s.frase, BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
            fotoUrl: clampStr(s.fotoUrl, BLUEPRINT_LIMITS.URL_MAX)
          }))
      : [];

    const basePayload = {
      albumId: album.id,
      albumStatus: effectiveStatus,
      colegio: safeColegio,
      promocion: safePromocion,
      nivel: safeNivel,
      anio: safeAnio,
      paleta: safeAlbumPaletaCode,
      paletaConfig: resolvedPaleta.colors,
      portadaUrl: clampStr(effectiveAlbum.portadaUrl, BLUEPRINT_LIMITS.URL_MAX),
      musicaUrl: clampStr(effectiveAlbum.musicaUrl, BLUEPRINT_LIMITS.URL_MAX),
      tutoraTitulo: clampStr(
        effectiveAlbum.tutoraTitulo,
        BLUEPRINT_LIMITS.TUTORA_TITULO_MAX
      ),
      tutoraNombre: clampStr(
        effectiveAlbum.tutoraNombre,
        BLUEPRINT_LIMITS.TUTORA_NOMBRE_MAX
      ),
      tutoraCargo: clampStr(
        effectiveAlbum.tutoraCargo,
        BLUEPRINT_LIMITS.TUTORA_CARGO_MAX
      ),
      tutoraFotoUrl: clampStr(
        effectiveAlbum.tutoraFotoUrl,
        BLUEPRINT_LIMITS.URL_MAX
      ),
      tutoraTexto: clampStr(
        effectiveAlbum.tutoraTexto,
        BLUEPRINT_LIMITS.TUTORA_TEXTO_MAX
      ),
      fotos: sanitizedFotos,
      videos: sanitizedVideos,
      anuario: anuarioCards,
      publishedBy: publisherUid,
      updatedAt: serverTimestamp()
    };

    const activeTokens = new Set<string>();
    const accessWrites: Array<{
      token: string;
      needsRecreate: boolean;
      payload: Record<string, unknown>;
    }> = [];

    preparedStudents.forEach((st) => {
      if (effectiveStatus === 'publicado') {
        const studentPaleta = resolveStudentEffectivePalette(
          effectiveAlbum,
          st,
          catalog
        );
        const safeStudentPaletaCode = slugify(
          studentPaleta.codigo,
          BLUEPRINT_LIMITS.PALETTE_CODE_MIN
        ).slice(0, BLUEPRINT_LIMITS.PALETTE_CODE_MAX);
        activeTokens.add(st.safeToken);
        const prevScope = existingAccessScopeByToken.get(st.safeToken);
        accessWrites.push({
          token: st.safeToken,
          needsRecreate: Boolean(prevScope && prevScope !== 'student'),
          payload: {
            ...basePayload,
            paleta: safeStudentPaletaCode,
            paletaConfig: studentPaleta.colors,
            scope: 'student',
            studentStatus: st.safeStatus,
            revoked: Boolean(st.tokenRevoked),
            student: {
              nombre: st.safeNombre,
              frase: clampStr(st.frase, BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
              fotoUrl: clampStr(st.fotoUrl, BLUEPRINT_LIMITS.URL_MAX)
            }
          }
        });
      }
    });

    if (effectiveStatus === 'publicado' && effectiveAlbum.generalShareEnabled) {
      activeTokens.add(generalToken);
      const prevScope = existingAccessScopeByToken.get(generalToken);
      accessWrites.push({
        token: generalToken,
        needsRecreate: Boolean(prevScope && prevScope !== 'album'),
        payload: {
          ...basePayload,
          scope: 'album',
          studentStatus: 'publicado',
          revoked: Boolean(effectiveAlbum.generalTokenRevoked)
        }
      });
    }

    for (let i = 0; i < accessWrites.length; i += CHUNK_SIZE) {
      const chunk = accessWrites.slice(i, i + CHUNK_SIZE);
      const conflictItems = chunk.filter((item) => item.needsRecreate);
      if (conflictItems.length > 0) {
        currentStep = 'paso_3b_borrar_conflicto';
        writeMode = 'batch.delete';
        debugAccessToken = conflictItems[0]?.token;
        const delConflictBatch = writeBatch(db);
        conflictItems.forEach((item) => {
          delConflictBatch.delete(doc(db, 'albumAccess', item.token));
        });
        await delConflictBatch.commit();
      }
      currentStep = 'paso_3c_escribir_album_access';
      writeMode = 'batch.set';
      const diagTarget =
        chunk.find(
          (item) =>
            inspectAlbumAccessPayloadAgainstRules(item.token, item.payload) !==
            'reglaAccessLocal=OK'
        ) ?? chunk[0];
      debugAccessToken = diagTarget?.token;
      debugOutgoingFields = diagTarget?.payload;
      const accessBatch = writeBatch(db);
      chunk.forEach((item) => {
        accessBatch.set(doc(db, 'albumAccess', item.token), item.payload);
      });
      await accessBatch.commit();
    }

    // 4. Eliminar tokens huérfanos, deshabilitados o cuando el álbum pasa a borrador
    currentStep = 'paso_4_limpiar_huerfanos';
    writeMode = 'batch.delete';
    const orphanRefs = existingTokensSnap.docs
      .filter((d) => !activeTokens.has(d.id))
      .map((d) => d.ref);
    for (let i = 0; i < orphanRefs.length; i += CHUNK_SIZE) {
      const chunk = orphanRefs.slice(i, i + CHUNK_SIZE);
      const delBatch = writeBatch(db);
      chunk.forEach((ref) => delBatch.delete(ref));
      await delBatch.commit();
    }

    // 5. Confirmar estado con delta mínimo en /albums/{id}; si falla tras haber sincronizado /albumAccess, devolver aviso claro sin perder la publicación
    currentStep = 'paso_5_confirmar_publicacion';
    currentPath = `albums/${album.id}`;
    try {
      const latestAlbumSnap = existingAlbumData
        ? albumSnap
        : await getDocFromServer(albumRef).catch(() => getDoc(albumRef));
      const latestData = latestAlbumSnap.exists()
        ? latestAlbumSnap.data()
        : existingAlbumData;
      const needsTokenSave =
        !latestData || latestData.generalAccessToken !== generalToken;
      const minimalDelta: Record<string, unknown> = {
        status: effectiveStatus,
        hasUnpublishedChanges: false,
        updatedAt: serverTimestamp(),
        ...(needsTokenSave ? { generalAccessToken: generalToken } : {})
      };

      if (canSafelyUpdateExistingAlbum(latestData)) {
        writeMode = 'updateDoc-delta';
        debugOutgoingFields = minimalDelta;
        await updateDoc(albumRef, minimalDelta);
      } else {
        writeMode = 'setDoc';
        debugOutgoingFields = buildNormalizedAlbumPayload(
          album.id,
          latestData,
          publisherUid,
          {
            paleta: safeAlbumPaletaCode,
            paletaConfig: resolvedPaleta.colors,
            fotos: sanitizedFotos,
            videos: sanitizedVideos,
            generalAccessToken: generalToken,
            status: effectiveStatus,
            hasUnpublishedChanges: false
          },
          catalog
        );
        await writeAlbumUpdateOrRepair(
          albumRef,
          album.id,
          latestData,
          publisherUid,
          {
            paleta: safeAlbumPaletaCode,
            paletaConfig: resolvedPaleta.colors,
            fotos: sanitizedFotos,
            videos: sanitizedVideos,
            generalAccessToken: generalToken,
            status: effectiveStatus,
            hasUnpublishedChanges: false
          },
          catalog
        );
      }
      return {
        albumDocSynced: true,
        syncedAccessCount: accessWrites.length
      };
    } catch (step5Error) {
      const diag = buildAlbumRuleDiagnosticSummary(
        album.id,
        currentStep,
        writeMode,
        debugExistingAlbumData,
        debugOutgoingFields
      );
      console.warn('[publishAlbumSnapshot] Enlaces sincronizados, fallo delta final:', {
        diag,
        step5Error
      });
      const step5Msg =
        step5Error instanceof Error ? step5Error.message : String(step5Error);
      if (step5Msg.toLowerCase().includes('permission')) {
        return {
          albumDocSynced: false,
          syncedAccessCount: accessWrites.length,
          warning: `Los enlaces privados (${accessWrites.length}) ya quedaron sincronizados en Firestore, pero el documento padre (${currentPath}) rechazó la actualización de estado [${diag}]. Usa "Clonar en documento limpio" para migrar a un borrador sin restricciones.`
        };
      }
      throw step5Error;
    }
  } catch (error) {
    const diag = buildAlbumRuleDiagnosticSummary(
      album.id,
      currentStep,
      writeMode,
      debugExistingAlbumData,
      debugOutgoingFields,
      debugAccessToken
    );
    console.error('[publishAlbumSnapshot] Error detallado:', {
      step: currentStep,
      writeMode,
      path: currentPath,
      albumId: album.id,
      diag,
      error
    });
    const baseMsg = error instanceof Error ? error.message : String(error);
    const enrichedError = new Error(`${baseMsg} [${diag}]`);
    handleFirestoreError(enrichedError, OperationType.WRITE, currentPath);
  }
}

export async function cloneAndRepairAlbum(
  sourceAlbum: DraftAlbum,
  sourceStudents: DraftStudent[],
  publisherUid: string
): Promise<string> {
  const baseSlug = slugify(
    sourceAlbum.slug || sourceAlbum.colegio,
    BLUEPRINT_LIMITS.ALBUM_SLUG_MIN
  );
  const uniqueSuffix = Math.random().toString(36).slice(2, 6);
  const newAlbumId = `${baseSlug}-${uniqueSuffix}`.slice(
    0,
    BLUEPRINT_LIMITS.SLUG_MAX
  );
  let currentPath = `albums/${newAlbumId}`;

  try {
    const [catalog, liveStudentsSnap] = await Promise.all([
      fetchPalettesCatalogSafe(),
      getDocs(
        query(
          collection(db, 'albums', sourceAlbum.id, 'students'),
          orderBy('order', 'asc')
        )
      ).catch(() => null)
    ]);

    const authoritativeStudents: DraftStudent[] =
      liveStudentsSnap && !liveStudentsSnap.empty
        ? liveStudentsSnap.docs.map((d) => {
            const s = d.data();
            return {
              id: d.id,
              albumId: sourceAlbum.id,
              slug: String(s.slug || d.id),
              nombre: String(s.nombre || ''),
              frase: String(s.frase || ''),
              fotoUrl: String(s.fotoUrl || ''),
              parentPhone: String(s.parentPhone || ''),
              paleta:
                typeof s.paleta === 'string' && s.paleta.trim().length >= 3
                  ? s.paleta.trim()
                  : undefined,
              paletaConfig: parsePaletteConfig(s.paletaConfig),
              paletaOverride: parsePaletaOverride(s.paletaOverride),
              accessToken: String(s.accessToken || ''),
              tokenRevoked: Boolean(s.tokenRevoked),
              status: (s.status as PublishStatus) || 'publicado',
              order: typeof s.order === 'number' ? s.order : 0,
              ownerUid: publisherUid
            };
          })
        : sourceStudents;

    const newAlbumPayload = buildNormalizedAlbumPayload(
      newAlbumId,
      undefined,
      publisherUid,
      {
        slug: newAlbumId,
        colegio: sourceAlbum.colegio,
        promocion: sourceAlbum.promocion,
        nivel: sourceAlbum.nivel,
        anio: sourceAlbum.anio,
        paleta: sourceAlbum.paleta,
        paletaConfig: sourceAlbum.paletaConfig,
        portadaUrl: sourceAlbum.portadaUrl,
        musicaUrl: sourceAlbum.musicaUrl,
        whatsappTexto: sourceAlbum.whatsappTexto,
        tutoraTitulo: sourceAlbum.tutoraTitulo,
        tutoraNombre: sourceAlbum.tutoraNombre,
        tutoraCargo: sourceAlbum.tutoraCargo,
        tutoraFotoUrl: sourceAlbum.tutoraFotoUrl,
        tutoraTexto: sourceAlbum.tutoraTexto,
        fotos: sourceAlbum.fotos,
        videos: sourceAlbum.videos,
        allowGroupAnuario: sourceAlbum.allowGroupAnuario,
        generalShareEnabled: sourceAlbum.generalShareEnabled,
        generalAccessToken: generateAccessToken(),
        generalTokenRevoked: sourceAlbum.generalTokenRevoked,
        status: 'borrador',
        hasUnpublishedChanges: true
      },
      catalog
    );

    await setDoc(doc(db, 'albums', newAlbumId), newAlbumPayload);

    currentPath = `albums/${newAlbumId}/students`;
    const CHUNK_SIZE = 5;
    for (let i = 0; i < authoritativeStudents.length; i += CHUNK_SIZE) {
      const chunk = authoritativeStudents.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((st, idx) => {
        const cleanStudentId = `${slugify(
          st.slug || st.nombre,
          BLUEPRINT_LIMITS.STUDENT_SLUG_MIN
        )}-${Math.random().toString(36).slice(2, 5)}`.slice(0, 120);
        const studentPayload = buildNormalizedStudentPayload(
          newAlbumId,
          cleanStudentId,
          undefined,
          publisherUid,
          {
            slug: st.slug,
            nombre: st.nombre,
            frase: st.frase,
            fotoUrl: st.fotoUrl,
            parentPhone: st.parentPhone,
            paleta: st.paleta,
            paletaConfig: st.paletaConfig,
            paletaOverride: st.paletaOverride,
            accessToken: generateAccessToken(),
            tokenRevoked: Boolean(st.tokenRevoked),
            status: st.status,
            order: typeof st.order === 'number' ? st.order : i + idx
          },
          catalog
        );
        batch.set(
          doc(db, 'albums', newAlbumId, 'students', cleanStudentId),
          studentPayload
        );
      });
      await batch.commit();
    }

    return newAlbumId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, currentPath);
  }
}

export async function fetchAlbumAccessByToken(
  rawToken: string
): Promise<
  | { status: 'ready'; access: AlbumAccessDoc }
  | { status: 'unavailable' }
> {
  if (!isValidAccessToken(rawToken)) {
    return { status: 'unavailable' };
  }

  try {
    const snap = await getDoc(doc(db, 'albumAccess', rawToken));
    if (!snap.exists()) {
      return { status: 'unavailable' };
    }
    const data = snap.data();
    if (
      data.revoked === true ||
      data.albumStatus !== 'publicado' ||
      (data.scope === 'student' && data.studentStatus !== 'publicado')
    ) {
      return { status: 'unavailable' };
    }

    return {
      status: 'ready',
      access: {
        albumId: String(data.albumId || ''),
        scope: data.scope === 'album' ? 'album' : 'student',
        albumStatus: 'publicado',
        studentStatus:
          data.studentStatus === 'borrador' ? 'borrador' : 'publicado',
        revoked: false,
        colegio: String(data.colegio || ''),
        promocion: String(data.promocion || ''),
        nivel: (data.nivel as AlbumAccessDoc['nivel']) || 'Primaria',
        anio: String(data.anio || '2026'),
        paleta: (data.paleta as AlbumAccessDoc['paleta']) || DEFAULT_PALETTE_CODE,
        paletaConfig: parsePaletteConfig(data.paletaConfig),
        portadaUrl: String(data.portadaUrl || ''),
        musicaUrl: String(data.musicaUrl || ''),
        tutoraTitulo: String(data.tutoraTitulo || ''),
        tutoraNombre: String(data.tutoraNombre || ''),
        tutoraCargo: String(data.tutoraCargo || ''),
        tutoraFotoUrl: String(data.tutoraFotoUrl || ''),
        tutoraTexto: String(data.tutoraTexto || ''),
        fotos: Array.isArray(data.fotos) ? data.fotos : [],
        videos: Array.isArray(data.videos) ? data.videos : [],
        student:
          data.student && typeof data.student === 'object'
            ? {
                nombre: String(data.student.nombre || ''),
                frase: String(data.student.frase || ''),
                fotoUrl: String(data.student.fotoUrl || '')
              }
            : undefined,
        anuario: Array.isArray(data.anuario) ? data.anuario : [],
        publishedBy: String(data.publishedBy || ''),
        updatedAt: data.updatedAt
      }
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function fetchDraftPreviewForAdmin(
  albumId: string
): Promise<{
  album: DraftAlbum;
  students: DraftStudent[];
  palettes: ColorPalette[];
} | null> {
  const [albumSnap, palettes] = await Promise.all([
    getDoc(doc(db, 'albums', albumId)),
    fetchPalettesCatalogSafe()
  ]);
  if (!albumSnap.exists()) return null;
  const data = albumSnap.data();
  const album: DraftAlbum = {
    id: albumSnap.id,
    slug: String(data.slug || albumSnap.id),
    colegio: String(data.colegio || ''),
    promocion: String(data.promocion || ''),
    nivel: (data.nivel as DraftAlbum['nivel']) || 'Primaria',
    anio: String(data.anio || '2026'),
    paleta: (data.paleta as DraftAlbum['paleta']) || DEFAULT_PALETTE_CODE,
    paletaConfig: parsePaletteConfig(data.paletaConfig),
    portadaUrl: String(data.portadaUrl || ''),
    musicaUrl: String(data.musicaUrl || ''),
    whatsappTexto: String(data.whatsappTexto || ''),
    tutoraTitulo: String(data.tutoraTitulo || ''),
    tutoraNombre: String(data.tutoraNombre || ''),
    tutoraCargo: String(data.tutoraCargo || ''),
    tutoraFotoUrl: String(data.tutoraFotoUrl || ''),
    tutoraTexto: String(data.tutoraTexto || ''),
    fotos: Array.isArray(data.fotos) ? data.fotos : [],
    videos: Array.isArray(data.videos) ? data.videos : [],
    allowGroupAnuario: Boolean(data.allowGroupAnuario),
    generalShareEnabled: Boolean(data.generalShareEnabled),
    generalAccessToken: String(data.generalAccessToken || ''),
    generalTokenRevoked: Boolean(data.generalTokenRevoked),
    status: (data.status as PublishStatus) || 'borrador',
    ownerUid: String(data.ownerUid || ''),
    hasUnpublishedChanges: Boolean(data.hasUnpublishedChanges)
  };

  const studentsSnap = await getDocs(
    query(
      collection(db, 'albums', albumId, 'students'),
      orderBy('order', 'asc')
    )
  );
  const students: DraftStudent[] = studentsSnap.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id,
      albumId,
      slug: String(s.slug || d.id),
      nombre: String(s.nombre || ''),
      frase: String(s.frase || ''),
      fotoUrl: String(s.fotoUrl || ''),
      parentPhone: String(s.parentPhone || ''),
      paleta:
        typeof s.paleta === 'string' && s.paleta.trim().length >= 3
          ? s.paleta.trim()
          : undefined,
      paletaConfig: parsePaletteConfig(s.paletaConfig),
      paletaOverride: parsePaletaOverride(s.paletaOverride),
      accessToken: String(s.accessToken || ''),
      tokenRevoked: Boolean(s.tokenRevoked),
      status: (s.status as PublishStatus) || 'publicado',
      order: typeof s.order === 'number' ? s.order : 0,
      ownerUid: String(s.ownerUid || '')
    };
  });

  return { album, students, palettes };
}
