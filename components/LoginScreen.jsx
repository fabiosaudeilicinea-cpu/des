'use client';

/* =========================================================
   components/LoginScreen.jsx — Login Xtream Codes
   Campos: Server URL / Usuário / Senha.
   A validação acontece no proxy /api/xtream?action=authenticate
   (o navegador nunca chama o servidor IPTV diretamente).
   ========================================================= */

import { useState, useRef, useCallback } from 'react';
import { normalizeServerUrl, saveSession } from '../lib/xtream';

export default function LoginScreen({ onLogin }) {
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const userInput = useRef(null);
  const passInput = useRef(null);

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      setError('');

      const normalized = normalizeServerUrl(server);
      if (!normalized) return setError('Informe uma URL de servidor válida (ex.: http://painel.com:8080).');
      if (!username.trim() || !password.trim()) return setError('Preencha usuário e senha.');

      setLoading(true);
      try {
        const qs = new URLSearchParams({
          action: 'authenticate',
          server: normalized,
          username: username.trim(),
          password: password.trim(),
        });
        const res = await fetch(`/api/xtream?${qs}`);
        const data = await res.json();

        if (!res.ok || data.errors) {
          throw new Error(data.message || 'Falha na autenticação.');
        }

        const session = {
          server: normalized,
          username: username.trim(),
          password: password.trim(),
          userInfo: data.user_info,
        };
        saveSession(session);
        onLogin(session);
      } catch (err) {
        setError(err.message === 'Failed to fetch'
          ? 'Sem conexão com o servidor. Verifique a URL.'
          : err.message);
      } finally {
        setLoading(false);
      }
    },
    [server, username, password, onLogin]
  );

  // Navegação D-Pad entre os campos + Enter para enviar
  const onKeyDown = (e, nextRef) => {
    if (e.key === 'ArrowDown' && nextRef?.current) {
      e.preventDefault();
      nextRef.current.focus();
    } else if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>📺 TV IPTV Player</h1>
        <p className="subtitle">
          Conecte-se ao seu painel Xtream Codes (compatible com OTT Navigator / XCIPTV)
        </p>

        <div className="field">
          <label htmlFor="server">Server URL</label>
          <input
            id="server"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoFocus
            placeholder="http://servidor.com:8080"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            onKeyDown={(e) => onKeyDown(e, userInput)}
          />
        </div>

        <div className="field">
          <label htmlFor="user">Usuário</label>
          <input
            id="user"
            ref={userInput}
            type="text"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => onKeyDown(e, passInput)}
          />
        </div>

        <div className="field">
          <label htmlFor="pass">Senha</label>
          <input
            id="pass"
            ref={passInput}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => onKeyDown(e, null)}
          />
        </div>

        <button className="btn btn-block" type="submit" disabled={loading}>
          {loading ? 'Verificando…' : 'Entrar'}
        </button>

        {error && <div className="login-error">⚠️ {error}</div>}
      </form>
    </div>
  );
}
