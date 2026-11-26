import { onAuthStateChanged } from 'firebase/auth';
import { auth, testConnection } from './firebase';
import {
  checkIsAdmin,
  fetchAlbumAccessByToken,
  fetchDraftPreviewForAdmin
} from './services/albumService';
import { FotoItem, isValidAccessToken, VideoItem } from './types/album';

const SAVED_TOKEN_KEY = 'album_escolar_access_token';

function getSavedAccessToken(): string | null {
  try {
    const token = window.localStorage.getItem(SAVED_TOKEN_KEY);
    return token && isValidAccessToken(token) ? token : null;
  } catch {
    return null;
  }
}

function saveAccessToken(token: string): void {
  try {
    if (isValidAccessToken(token)) {
      window.localStorage.setItem(SAVED_TOKEN_KEY, token);
    }
  } catch {
    // Ignorar en navegación privada estricta
  }
}

function clearSavedAccessToken(expectedToken?: string): void {
  try {
    if (!expectedToken) {
      window.localStorage.removeItem(SAVED_TOKEN_KEY);
      return;
    }
    if (window.localStorage.getItem(SAVED_TOKEN_KEY) === expectedToken) {
      window.localStorage.removeItem(SAVED_TOKEN_KEY);
    }
  } catch {
    // Ignorar en navegación privada estricta
  }
}

export interface PublicBridgePayload {
  colegio: string;
  promocion: string;
  nivel: string;
  anio: string;
  paleta: string;
  portadaUrl: string;
  musicaUrl: string;
  mensajeTutora: {
    titulo: string;
    nombre: string;
    cargo: string;
    fotoUrl: string;
    texto: string;
  };
  fotos: FotoItem[];
  videos: VideoItem[];
  alumnos: Array<{
    nombre: string;
    frase: string;
    fotoUrl: string;
  }>;
  activeStudent?: {
    nombre: string;
    frase: string;
    fotoUrl: string;
  } | null;
  accessToken?: string;
  isDraftPreview?: boolean;
}

declare global {
  interface Window {
    __ALBUM_PUBLIC_BRIDGE__?: {
      applyAlbumData: (payload: PublicBridgePayload) => void;
      showPreparingState: (
        title?: string,
        subtitle?: string,
        showAdminEntry?: boolean
      ) => void;
      revealPublicContent: () => void;
    };
  }
}

function waitForBridge(
  timeoutMs = 2000
): Promise<NonNullable<Window['__ALBUM_PUBLIC_BRIDGE__']> | null> {
  if (window.__ALBUM_PUBLIC_BRIDGE__) {
    return Promise.resolve(window.__ALBUM_PUBLIC_BRIDGE__);
  }
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      if (window.__ALBUM_PUBLIC_BRIDGE__) {
        clearInterval(timer);
        resolve(window.__ALBUM_PUBLIC_BRIDGE__);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 30);
  });
}

