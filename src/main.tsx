import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initPublicAlbumSync } from './publicSync.ts';

const isAdminRoute = window.location.pathname.startsWith('/admin');

if (isAdminRoute) {
  document.documentElement.classList.add('is-admin-route');
  document.title = 'Panel Administrador · AlbumEscolar';
  const adminContainer = document.getElementById('admin-root');
  if (adminContainer) {
    createRoot(adminContainer).render(<App />);
  }
} else {
  void initPublicAlbumSync();
}
