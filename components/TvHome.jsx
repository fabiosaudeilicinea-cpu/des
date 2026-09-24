'use client';

/* =========================================================
   components/TvHome.jsx — Tela principal (duas colunas)
   - Esquerda: lista de canais (focável por D-Pad)
   - Direita: player HLS + HUD
   - Atalho numérico: teclas 0-9 -> overlay -> após 1,5s troca de canal
   - Backspace cancela entrada; "Menu"/"M" alterna modo teatro; F/E mudar canal
   ========================================================= */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import HlsPlayer from './HlsPlayer';
import { buildStreamUrl } from '../lib/xtream';

const DIGIT_TIMEOUT_MS = 1500; // pausa que confirma o número do canal

export default function TvHome({ session, onLogout }) {
  const { server, username, password } = session;

  const [channels, setChannels] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [current, setCurrent] = useState(null); // canal em reprodução
  const [theater, setTheater] = useState(false); // esconde a lista
  const [digits, setDigits] = useState('');      // buffer do atalho numérico

  const digitTimer = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const logoutRef = useRef(null);

  /* ---------- Carrega a lista de canais via proxy ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      setListError('');
      try {
        const qs = new URLSearchParams({ action: 'live', server, username, password });
        const res = await fetch(`/api/xtream?${qs}`);
        const data = await res.json();
        if (!res.ok || data.errors) throw new Error(data.message || 'Falha ao carregar canais.');
        if (cancelled) return;
        // Ordena pelo número de tela quando existir
        const list = data.channels.sort((a, b) => (a.num || 0) - (b.num || 0));
        setChannels(list);
        // Reproduz o primeiro canal automaticamente (experiência TV)
        if (list.length > 0) setCurrent((c) => c ?? list[0]);
      } catch (err) {
        if (!cancelled) setListError(err.message);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
  }, [server, username, password]);

  /* ---------- URL do stream sempre via proxy anti-CORS ---------- */
  const streamUrl = useMemo(() => {
    if (!current) return null;
    const path = `/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${current.stream_id}.m3u8`;
    return `/api/stream?server=${encodeURIComponent(server)}&path=${encodeURIComponent(path)}`;
  }, [current, server, username, password]);

  /* ---------- Troca de canal por número (atalho numérico) ---------- */
  const tuneToNumber = useCallback(
    (numStr) => {
      const target = Number(numStr);
      const found =
        channels.find((c) => Number(c.num) === target) ||
        channels[target - 1]; // fallback: índice posicional
      if (found) {
        setCurrent(found);
        const el = listRef.current?.querySelector(`[data-stream-id="${found.stream_id}"]`);
        el?.scrollIntoView({ block: 'center' });
      }
    },
    [channels]
  );

  /* ---------- Listener global de teclado (controle remoto) ---------- */
  useEffect(() => {
    const handler = (e) => {
      const inTextField =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA';

      // Dígitos 0-9 (aceita também códigos de TV Boxes: Numpad etc.)
      const isDigit = /^Digit([0-9])$/.test(e.code) || /^[0-9]$/.test(e.key);
      const digitVal = isDigit ? (e.key.replace(/\D/g, '') || String(Number(e.code.slice(5)) % 10)) : null;

      if (digitVal !== null && !inTextField) {
        e.preventDefault();
        setDigits((prev) => {
          const next = (prev + digitVal).slice(0, 4);
          return next;
        });
        // Reinicia o timer de confirmação a cada dígito
        clearTimeout(digitTimer.current);
        digitTimer.current = setTimeout(() => {
          setDigits((currentBuffer) => {
            if (currentBuffer) tuneToNumber(currentBuffer);
            return '';
          });
        }, DIGIT_TIMEOUT_MS);
        return;
      }

      switch (e.key) {
        case 'Backspace':
          if (!inTextField) {
            e.preventDefault();
            clearTimeout(digitTimer.current);
            setDigits('');
          }
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          // Deixa o navegador fazer focus-navigation nativa por D-Pad.
          break;
        case 'p':
        case 'P': {
          // Canais +/- com PageUp/PageDown também são comuns em remotos
          break;
        }
        case 'PageUp':
          e.preventDefault();
          stepChannel(-1);
          break;
        case 'PageDown':
          e.preventDefault();
          stepChannel(1);
          break;
        case 'm':
        case 'M':
          setTheater((t) => !t);
          break;
        case 'Escape':
          if (theater) setTheater(false);
          else logoutRef.current?.focus();
          break;
      }
    };

    function stepChannel(dir) {
      setCurrent((cur) => {
        if (!channels.length) return cur;
        const idx = cur ? channels.findIndex((c) => c.stream_id === cur.stream_id) : -1;
        const next = Math.min(Math.max(idx + dir, 0), channels.length - 1);
        const ch = channels[next];
        listRef.current
          ?.querySelector(`[data-stream-id="${ch.stream_id}"]`)
          ?.scrollIntoView({ block: 'center' });
        return ch;
      });
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [channels, theater, tuneToNumber]);

  // Limpa timer ao desmontar
  useEffect(() => () => clearTimeout(digitTimer.current), []);

  /* ---------- Busca local na lista ---------- */
  const filtered = useMemo(() => {
    if (!search.trim()) return channels;
    const q = search.toLowerCase();
    return channels.filter((c) => c.name.toLowerCase().includes(q));
  }, [channels, search]);

  const expiresAt = session.userInfo?.exp_date
    ? new Date(Number(session.userInfo.exp_date) * 1000).toLocaleDateString('pt-BR')
    : null;

  return (
    <div className={`main-layout ${theater ? 'theater' : ''}`}>
      {/* ================= COLUNA ESQUERDA: canais ================= */}
      <aside className="channel-panel">
        <div className="panel-header">
          <h2>📡 Canais ao vivo ({channels.length})</h2>
          <input
            ref={searchRef}
            className="search-input"
            type="text"
            placeholder="Buscar canal… (↑ para voltar à lista)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                listRef.current?.querySelector('.channel-item')?.focus();
              }
            }}
          />
        </div>

        <div className="channel-list" ref={listRef} role="listbox" aria-label="Lista de canais">
          {loadingList && (
            <div className="video-placeholder">
              <div className="spinner" />
              Carregando grade de canais…
            </div>
          )}
          {listError && <div className="login-error">⚠️ {listError}</div>}
          {!loadingList &&
            filtered.map((ch) => (
              <button
                key={ch.stream_id}
                data-stream-id={ch.stream_id}
                className={`channel-item ${current?.stream_id === ch.stream_id ? 'active' : ''}`}
                onClick={() => setCurrent(ch)}
                role="option"
                aria-selected={current?.stream_id === ch.stream_id}
              >
                <span className="channel-num">{ch.num}</span>
                {ch.stream_icon ? (
                  // Logos IPTV geralmente não têm CORS liberado: usamos <img> direto
                  // (imagens não sofrem bloqueio CORS de leitura no <img>).
                  <img className="channel-logo" src={ch.stream_icon} alt="" loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <span className="channel-logo" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>📺</span>
                )}
                <span className="channel-name">{ch.name}</span>
              </button>
            ))}
        </div>
      </aside>

      {/* ================= COLUNA DIREITA: player ================= */}
      <main className="player-area">
        <div className="video-wrap">
          {streamUrl ? (
            <HlsPlayer streamUrl={streamUrl} />
          ) : (
            <div className="video-placeholder">
              Selecione um canal ou digite o número pelo controle remoto.
            </div>
          )}

          {/* Overlay do atalho numérico */}
          {digits && <div className="number-overlay">{digits}</div>}
        </div>

        <footer className="player-hud">
          <div className="now-playing">
            {current ? (
              <>
                <div className="np-title">
                  <span className="live-dot" /> AO VIVO · {current.num} — {current.name}
                </div>
                <div className="np-sub">
                  {username} · expira em {expiresAt || '—'}
                </div>
              </>
            ) : (
              <div className="np-title">Nenhum canal sintonizado</div>
            )}
          </div>

          <button className="hud-btn" onClick={() => setTheater((t) => !t)}>
            {theater ? '☰ Mostrar lista' : '⛶ Tela cheia (M)'}
          </button>
          <button
            className="hud-btn"
            ref={logoutRef}
            onClick={onLogout}
            title="Encerra a sessão e volta para o login"
          >
            ⏻ Sair
          </button>
        </footer>
      </main>
    </div>
  );
}
