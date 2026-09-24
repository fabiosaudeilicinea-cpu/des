'use client';

/* =========================================================
   app/page.js — Roteador da aplicação (Login <-> Home)
   - Registra o Service Worker (requisito PWA / TWA)
   - Restaura sessão salva no localStorage
   ========================================================= */

import { useEffect, useState } from 'react';
import LoginScreen from '../components/LoginScreen';
import TvHome from '../components/TvHome';
import { loadSession, clearSession } from '../lib/xtream';

export default function Home() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  // Registro do Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('SW registration failed:', err));
    }
    // Restaura sessão existente
    setSession(loadSession());
    setReady(true);
  }, []);

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  if (!ready) {
    return (
      <div className="login-screen">
        <div className="video-placeholder">
          <div className="spinner" />
          Carregando…
        </div>
      </div>
    );
  }

  return session ? (
    <TvHome session={session} onLogout={handleLogout} />
  ) : (
    <LoginScreen onLogin={setSession} />
  );
}
