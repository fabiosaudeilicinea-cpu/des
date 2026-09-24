/* =========================================================
   app/api/xtream/route.js — Proxy Serverless p/ Xtream Codes
   Resolve CORS: o navegador NUNCA fala direto com o servidor IPTV;
   todas as chamadas de API passam por esta rota (Node runtime).

   Ações suportadas (query param ?action=...):
     - authenticate : valida usuário/senha via /player_api.php
     - live         : lista de canais ao vivo (get_live_streams)
     - categories   : categorias de canais ao vivo (get_live_categories)
     - userinfo     : dados da assinatura (get_user_info)
   ========================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Aponta para um servidor específico se desejar restringir (opcional).
// Por padrão aceitamos qualquer host, pois cada usuário usa seu próprio painel.
const ALLOWED_HOSTS = (process.env.XTREAM_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

function bad(message, status = 400) {
  return Response.json({ errors: true, message }, { status });
}

/** Valida e retorna a URL base do servidor, bloqueando SSRF básico. */
function safeServer(rawServer) {
  if (!rawServer) return { error: 'Parâmetro "server" ausente.' };
  let u;
  try {
    u = new URL(rawServer);
  } catch {
    return { error: 'URL do servidor inválida.' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { error: 'Apenas http/https são permitidos.' };
  }
  // Bloqueia IPs privados/localhost (SSRF), exceto em dev.
  const host = u.hostname;
  const isPrivate =
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1)/.test(host) ||
    host === 'localhost';
  if (isPrivate && process.env.NODE_ENV === 'production' && !ALLOWED_HOSTS.includes(host)) {
    return { error: 'Servidor privado não permitido.' };
  }
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.includes(host)) {
    return { error: 'Servidor não está na allowlist.' };
  }
  return { url: `${u.protocol}//${u.host}` };
}

async function xtreamFetch(baseUrl, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${baseUrl}/player_api.php?${qs}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (TVPWA)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Servidor respondeu HTTP ${res.status}`);
  // Alguns painéis retornam content-type errado; sempre fazemos parse manual.
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Resposta do servidor não é JSON válido.');
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const serverRaw = searchParams.get('server');
  const username = searchParams.get('username');
  const password = searchParams.get('password');

  if (!username || !password) return bad('Usuário e senha são obrigatórios.');

  const checked = safeServer(serverRaw);
  if (checked.error) return bad(checked.error);
  const baseUrl = checked.url;

  try {
    switch (action) {
      /* ---------- Autenticação ---------- */
      case 'authenticate': {
        const data = await xtreamFetch(baseUrl, { username, password });
        if (!data || data.user_info?.auth != 1) {
          return bad('Credenciais inválidas para este servidor.', 401);
        }
        return Response.json({
          errors: false,
          user_info: data.user_info,
          server_info: data.server_info,
        });
      }

      /* ---------- Canais ao vivo ---------- */
      case 'live': {
        const data = await xtreamFetch(baseUrl, {
          username,
          password,
          action: 'get_live_streams',
        });
        if (!Array.isArray(data)) return bad('Servidor não retornou a lista de canais.', 502);
        // Normaliza campos usados pela UI (numeração sequencial p/ atalho numérico).
        const channels = data.map((c, i) => ({
          stream_id: c.stream_id,
          name: c.name || `Canal ${i + 1}`,
          num: c.num ?? i + 1, // número de tela (atalho do controle remoto)
          category_id: c.category_id,
          stream_icon: c.stream_icon || '',
          epg_channel_id: c.epg_channel_id || null,
        }));
        return Response.json({ errors: false, channels });
      }

      /* ---------- Categorias ---------- */
      case 'categories': {
        const data = await xtreamFetch(baseUrl, {
          username,
          password,
          action: 'get_live_categories',
        });
        return Response.json({ errors: false, categories: Array.isArray(data) ? data : [] });
      }

      /* ---------- Info do usuário / expiração ---------- */
      case 'userinfo': {
        const data = await xtreamFetch(baseUrl, {
          username,
          password,
          action: 'get_user_info',
        });
        return Response.json({ errors: false, user_info: data });
      }

      default:
        return bad(`Ação desconhecida: "${action}". Use authenticate|live|categories|userinfo.`);
    }
  } catch (err) {
    return bad(`Falha ao contatar o servidor IPTV: ${err.message}`, 502);
  }
}
