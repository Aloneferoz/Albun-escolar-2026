import React, { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User
} from 'firebase/auth';
import {
  CheckCircle2,
  Eye,
  GraduationCap,
  Images,
  LayoutDashboard,
  LogOut,
  Plus,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import { auth, googleProvider, testConnection } from './firebase';
import {
  assignPaletteTargets,
  batchImportStudents,
  checkIsAdmin,
  clearStudentPaletteOverride,
  createDraftAlbum,
  deleteColorPalette,
  deleteDraftAlbum,
  deleteDraftStudent,
  isSuperAdminUser,
  publishAlbumSnapshot,
  regenerateGeneralAlbumToken,
  regenerateStudentToken,
  saveColorPalette,
  seedDefaultAlbum,
  seedDefaultPalettes,
  setStudentTokenRevocation,
  subscribeDraftAlbums,
  subscribeDraftStudents,
  subscribePalettes,
  syncAnuarioEntries,
  updateDraftAlbum,
  upsertDraftStudent
} from './services/albumService';
import {
  ColorPalette,
  DEFAULT_PALETTE_CODE,
  DEFAULT_PALETTES,
  DraftAlbum,
  DraftStudent,
  NivelEducativo,
  PaletaVisual,
  PublishStatus,
  resolveAlbumPalette,
  slugify
} from './types/album';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdminOverview } from './components/admin/AdminOverview';
import { AdminAlbumEditor } from './components/admin/AdminAlbumEditor';
import { AdminStudentsManager } from './components/admin/AdminStudentsManager';
import { AdminPublishPanel } from './components/admin/AdminPublishPanel';
import { AdminPreviewModal } from './components/admin/AdminPreviewModal';

type AdminSection = 'resumen' | 'multimedia' | 'alumnos' | 'publicar';

function AdminDashboardContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [albums, setAlbums] = useState<DraftAlbum[]>([]);
  const [albumsLoaded, setAlbumsLoaded] = useState(false);
  const [palettes, setPalettes] = useState<ColorPalette[]>(DEFAULT_PALETTES);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [students, setStudents] = useState<DraftStudent[]>([]);
  const [section, setSection] = useState<AdminSection>('resumen');

  const [isPublishing, setIsPublishing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Modal nuevo álbum
  const [newAlbumOpen, setNewAlbumOpen] = useState(false);
  const [newColegio, setNewColegio] = useState('');
  const [newPromocion, setNewPromocion] = useState('');
  const [newNivel, setNewNivel] = useState<NivelEducativo>('Primaria');
  const [newAnio, setNewAnio] = useState('2026');
  const [newPaleta, setNewPaleta] = useState<PaletaVisual>(DEFAULT_PALETTE_CODE);
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    void testConnection();
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      try {
        if (currentUser) {
          const ok = await checkIsAdmin(
            currentUser.uid,
            currentUser.email,
            currentUser.emailVerified
          );
          setIsAdminUser(ok);
        } else {
          setIsAdminUser(false);
        }
      } catch {
        setIsAdminUser(false);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user || !isAdminUser) {
      setAlbums([]);
      setAlbumsLoaded(false);
      return;
    }

    void seedDefaultPalettes(user.uid);
    const unsubPalettes = subscribePalettes((list) => {
      if (list.length > 0) {
        setPalettes(list);
      }
    });

    const unsub = subscribeDraftAlbums((list) => {
      setAlbums(list);
      setAlbumsLoaded(true);
      setSelectedAlbumId((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    });

    return () => {
      unsub();
      unsubPalettes();
    };
  }, [authReady, user, isAdminUser]);

  const activeAlbum = useMemo(
    () => albums.find((a) => a.id === selectedAlbumId) || albums[0] || null,
    [albums, selectedAlbumId]
  );

  useEffect(() => {
    if (!authReady || !user || !isAdminUser || !activeAlbum) {
      setStudents([]);
      return;
    }

    const unsub = subscribeDraftStudents(activeAlbum.id, (list) => {
      setStudents(list);
    });
    return () => unsub();
  }, [authReady, user, isAdminUser, activeAlbum?.id]);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión con Google.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleCopyUrl = async (url: string, label = 'Enlace copiado') => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(label);
    } catch {
      showToast('No se pudo copiar automáticamente; copia desde la barra.');
    }
  };

  const handleSeedInitial = async () => {
    if (!user) return;
    setIsSeeding(true);
    try {
      const id = await seedDefaultAlbum(user.uid);
      setSelectedAlbumId(id);
      showToast('Álbum inicial cargado con tokens privados y video YouTube.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreatingAlbum(true);
    try {
      const resolvedNewPalette = resolveAlbumPalette(newPaleta, null, palettes);
      const newId = await createDraftAlbum(user.uid, {
        colegio: newColegio,
        promocion: newPromocion,
        nivel: newNivel,
        anio: newAnio,
        paleta: resolvedNewPalette.codigo,
        paletaConfig: resolvedNewPalette.colors,
        slug: slugify(`${newColegio}-${newAnio}`, 3)
      });
      setSelectedAlbumId(newId);
      setNewAlbumOpen(false);
      setNewColegio('');
      setNewPromocion('');
      setSection('multimedia');
      showToast('Nuevo álbum creado en borrador privado.');
    } finally {
      setCreatingAlbum(false);
    }
  };

  const handlePublish = async (targetStatus?: PublishStatus) => {
    if (!activeAlbum || !user) return;
    setIsPublishing(true);
    try {
      await publishAlbumSnapshot(
        activeAlbum,
        students,
        user.uid,
        targetStatus ?? 'publicado'
      );
      showToast(
        targetStatus === 'borrador'
          ? 'Álbum pasado a borrador y tokens revocados.'
          : 'Tokens y cambios publicados correctamente.'
      );
    } finally {
      setIsPublishing(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] flex items-center justify-center p-6">
        <div className="text-sm text-slate-600 font-medium">
          Cargando panel de administración...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-7 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#183a6e] text-white flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                AlbumEscolar Admin
              </h1>
              <p className="text-xs text-slate-500">
                Acceso privado para administración de promociones
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            Inicia sesión con tu cuenta autorizada para gestionar álbumes, tokens individuales por alumno, videos de YouTube, publicación y envíos por WhatsApp.
          </p>

          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={signingIn}
            className="w-full h-11 rounded-xl bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            {signingIn ? 'Conectando...' : 'Continuar con Google'}
          </button>

          <div className="pt-2 border-t border-slate-200 text-center">
            <a
              href="/"
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Volver al portal de acceso
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-7 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                Acceso restringido
              </h1>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Esta cuenta no tiene permisos de administrador en AlbumEscolar. Inicia sesión con la cuenta autorizada.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="flex-1 h-10 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cerrar sesión
            </button>
            <a
              href="/"
              className="flex-1 h-10 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-xs font-semibold inline-flex items-center justify-center"
            >
              Volver al inicio
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isMaster = isSuperAdminUser(user.email, user.emailVerified);

  const navItems: Array<{
    id: AdminSection;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'resumen', label: 'Resumen', shortLabel: 'Resumen', icon: LayoutDashboard },
    { id: 'multimedia', label: 'Álbum y Multimedia', shortLabel: 'Álbum', icon: Images },
    { id: 'alumnos', label: 'Alumnos y Tokens', shortLabel: 'Alumnos', icon: Users },
    { id: 'publicar', label: 'Privacidad y WhatsApp', shortLabel: 'Publicar', icon: Share2 }
  ];

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-900 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Barra lateral escritorio (240px) */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-4 border-b border-slate-200 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#183a6e] text-white flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">
              AlbumEscolar
            </div>
            <div className="text-[11px] text-slate-500">
              {isMaster ? 'Superadmin autorizado' : 'Panel de gestión'}
            </div>
          </div>
        </div>

        {/* Selector de cliente / promoción */}
        <div className="p-3 border-b border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Cliente activo
            </span>
            <button
              type="button"
              onClick={() => setNewAlbumOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#183a6e] hover:underline cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              Nuevo
            </button>
          </div>
          {albums.length > 0 && (
            <select
              value={activeAlbum?.id || ''}
              onChange={(e) => setSelectedAlbumId(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#183a6e]"
            >
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.colegio} ({a.anio})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Navegación principal */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center gap-2.5 h-10 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#183a6e] text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Pie de sesión */}
        <div className="p-3 border-t border-slate-200 space-y-2">
          {activeAlbum && (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              Vista previa privada
            </button>
          )}
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <span className="text-[11px] text-slate-500 truncate">
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => signOut(auth)}
              title="Cerrar sesión"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 md:pl-60 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="md:hidden w-8 h-8 rounded-lg bg-[#183a6e] text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">
                {navItems.find((n) => n.id === section)?.label}
              </h1>
              {activeAlbum && (
                <p className="text-[11px] text-slate-500 truncate md:hidden">
                  {activeAlbum.colegio}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {albums.length > 0 && (
              <select
                value={activeAlbum?.id || ''}
                onChange={(e) => setSelectedAlbumId(e.target.value)}
                className="md:hidden h-9 max-w-[140px] px-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-900"
              >
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.colegio}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setNewAlbumOpen(true)}
              className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 cursor-pointer"
              title="Nuevo álbum"
            >
              <Plus className="w-4 h-4" />
            </button>

            {activeAlbum && (
              <button
                type="button"
                onClick={() => handlePublish('publicado')}
                disabled={isPublishing}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {isPublishing ? 'Sincronizando...' : 'Publicar cambios'}
                </span>
                <span className="sm:hidden">Publicar</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => signOut(auth)}
              className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto">
          {!albumsLoaded ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Cargando álbumes desde Firestore...
            </div>
          ) : !activeAlbum ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#183a6e] flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                Configura tu primer álbum privado
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Importa el álbum modelo con tokens individuales privados y video desde YouTube, o crea un nuevo colegio desde cero.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSeedInitial}
                  disabled={isSeeding}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  {isSeeding ? 'Cargando datos...' : 'Cargar álbum modelo'}
                </button>
                <button
                  type="button"
                  onClick={() => setNewAlbumOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Crear cliente desde cero
                </button>
              </div>
            </div>
          ) : (
            <>
              {section === 'resumen' && (
                <AdminOverview
                  albums={albums}
                  activeAlbum={activeAlbum}
                  students={students}
                  onSelectAlbum={(id) => setSelectedAlbumId(id)}
                  onNavigateSection={(sec) => setSection(sec)}
                  onOpenPreview={() => setPreviewOpen(true)}
                  onPublish={() => handlePublish('publicado')}
                  isPublishing={isPublishing}
                  onCopyUrl={handleCopyUrl}
                />
              )}

              {section === 'multimedia' && (
                <AdminAlbumEditor
                  album={activeAlbum}
                  allAlbums={albums}
                  students={students}
                  palettes={palettes}
                  onSaveAlbum={(patch) => updateDraftAlbum(activeAlbum.id, patch)}
                  onAssignPaletteTargets={async (palette, target) => {
                    await assignPaletteTargets(activeAlbum.id, palette, target);
                    showToast(
                      target.scope === 'album'
                        ? `Paleta «${palette.nombre}» aplicada a ${activeAlbum.colegio}.`
                        : `Paleta «${palette.nombre}» aplicada a ${target.studentIds.length} estudiante(s).`
                    );
                  }}
                  onClearStudentPalette={async (studentId) => {
                    await clearStudentPaletteOverride(activeAlbum.id, studentId);
                    showToast('El estudiante volverá a heredar la paleta del evento.');
                  }}
                  onSaveAnuario={async (entries) => {
                    await syncAnuarioEntries(
                      activeAlbum.id,
                      user.uid,
                      students,
                      entries
                    );
                    showToast('Anuario guardado y sincronizado.');
                  }}
                  onSavePalette={async (input, options) => {
                    const saved = await saveColorPalette(user.uid, input, options);
                    showToast(
                      options.mode === 'create'
                        ? `Paleta «${saved.nombre}» guardada en tu catálogo.`
                        : `Paleta «${saved.nombre}» actualizada.`
                    );
                    return saved;
                  }}
                  onDeletePalette={async (
                    paletteCode,
                    assignedAlbumIds,
                    allAlbumIds
                  ) => {
                    await deleteColorPalette(
                      paletteCode,
                      assignedAlbumIds,
                      allAlbumIds
                    );
                    showToast(
                      assignedAlbumIds.length > 0
                        ? 'Paleta eliminada; álbumes y alumnos reasignados a la paleta predeterminada.'
                        : 'Paleta eliminada del catálogo.'
                    );
                  }}
                  onNavigateAlumnos={() => setSection('alumnos')}
                  onDeleteAlbum={async () => {
                    await deleteDraftAlbum(activeAlbum.id);
                    setSelectedAlbumId(null);
                    setSection('resumen');
                    showToast('Álbum y tokens eliminados.');
                  }}
                  canDeleteAlbum={albums.length > 1}
                />
              )}

              {section === 'alumnos' && (
                <AdminStudentsManager
                  album={activeAlbum}
                  students={students}
                  palettes={palettes}
                  onUpsertStudent={async (studentId, input) => {
                    await upsertDraftStudent(
                      activeAlbum.id,
                      user.uid,
                      studentId,
                      input
                    );
                    showToast(
                      studentId
                        ? 'Alumno actualizado en borrador.'
                        : 'Alumno añadido con token único.'
                    );
                  }}
                  onBatchImport={async (rawLines) => {
                    const count = await batchImportStudents(
                      activeAlbum.id,
                      user.uid,
                      rawLines,
                      students.length
                    );
                    showToast(`${count} alumnos importados con token único.`);
                    return count;
                  }}
                  onDeleteStudent={async (student) => {
                    await deleteDraftStudent(activeAlbum.id, student);
                    showToast('Alumno y token eliminados.');
                  }}
                  onToggleRevoke={async (student, revoked) => {
                    await setStudentTokenRevocation(
                      activeAlbum,
                      student,
                      revoked,
                      user.uid
                    );
                    showToast(
                      revoked
                        ? `Acceso revocado para ${student.nombre}.`
                        : `Acceso reactivado para ${student.nombre}.`
                    );
                  }}
                  onRegenerateToken={async (student) => {
                    await regenerateStudentToken(
                      activeAlbum,
                      students,
                      student,
                      user.uid
                    );
                    showToast(
                      `Nuevo token generado para ${student.nombre}. El enlace anterior quedó anulado.`
                    );
                  }}
                  onCopyUrl={handleCopyUrl}
                />
              )}

              {section === 'publicar' && (
                <AdminPublishPanel
                  album={activeAlbum}
                  students={students}
                  onSaveSettings={async (patch) => {
                    await updateDraftAlbum(activeAlbum.id, patch);
                    showToast('Configuración guardada. Pulsa Publicar para aplicar a tokens activos.');
                  }}
                  onRegenerateGeneralToken={async () => {
                    await regenerateGeneralAlbumToken(
                      activeAlbum,
                      students,
                      user.uid
                    );
                    showToast('Token general rotado. El enlace anterior fue invalidado.');
                  }}
                  onOpenPreview={() => setPreviewOpen(true)}
                  onPublish={handlePublish}
                  isPublishing={isPublishing}
                  onCopyUrl={handleCopyUrl}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Navegación inferior móvil */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 grid grid-cols-4 h-16"
        aria-label="Navegación panel administrador"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold cursor-pointer ${
                active ? 'text-[#183a6e]' : 'text-slate-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Modal Nuevo Álbum */}
      {newAlbumOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreateAlbum}
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-xl"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                Nuevo álbum de promoción
              </h3>
              <button
                type="button"
                onClick={() => setNewAlbumOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre del colegio
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={newColegio}
                  onChange={(e) => setNewColegio(e.target.value)}
                  placeholder="Ej: I.E.P. San Agustín"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre de la promoción
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={newPromocion}
                  onChange={(e) => setNewPromocion(e.target.value)}
                  placeholder="Ej: Promoción 2026 - Futuros Líderes"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nivel
                  </label>
                  <select
                    value={newNivel}
                    onChange={(e) => setNewNivel(e.target.value as NivelEducativo)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white text-slate-900"
                  >
                    <option value="Inicial">Inicial</option>
                    <option value="Primaria">Primaria</option>
                    <option value="Secundaria">Secundaria</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Año
                  </label>
                  <input
                    type="text"
                    required
                    pattern="^[0-9]{4}$"
                    maxLength={4}
                    value={newAnio}
                    onChange={(e) =>
                      setNewAnio(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm tabular-nums text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Paleta visual
                </label>
                <select
                  value={newPaleta}
                  onChange={(e) => setNewPaleta(e.target.value as PaletaVisual)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white text-slate-900"
                >
                  {palettes
                    .filter((p) => p.activa)
                    .map((p) => (
                      <option key={p.codigo} value={p.codigo}>
                        {p.nombre}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setNewAlbumOpen(false)}
                className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingAlbum}
                className="h-9 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-xs font-semibold cursor-pointer"
              >
                {creatingAlbum ? 'Creando...' : 'Crear borrador'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Vista Previa Privada */}
      {previewOpen && activeAlbum && (
        <AdminPreviewModal
          albumId={activeAlbum.id}
          albumTitle={`${activeAlbum.colegio} · ${activeAlbum.promocion}`}
          students={students}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* Notificación discreta */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AdminDashboardContent />
    </ErrorBoundary>
  );
}
