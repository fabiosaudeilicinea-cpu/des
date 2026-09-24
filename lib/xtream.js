// lib/xtream.js — Helpers compartilhados (client + server) p/ Xtream Codes

/** Normaliza a URL do servidor digitada pelo usuário. */
export function normalizeServerUrl(input) {
  let url = (input || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  // remove trailing slash e qualquer path acidental
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Monta a URL Xtream "live" canônica: http(s)://host:port/live/user/pass/.m3u8 */
export function buildStreamUrl(server, username, password, streamId) {
  const base = server.replace(/\/+$/, '');
  return `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.m3u8`;
}

/** Lê as credenciais salvas no cliente (localStorage). */
export function loadSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('xtream_session');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.server && s.username && s.password) return s;
    return null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    window.localStorage.setItem('xtream_session', JSON.stringify(session));
  } catch {}
}

export function clearSession() {
  try {
    window.localStorage.removeItem('xtream_session');
  } catch {}
}