export async function initPublicAlbumSync(): Promise<void> {
  void testConnection();
  const params = new URLSearchParams(window.location.search);
  const previewDraftId = params.get('previewDraft');
  const urlToken = params.get('t');

  const bridge = await waitForBridge();
  if (!bridge) return;

  // 1. Vista Previa Privada exclusiva del administrador (?previewDraft=...)
  if (previewDraftId) {
    const user = await new Promise<import('firebase/auth').User | null>(
      (resolve) => {
        const unsub = onAuthStateChanged(auth, (u) => {
          unsub();
          resolve(u);
        });
      }
    );

    if (!user) {
      bridge.showPreparingState(
        'Vista previa restringida',
        'Inicia sesión en el panel de administración para previsualizar borradores.'
      );
      bridge.revealPublicContent();
      return;
    }

    const isAdm = await checkIsAdmin(user.uid, user.email, user.emailVerified);
    if (!isAdm) {
      bridge.showPreparingState(
        'Acceso restringido',
        'Solo la cuenta administradora puede previsualizar borradores.'
      );
      bridge.revealPublicContent();
      return;
    }

    try {
      const draft = await fetchDraftPreviewForAdmin(previewDraftId);
      if (!draft) {
        bridge.showPreparingState(
          'Borrador no encontrado',
          'No se encontró el álbum solicitado en el espacio de trabajo.'
        );
      } else {
        const previewStudents = draft.album.allowGroupAnuario
          ? draft.students.map((s) => ({
              nombre: s.nombre,
              frase: s.frase,
              fotoUrl: s.fotoUrl
            }))
          : draft.students[0]
            ? [
                {
                  nombre: draft.students[0].nombre,
                  frase: draft.students[0].frase,
                  fotoUrl: draft.students[0].fotoUrl
                }
              ]
            : [];

        bridge.applyAlbumData({
          colegio: draft.album.colegio,
          promocion: draft.album.promocion,
          nivel: draft.album.nivel,
          anio: draft.album.anio,
          paleta: draft.album.paleta,
          portadaUrl: draft.album.portadaUrl,
          musicaUrl: draft.album.musicaUrl,
          mensajeTutora: {
            titulo: draft.album.tutoraTitulo,
            nombre: draft.album.tutoraNombre,
            cargo: draft.album.tutoraCargo,
            fotoUrl: draft.album.tutoraFotoUrl,
            texto: draft.album.tutoraTexto
          },
          fotos: draft.album.fotos,
          videos: draft.album.videos,
          alumnos: previewStudents,
          activeStudent:
            !draft.album.allowGroupAnuario && draft.students[0]
              ? {
                  nombre: draft.students[0].nombre,
                  frase: draft.students[0].frase,
                  fotoUrl: draft.students[0].fotoUrl
                }
              : null,
          isDraftPreview: true
        });
      }
    } finally {
      bridge.revealPublicContent();
    }
    return;
  }

  // 2. Acceso privado por token aleatorio (?t=...) o token recordado de la PWA instalada
  const activeToken = urlToken || getSavedAccessToken();
  if (activeToken) {
    try {
      const result = await fetchAlbumAccessByToken(activeToken);
      if (result.status === 'ready') {
        saveAccessToken(activeToken);
        if (!urlToken) {
          try {
            window.history.replaceState(
              null,
              '',
              `/?t=${encodeURIComponent(activeToken)}`
            );
          } catch {
            // Ignorar si replaceState no está permitido
          }
        }
        const docData = result.access;
        const anuarioList =
          docData.anuario.length > 0
            ? docData.anuario
            : docData.student
              ? [docData.student]
              : [];

        bridge.applyAlbumData({
          colegio: docData.colegio,
          promocion: docData.promocion,
          nivel: docData.nivel,
          anio: docData.anio,
          paleta: docData.paleta,
          portadaUrl: docData.portadaUrl || '',
          musicaUrl: docData.musicaUrl || '',
          mensajeTutora: {
            titulo: docData.tutoraTitulo || '',
            nombre: docData.tutoraNombre || '',
            cargo: docData.tutoraCargo || '',
            fotoUrl: docData.tutoraFotoUrl || '',
            texto: docData.tutoraTexto || ''
          },
          fotos: docData.fotos,
          videos: docData.videos,
          alumnos: anuarioList,
          activeStudent: docData.student || null,
          accessToken: activeToken
        });
      } else {
        clearSavedAccessToken(activeToken);
        bridge.showPreparingState(
          'Enlace no disponible o revocado',
          'Este enlace privado fue desactivado, corresponde a un álbum en borrador o no es válido. Solicita el enlace actualizado a tu colegio.'
        );
      }
    } finally {
      bridge.revealPublicContent();
    }
    return;
  }

  // 3. Raíz `/` sin token: portal neutro para familias; el botón de administración
  // solo se muestra en el entorno de desarrollo del creador o si hay sesión admin activa.
  const host = window.location.hostname;
  const isDevHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('ais-dev-');

  let showAdminEntry = isDevHost;
  if (!showAdminEntry) {
    try {
      const currentUser = await new Promise<import('firebase/auth').User | null>(
        (resolve) => {
          let settled = false;
          const timer = window.setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve(auth.currentUser);
            }
          }, 900);
          const unsub = onAuthStateChanged(auth, (u) => {
            unsub();
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(u);
            }
          });
        }
      );
      if (currentUser) {
        showAdminEntry = await checkIsAdmin(
          currentUser.uid,
          currentUser.email,
          currentUser.emailVerified
        );
      }
    } catch {
      showAdminEntry = false;
    }
  }

  bridge.showPreparingState(
    'Acceso mediante enlace familiar',
    'Para proteger la privacidad de los estudiantes, este álbum digital escolar se abre únicamente mediante el enlace privado enviado por tu colegio o docente.',
    showAdminEntry
  );
  bridge.revealPublicContent();
}
