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
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import {
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
  DraftAlbum,
  DraftStudent,
  generateAccessToken,
  isValidAccessToken,
  PublicStudentCard,
  PublishStatus,
  sanitizeFotoItem,
  sanitizeVideoItem,
  slugify
} from '../types/album';

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
          paleta: (data.paleta as DraftAlbum['paleta']) || 'primaria-azul-oro',
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
      paleta: input.paleta,
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
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    hasUnpublishedChanges:
      patch.hasUnpublishedChanges !== undefined
        ? patch.hasUnpublishedChanges
        : true
  };

  if (patch.slug !== undefined) {
    payload.slug = slugify(patch.slug, BLUEPRINT_LIMITS.ALBUM_SLUG_MIN);
  }
  if (patch.colegio !== undefined) {
    payload.colegio =
      clampStr(patch.colegio, BLUEPRINT_LIMITS.COLEGIO_MAX) || 'Colegio';
  }
  if (patch.promocion !== undefined) {
    payload.promocion =
      clampStr(patch.promocion, BLUEPRINT_LIMITS.PROMOCION_MAX) || 'Promoción';
  }
  if (patch.nivel !== undefined) payload.nivel = patch.nivel;
  if (patch.anio !== undefined) {
    payload.anio = BLUEPRINT_LIMITS.ANIO_REGEX.test(patch.anio)
      ? patch.anio
      : '2026';
  }
  if (patch.paleta !== undefined) payload.paleta = patch.paleta;
  if (patch.portadaUrl !== undefined) {
    payload.portadaUrl = clampStr(patch.portadaUrl, BLUEPRINT_LIMITS.URL_MAX);
  }
  if (patch.musicaUrl !== undefined) {
    payload.musicaUrl = clampStr(patch.musicaUrl, BLUEPRINT_LIMITS.URL_MAX);
  }
  if (patch.whatsappTexto !== undefined) {
    payload.whatsappTexto = clampStr(
      patch.whatsappTexto,
      BLUEPRINT_LIMITS.WHATSAPP_MAX
    );
  }
  if (patch.tutoraTitulo !== undefined) {
    payload.tutoraTitulo = clampStr(
      patch.tutoraTitulo,
      BLUEPRINT_LIMITS.TUTORA_TITULO_MAX
    );
  }
  if (patch.tutoraNombre !== undefined) {
    payload.tutoraNombre = clampStr(
      patch.tutoraNombre,
      BLUEPRINT_LIMITS.TUTORA_NOMBRE_MAX
    );
  }
  if (patch.tutoraCargo !== undefined) {
    payload.tutoraCargo = clampStr(
      patch.tutoraCargo,
      BLUEPRINT_LIMITS.TUTORA_CARGO_MAX
    );
  }
  if (patch.tutoraFotoUrl !== undefined) {
    payload.tutoraFotoUrl = clampStr(
      patch.tutoraFotoUrl,
      BLUEPRINT_LIMITS.URL_MAX
    );
  }
  if (patch.tutoraTexto !== undefined) {
    payload.tutoraTexto = clampStr(
      patch.tutoraTexto,
      BLUEPRINT_LIMITS.TUTORA_TEXTO_MAX
    );
  }
  if (patch.fotos !== undefined) {
    payload.fotos = patch.fotos
      .slice(0, BLUEPRINT_LIMITS.FOTOS_MAX)
      .map(sanitizeFotoItem);
  }
  if (patch.videos !== undefined) {
    payload.videos = patch.videos
      .slice(0, BLUEPRINT_LIMITS.VIDEOS_MAX)
      .map(sanitizeVideoItem);
  }
  if (patch.allowGroupAnuario !== undefined) {
    payload.allowGroupAnuario = Boolean(patch.allowGroupAnuario);
  }
  if (patch.generalShareEnabled !== undefined) {
    payload.generalShareEnabled = Boolean(patch.generalShareEnabled);
  }
  if (patch.generalAccessToken !== undefined) {
    payload.generalAccessToken = isValidAccessToken(patch.generalAccessToken)
      ? patch.generalAccessToken
      : '';
  }
  if (patch.generalTokenRevoked !== undefined) {
    payload.generalTokenRevoked = Boolean(patch.generalTokenRevoked);
  }
  if (patch.status !== undefined) payload.status = patch.status;

  try {
    await updateDoc(doc(db, 'albums', albumId), payload);
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

    const safeOrder = Math.max(
      0,
      Math.min(BLUEPRINT_LIMITS.ORDER_MAX, Number(input.order) || 0)
    );

    if (studentId) {
      batch.update(studentRef, {
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
        updatedAt: serverTimestamp()
      });
    } else {
      batch.set(studentRef, {
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
      });
    }

    batch.update(albumRef, {
      hasUnpublishedChanges: true,
      updatedAt: serverTimestamp()
    });

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

    batch.update(doc(db, 'albums', albumId), {
      hasUnpublishedChanges: true,
      updatedAt: serverTimestamp()
    });

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
        batch.update(doc(db, 'albums', albumId, 'students', existing.id), {
          slug: existing.slug || slugify(cleanNombre, BLUEPRINT_LIMITS.STUDENT_SLUG_MIN),
          nombre: cleanNombre,
          frase: cleanFrase,
          fotoUrl: cleanFotoUrl,
          parentPhone: existing.parentPhone || '',
          accessToken: safeToken,
          tokenRevoked: Boolean(existing.tokenRevoked),
          status: existing.status || 'publicado',
          order: safeOrder,
          updatedAt: serverTimestamp()
        });
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

    batch.update(doc(db, 'albums', albumId), {
      hasUnpublishedChanges: true,
      updatedAt: serverTimestamp()
    });

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
    const batch = writeBatch(db);
    batch.delete(doc(db, 'albums', albumId, 'students', student.id));
    if (isValidAccessToken(student.accessToken)) {
      batch.delete(doc(db, 'albumAccess', student.accessToken));
    }
    batch.update(doc(db, 'albums', albumId), {
      hasUnpublishedChanges: true,
      updatedAt: serverTimestamp()
    });
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
    const batch = writeBatch(db);
    batch.update(doc(db, 'albums', album.id, 'students', student.id), {
      accessToken: validToken,
      tokenRevoked: revoked,
      updatedAt: serverTimestamp()
    });

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
    const batch = writeBatch(db);
    batch.update(doc(db, 'albums', album.id, 'students', targetStudent.id), {
      accessToken: newToken,
      tokenRevoked: false,
      updatedAt: serverTimestamp()
    });

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

      batch.set(doc(db, 'albumAccess', newToken), {
        albumId: album.id,
        scope: 'student',
        albumStatus: album.status,
        studentStatus: targetStudent.status,
        revoked: false,
        colegio: clampStr(album.colegio, BLUEPRINT_LIMITS.COLEGIO_MAX) || 'Colegio',
        promocion:
          clampStr(album.promocion, BLUEPRINT_LIMITS.PROMOCION_MAX) ||
          'Promoción',
        nivel: album.nivel,
        anio: BLUEPRINT_LIMITS.ANIO_REGEX.test(album.anio) ? album.anio : '2026',
        paleta: album.paleta,
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
          nombre:
            clampStr(targetStudent.nombre, BLUEPRINT_LIMITS.STUDENT_NAME_MAX) ||
            'Egresado',
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
    const batch = writeBatch(db);
    batch.update(doc(db, 'albums', album.id), {
      generalAccessToken: newToken,
      generalTokenRevoked: false,
      updatedAt: serverTimestamp()
    });

    if (isValidAccessToken(oldToken)) {
      batch.delete(doc(db, 'albumAccess', oldToken));
    }

    if (album.status === 'publicado' && album.generalShareEnabled) {
      const anuarioCards: PublicStudentCard[] = album.allowGroupAnuario
        ? students
            .filter((s) => s.status === 'publicado' && !s.tokenRevoked)
            .map((s) => ({
              nombre:
                clampStr(s.nombre, BLUEPRINT_LIMITS.STUDENT_NAME_MAX) ||
                'Egresado',
              frase: clampStr(s.frase, BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
              fotoUrl: clampStr(s.fotoUrl, BLUEPRINT_LIMITS.URL_MAX)
            }))
        : [];

      batch.set(doc(db, 'albumAccess', newToken), {
        albumId: album.id,
        scope: 'album',
        albumStatus: album.status,
        studentStatus: album.status,
        revoked: false,
        colegio: clampStr(album.colegio, BLUEPRINT_LIMITS.COLEGIO_MAX) || 'Colegio',
        promocion:
          clampStr(album.promocion, BLUEPRINT_LIMITS.PROMOCION_MAX) ||
          'Promoción',
        nivel: album.nivel,
        anio: BLUEPRINT_LIMITS.ANIO_REGEX.test(album.anio) ? album.anio : '2026',
        paleta: album.paleta,
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

  try {
    const existingTokensSnap = await getDocs(
      query(collection(db, 'albumAccess'), where('albumId', '==', album.id))
    );

    const preparedStudents = students.map((st) => ({
      ...st,
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

    const anuarioCards: PublicStudentCard[] = album.allowGroupAnuario
      ? preparedStudents
          .filter((s) => s.status === 'publicado' && !s.tokenRevoked)
          .map((s) => ({
            nombre:
              clampStr(s.nombre, BLUEPRINT_LIMITS.STUDENT_NAME_MAX) ||
              'Egresado',
            frase: clampStr(s.frase, BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
            fotoUrl: clampStr(s.fotoUrl, BLUEPRINT_LIMITS.URL_MAX)
          }))
      : [];

    const basePayload = {
      albumId: album.id,
      albumStatus: effectiveStatus,
      colegio: clampStr(album.colegio, BLUEPRINT_LIMITS.COLEGIO_MAX) || 'Colegio',
      promocion:
        clampStr(album.promocion, BLUEPRINT_LIMITS.PROMOCION_MAX) ||
        'Promoción',
      nivel: album.nivel,
      anio: BLUEPRINT_LIMITS.ANIO_REGEX.test(album.anio) ? album.anio : '2026',
      paleta: album.paleta,
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

    const batch = writeBatch(db);
    const activeTokens = new Set<string>();

    // 1. Sincronizar tokens individuales por alumno (SIN parentPhone)
    preparedStudents.forEach((st) => {
      if (!isValidAccessToken(st.accessToken)) {
        batch.update(doc(db, 'albums', album.id, 'students', st.id), {
          accessToken: st.safeToken,
          tokenRevoked: Boolean(st.tokenRevoked),
          updatedAt: serverTimestamp()
        });
      }

      if (effectiveStatus === 'publicado') {
        activeTokens.add(st.safeToken);
        batch.set(doc(db, 'albumAccess', st.safeToken), {
          ...basePayload,
          scope: 'student',
          studentStatus: st.status,
          revoked: Boolean(st.tokenRevoked),
          student: {
            nombre:
              clampStr(st.nombre, BLUEPRINT_LIMITS.STUDENT_NAME_MAX) ||
              'Egresado',
            frase: clampStr(st.frase, BLUEPRINT_LIMITS.STUDENT_FRASE_MAX),
            fotoUrl: clampStr(st.fotoUrl, BLUEPRINT_LIMITS.URL_MAX)
          }
        });
      }
    });

    // 2. Sincronizar token general opcional (si está habilitado)
    if (effectiveStatus === 'publicado' && album.generalShareEnabled) {
      activeTokens.add(generalToken);
      batch.set(doc(db, 'albumAccess', generalToken), {
        ...basePayload,
        scope: 'album',
        studentStatus: 'publicado',
        revoked: Boolean(album.generalTokenRevoked)
      });
    }

    // 3. Eliminar tokens huérfanos, deshabilitados o cuando el álbum pasa a borrador
    existingTokensSnap.docs.forEach((d) => {
      if (!activeTokens.has(d.id)) {
        batch.delete(d.ref);
      }
    });

    // 4. Actualizar estado del álbum en el espacio privado
    batch.update(doc(db, 'albums', album.id), {
      slug: cleanSlug,
      generalAccessToken: generalToken,
      status: effectiveStatus,
      hasUnpublishedChanges: false,
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
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
        paleta: (data.paleta as AlbumAccessDoc['paleta']) || 'primaria-azul-oro',
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
    paleta: (data.paleta as DraftAlbum['paleta']) || 'primaria-azul-oro',
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
      accessToken: String(s.accessToken || ''),
      tokenRevoked: Boolean(s.tokenRevoked),
      status: (s.status as PublishStatus) || 'publicado',
      order: typeof s.order === 'number' ? s.order : 0,
      ownerUid: String(s.ownerUid || '')
    };
  });

  return { album, students };
}
