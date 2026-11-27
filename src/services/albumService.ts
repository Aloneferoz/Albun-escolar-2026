import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
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
  generateAccessToken,
  isValidAccessToken,
  isValidHexColor,
  PaletteColors,
  PublicStudentCard,
  PublishStatus,
  resolveAlbumPalette,
  sanitizeFotoItem,
  sanitizePaletteColors,
  sanitizeVideoItem,
  slugify
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

function resolvePreservedCreatedAt(
  existingData: Record<string, unknown> | undefined
) {
  return existingData?.createdAt instanceof Timestamp
    ? existingData.createdAt
    : serverTimestamp();
}

function buildNormalizedAlbumPayload(
  albumId: string,
  existingData: Record<string, unknown> | undefined,
  fallbackUid: string | undefined,
  overrides: Record<string, unknown> = {}
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
    parsePaletteConfig(merged.paletaConfig)
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
  overrides: Record<string, unknown> & { clearPaleta?: boolean } = {}
): Record<string, unknown> {
  const { clearPaleta, ...restOverrides } = overrides;
  const merged: Record<string, unknown> = {
    ...(existingData || {}),
    ...restOverrides
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

  if (
    !clearPaleta &&
    typeof merged.paleta === 'string' &&
    merged.paleta.trim().length >= BLUEPRINT_LIMITS.PALETTE_CODE_MIN
  ) {
    const resolved = resolveAlbumPalette(
      merged.paleta,
      parsePaletteConfig(merged.paletaConfig)
    );
    payload.paleta = resolved.codigo;
    payload.paletaConfig = resolved.colors;
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

      assignedSet.forEach((albumId) => {
        touchedAlbums.add(albumId);
        batch.set(
          doc(db, 'albums', albumId),
          buildNormalizedAlbumPayload(
            albumId,
            albumSnapsMap.get(albumId),
            ownerUid,
            {
              paleta: cleanCodigo,
              paletaConfig: cleanColors,
              hasUnpublishedChanges: true
            }
          )
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
              buildNormalizedStudentPayload(albId, sd.id, sd.data(), ownerUid, {
                paleta: cleanCodigo,
                paletaConfig: cleanColors
              })
            );
          });
          if (!touchedAlbums.has(albId)) {
            touchedAlbums.add(albId);
            batch.set(
              doc(db, 'albums', albId),
              buildNormalizedAlbumPayload(
                albId,
                albumSnapsMap.get(albId),
                ownerUid,
                { hasUnpublishedChanges: true }
              )
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
      batch.set(
        doc(db, 'albums', albumId),
        buildNormalizedAlbumPayload(
          albumId,
          albumSnapsMap.get(albumId),
          fallbackUid,
          {
            paleta: DEFAULT_PALETTE_CODE,
            paletaConfig: DEFAULT_PALETTE_COLORS,
            hasUnpublishedChanges: true
          }
        )
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
          batch.set(
            doc(db, 'albums', albId),
            buildNormalizedAlbumPayload(
              albId,
              albumSnapsMap.get(albId),
              fallbackUid,
              { hasUnpublishedChanges: true }
            )
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

    const albumRef = doc(db, 'albums', albumId);
    const albumSnap = await getDoc(albumRef);
    const existingAlbumData = albumSnap.exists() ? albumSnap.data() : undefined;

    const batch = writeBatch(db);
    if (target.scope === 'album') {
      batch.set(
        albumRef,
        buildNormalizedAlbumPayload(albumId, existingAlbumData, fallbackUid, {
          paleta: cleanCode,
          paletaConfig: cleanColors,
          hasUnpublishedChanges: true
        })
      );
    } else {
      const studentSnaps = await Promise.all(
        target.studentIds.map((studentId) =>
          getDoc(doc(db, 'albums', albumId, 'students', studentId))
        )
      );
      studentSnaps.forEach((stSnap) => {
        if (!stSnap.exists()) return;
        batch.set(
          stSnap.ref,
          buildNormalizedStudentPayload(
            albumId,
            stSnap.id,
            stSnap.data(),
            fallbackUid,
            {
              paleta: cleanCode,
              paletaConfig: cleanColors
            }
          )
        );
      });
      batch.set(
        albumRef,
        buildNormalizedAlbumPayload(albumId, existingAlbumData, fallbackUid, {
          hasUnpublishedChanges: true
        })
      );
    }
    await batch.commit();
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
    const [albumSnap, studentSnap] = await Promise.all([
      getDoc(albumRef),
      getDoc(studentRef)
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
          { clearPaleta: true }
        )
      );
    }
    batch.set(
      albumRef,
      buildNormalizedAlbumPayload(
        albumId,
        albumSnap.exists() ? albumSnap.data() : undefined,
        fallbackUid,
        { hasUnpublishedChanges: true }
      )
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

  try {
    const albumRef = doc(db, 'albums', albumId);
    const albumSnap = await getDoc(albumRef);
    await setDoc(
      albumRef,
      buildNormalizedAlbumPayload(
        albumId,
        albumSnap.exists() ? albumSnap.data() : undefined,
        getCurrentUidFallback(),
        overrides
      )
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
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
    const [albumSnap, existingStudentSnap] = await Promise.all([
      getDoc(albumRef),
      studentId ? getDoc(studentRef) : Promise.resolve(null)
    ]);

    const safeOrder = Math.max(
      0,
      Math.min(BLUEPRINT_LIMITS.ORDER_MAX, Number(input.order) || 0)
    );

    const hasCustomPalette =
      typeof input.paleta === 'string' &&
      input.paleta.trim().length >= BLUEPRINT_LIMITS.PALETTE_CODE_MIN;
    const resolvedStudentPalette = hasCustomPalette
      ? resolveAlbumPalette(input.paleta as string, input.paletaConfig)
      : null;

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
      if (resolvedStudentPalette) {
        overrides.paleta = resolvedStudentPalette.codigo;
        overrides.paletaConfig = resolvedStudentPalette.colors;
      } else if (input.paleta === null || input.paleta === '') {
        overrides.clearPaleta = true;
      }
      batch.set(
        studentRef,
        buildNormalizedStudentPayload(
          albumId,
          targetId,
          existingStudentSnap?.exists()
            ? existingStudentSnap.data()
            : undefined,
          ownerUid,
          overrides
        )
      );
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
      if (resolvedStudentPalette) {
        createPayload.paleta = resolvedStudentPalette.codigo;
        createPayload.paletaConfig = resolvedStudentPalette.colors;
      }
      batch.set(studentRef, createPayload);
    }

    batch.set(
      albumRef,
      buildNormalizedAlbumPayload(
        albumId,
        albumSnap.exists() ? albumSnap.data() : undefined,
        ownerUid,
        { hasUnpublishedChanges: true }
      )
    );

    await batch.commit();
    return targetId;
  } catch (error) {
    handleFirestoreError(
      error,
      studentId ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
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
    batch.set(
      albumRef,
      buildNormalizedAlbumPayload(
        albumId,
        albumSnap.exists() ? albumSnap.data() : undefined,
        ownerUid,
        { hasUnpublishedChanges: true }
      )
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
    const [albumSnap, currentStudentsSnap] = await Promise.all([
      getDoc(albumRef),
      getDocs(collection(db, 'albums', albumId, 'students'))
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
            }
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

    batch.set(
      albumRef,
      buildNormalizedAlbumPayload(
        albumId,
        albumSnap.exists() ? albumSnap.data() : undefined,
        ownerUid,
        { hasUnpublishedChanges: true }
      )
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
    batch.set(
      albumRef,
      buildNormalizedAlbumPayload(
        albumId,
        albumSnap.exists() ? albumSnap.data() : undefined,
        getCurrentUidFallback(),
        { hasUnpublishedChanges: true }
      )
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
    const studentSnap = await getDoc(studentRef);
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
        }
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
    const studentSnap = await getDoc(studentRef);
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
        }
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

      const resolvedAlbumPaleta = resolveAlbumPalette(
        album.paleta,
        album.paletaConfig
      );
      const effectiveStudentPaleta = targetStudent.paleta
        ? resolveAlbumPalette(targetStudent.paleta, targetStudent.paletaConfig)
        : resolvedAlbumPaleta;
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
    batch.set(
      albumRef,
      buildNormalizedAlbumPayload(
        album.id,
        albumSnap.exists() ? albumSnap.data() : undefined,
        publisherUid,
        {
          generalAccessToken: newToken,
          generalTokenRevoked: false
        }
      )
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
      const resolvedPaleta = resolveAlbumPalette(
        album.paleta,
        album.paletaConfig
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

export async function publishAlbumSnapshot(
  album: DraftAlbum,
  students: DraftStudent[],
  publisherUid: string,
  overrideStatus?: PublishStatus
): Promise<void> {
  const effectiveStatus: PublishStatus = overrideStatus ?? album.status;
  const cleanSlug = slugify(album.slug, BLUEPRINT_LIMITS.ALBUM_SLUG_MIN);
  const path = `albums/${album.id}`;
  const generalToken = isValidAccessToken(album.generalAccessToken)
    ? album.generalAccessToken
    : generateAccessToken();
  const resolvedPaleta = resolveAlbumPalette(album.paleta, album.paletaConfig);
  const rawColegio = clampStr(album.colegio, BLUEPRINT_LIMITS.COLEGIO_MAX);
  const safeColegio = rawColegio.length >= 2 ? rawColegio : 'Colegio';
  const rawPromocion = clampStr(album.promocion, BLUEPRINT_LIMITS.PROMOCION_MAX);
  const safePromocion =
    rawPromocion.length >= 2 ? rawPromocion : 'Promoción Escolar';
  const safeNivel =
    album.nivel === 'Inicial' ||
    album.nivel === 'Primaria' ||
    album.nivel === 'Secundaria'
      ? album.nivel
      : 'Primaria';
  const safeAnio = BLUEPRINT_LIMITS.ANIO_REGEX.test(album.anio)
    ? album.anio
    : '2026';

  const normalizePublicName = (name: string | undefined | null) => {
    const clamped = clampStr(name, BLUEPRINT_LIMITS.STUDENT_NAME_MAX);
    return clamped.length >= 2 ? clamped : 'Egresado';
  };

  let currentPath = path;

  try {
    // 0. Leer documento actual para preservar ownerUid/createdAt válidos y limpiar cualquier campo heredado
    const albumSnap = await getDoc(doc(db, 'albums', album.id));
    const existingAlbumData = albumSnap.exists() ? albumSnap.data() : undefined;
    const safeOwnerUid = albumSnap.exists()
      ? resolvePreservedOwnerUid(existingAlbumData, publisherUid)
      : publisherUid;
    const safeCreatedAt =
      albumSnap.exists() && existingAlbumData?.createdAt instanceof Timestamp
        ? existingAlbumData.createdAt
        : serverTimestamp();

    const preparedStudents = students.map((st) => ({
      ...st,
      safeStatus: (st.status === 'borrador'
        ? 'borrador'
        : 'publicado') as PublishStatus,
      safeNombre: normalizePublicName(st.nombre),
      safeToken: isValidAccessToken(st.accessToken)
        ? st.accessToken
        : generateAccessToken()
    }));

    const sanitizedFotos = album.fotos
      .slice(0, BLUEPRINT_LIMITS.FOTOS_MAX)
      .map(sanitizeFotoItem);
    const sanitizedVideos = album.videos
      .slice(0, BLUEPRINT_LIMITS.VIDEOS_MAX)
      .map(sanitizeVideoItem);

    // 1. Guardar y normalizar el documento del álbum primero (cumple isValidDraftAlbum sin campos obsoletos)
    currentPath = `albums/${album.id}`;
    await setDoc(doc(db, 'albums', album.id), {
      slug: cleanSlug,
      colegio: safeColegio,
      promocion: safePromocion,
      nivel: safeNivel,
      anio: safeAnio,
      paleta: resolvedPaleta.codigo,
      paletaConfig: resolvedPaleta.colors,
      portadaUrl: clampStr(album.portadaUrl, BLUEPRINT_LIMITS.URL_MAX),
      musicaUrl: clampStr(album.musicaUrl, BLUEPRINT_LIMITS.URL_MAX),
      whatsappTexto: clampStr(
        album.whatsappTexto,
        BLUEPRINT_LIMITS.WHATSAPP_MAX
      ),
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
      fotos: sanitizedFotos,
      videos: sanitizedVideos,
      allowGroupAnuario: Boolean(album.allowGroupAnuario),
      generalShareEnabled: Boolean(album.generalShareEnabled),
      generalAccessToken: generalToken,
      generalTokenRevoked: Boolean(album.generalTokenRevoked),
      status: effectiveStatus,
      ownerUid: safeOwnerUid,
      hasUnpublishedChanges: false,
      createdAt: safeCreatedAt,
      updatedAt: serverTimestamp()
    });

    // 2. Asegurar tokens válidos en alumnos que todavía no tengan uno
    const studentsNeedingToken = preparedStudents.filter(
      (st) => !isValidAccessToken(st.accessToken)
    );
    const CHUNK_SIZE = 12;
    if (studentsNeedingToken.length > 0) {
      currentPath = `albums/${album.id}/students`;
      const rawStudentsSnap = await getDocs(
        collection(db, 'albums', album.id, 'students')
      );
      const rawStudentDataMap = new Map(
        rawStudentsSnap.docs.map((d) => [d.id, d.data()])
      );
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
              }
            )
          );
        });
        await stBatch.commit();
      }
    }

    // 3. Preparar operaciones de /albumAccess en lotes <= 12 para respetar límites de reglas Firestore
    currentPath = 'albumAccess';
    const existingTokensSnap = await getDocs(
      query(collection(db, 'albumAccess'), where('albumId', '==', album.id))
    );

    const anuarioCards: PublicStudentCard[] = album.allowGroupAnuario
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
      fotos: sanitizedFotos,
      videos: sanitizedVideos,
      anuario: anuarioCards,
      publishedBy: publisherUid,
      updatedAt: serverTimestamp()
    };

    const activeTokens = new Set<string>();
    const accessWrites: Array<{
      token: string;
      payload: Record<string, unknown>;
    }> = [];

    preparedStudents.forEach((st) => {
      if (effectiveStatus === 'publicado') {
        const studentPaleta = st.paleta
          ? resolveAlbumPalette(st.paleta, st.paletaConfig)
          : resolvedPaleta;
        activeTokens.add(st.safeToken);
        accessWrites.push({
          token: st.safeToken,
          payload: {
            ...basePayload,
            paleta: studentPaleta.codigo,
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

    if (effectiveStatus === 'publicado' && album.generalShareEnabled) {
      activeTokens.add(generalToken);
      accessWrites.push({
        token: generalToken,
        payload: {
          ...basePayload,
          scope: 'album',
          studentStatus: 'publicado',
          revoked: Boolean(album.generalTokenRevoked)
        }
      });
    }

    for (let i = 0; i < accessWrites.length; i += CHUNK_SIZE) {
      const chunk = accessWrites.slice(i, i + CHUNK_SIZE);
      const accessBatch = writeBatch(db);
      chunk.forEach((item) => {
        accessBatch.set(doc(db, 'albumAccess', item.token), item.payload);
      });
      await accessBatch.commit();
    }

    // 4. Eliminar tokens huérfanos, deshabilitados o cuando el álbum pasa a borrador
    const orphanRefs = existingTokensSnap.docs
      .filter((d) => !activeTokens.has(d.id))
      .map((d) => d.ref);
    for (let i = 0; i < orphanRefs.length; i += CHUNK_SIZE) {
      const chunk = orphanRefs.slice(i, i + CHUNK_SIZE);
      const delBatch = writeBatch(db);
      chunk.forEach((ref) => delBatch.delete(ref));
      await delBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, currentPath);
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
} | null> {
  const albumSnap = await getDoc(doc(db, 'albums', albumId));
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
      accessToken: String(s.accessToken || ''),
      tokenRevoked: Boolean(s.tokenRevoked),
      status: (s.status as PublishStatus) || 'publicado',
      order: typeof s.order === 'number' ? s.order : 0,
      ownerUid: String(s.ownerUid || '')
    };
  });

  return { album, students };
}
