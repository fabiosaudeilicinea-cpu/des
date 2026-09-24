/* =========================================================
   app/api/stream/route.js — Proxy de streaming (m3u8 / ts)
   - Evita CORS no hls.js: o player aponta para
     /api/stream?server=...&path=/live/user/pass/12345.m3u8
   - Reescreve URIs RELATIVAS dos segmentos dentro do master/media
     playlist para continuarem passando por este proxy.
   - Para conteúdo .ts binário, repassa o stream diretamente.
   ========================================================= */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA = 'Mozilla/5.0 (TVPWA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function bad(message, status = 400) {
  return new Response(message, { status });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const serverRaw = searchParams.get('server');
  const path = searchParams.get('path'); // ex.: /live/user/pass/1234.m3u8

  if (!serverRaw || !path) return bad('Parâmetros "server" e "path" são obrigatórios.');

  let base;
  try {
    base = new URL(serverRaw);
  } catch {
    return bad('URL do servidor inválida.');
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    return bad('Apenas http/https são permitidos.');
  }

  const target = `${base.protocol}//${base.host}${path.startsWith('/') ? path : '/' + path}`;

  let upstream;
  try {
    upstream = await fetch(target, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    return bad(`Falha ao acessar o stream: ${err.message}`, 502);
  }

  if (!upstream.ok) {
    return bad(`Servidor IPTV respondeu HTTP ${upstream.status}`, upstream.status === 401 ? 401 : 502);
  }

  const contentType = upstream.headers.get('content-type') || '';
  const selfOrigin = new URL(request.url).origin;

  /* ---------- Playlist HLS (texto): reescreve caminhos relativos ---------- */
  if (/mpegurl|m3u|text\/plain/i.test(contentType) || /\.(m3u8|m3u)(\?|$)/i.test(path)) {
    let text = await upstream.text();

    // Se algum servidor servir a playlist como TS binário disfarçado,
    // detectamos pelo magic number e repassamos sem parse.
    if (text.charCodeAt(0) === 0x47 && !text.startsWith('#EXTM3U')) {
      return passthrough(upstream, target);
    }

    const lines = text.split(/\r?\n/).map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        // Reescreve URIs dentro de tags como #EXT-X-STREAM-INF (sub-playlists)
        return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewriteUri(uri, target, selfOrigin)}"`);
      }
      return rewriteUri(trimmed, target, selfOrigin);
    });

    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  /* ---------- Segmentos binários (.ts etc.): repassa direto ---------- */
  return passthrough(upstream, target);
}

/** Converte uma URI (absoluta ou relativa) da playlist em URL do nosso proxy. */
function rewriteUri(uri, currentTarget, selfOrigin) {
  if (!uri) return uri;
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    try {
      const u = new URL(uri);
      // Mantém absolutas apontando para o proxy (garante CORS consistente)
      return `${selfOrigin}/api/stream?server=${encodeURIComponent(u.protocol + '//' + u.host)}&path=${encodeURIComponent(u.pathname + u.search)}`;
    } catch {
      return uri;
    }
  }
  if (uri.startsWith('/')) {
    const t = new URL(currentTarget);
    return `${selfOrigin}/api/stream?server=${encodeURIComponent(t.protocol + '//' + t.host)}&path=${encodeURIComponent(uri)}`;
  }
  // Relativa à pasta da playlist atual
  const baseDir = currentTarget.substring(0, currentTarget.lastIndexOf('/') + 1);
  const resolved = new URL(uri, baseDir);
  return `${selfOrigin}/api/stream?server=${encodeURIComponent(resolved.protocol + '//' + resolved.host)}&path=${encodeURIComponent(resolved.pathname + resolved.search)}`;
}

function passthrough(upstream, target) {
  const headers = new Headers();
  const ct = upstream.headers.get('content-type') || 'video/mp2t';
  headers.set('Content-Type', ct);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'no-store');
  const cors = new Response(upstream.body, { status: 200, headers });
  return cors;
}

/* Suporta preflight de players que enviam OPTIONS */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
