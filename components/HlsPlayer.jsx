'use client';

/* =========================================================
   components/HlsPlayer.jsx — Player HLS via hls.js
   - Recebe uma URL de playlist (normalmente /api/stream?...proxy)
   - Fallback nativo (Safari / Android TV WebView com HLS nativo)
   - Auto-play mudo (política de navegadores) + botão para habilitar som
   ========================================================= */

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

export default function HlsPlayer({ streamUrl, onStatus }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | loading | playing | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    setStatus('loading');
    setErrorMsg('');

    const report = (s) => {
      setStatus(s);
      onStatus?.(s);
    };

    // Limpa instância anterior
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const playWithUnmuteFallback = () => {
      video.play().catch(() => {
        // Alguns navegadores bloqueiam mesmo sem mute; tenta mudo novamente.
        video.muted = true;
        setMuted(true);
        video.play().catch(() => {});
      });
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 60,
        manifestLoadingTimeOut: 15000,
        manifestLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 6,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        report('playing');
        playWithUnmuteFallback();
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            setErrorMsg(`Erro de rede no stream (${data.details}). Tentando recuperar…`);
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            setErrorMsg(`Erro de mídia (${data.details}). Recuperando…`);
            hls.recoverMediaError();
            break;
          default:
            setErrorMsg('Erro fatal no stream. Tente outro canal.');
            report('error');
            hls.destroy();
            hlsRef.current = null;
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / alguns WebViews de TV: HLS nativo
      video.src = streamUrl;
      const onLoaded = () => {
        report('playing');
        playWithUnmuteFallback();
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', () => {
        setErrorMsg('Não foi possível carregar o stream.');
        report('error');
      });
    } else {
      setErrorMsg('Este navegador não suporta reprodução HLS.');
      report('error');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [streamUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted) video.play().catch(() => {});
  };

  return (
    <>
      <video
        ref={videoRef}
        playsInline
        muted={muted}
        autoPlay
        poster=""
      />

      {status === 'loading' && (
        <div className="video-placeholder" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" />
          Carregando stream…
        </div>
      )}

      {status === 'error' && (
        <div className="video-placeholder" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {muted && status === 'playing' && (
        <button
          className="hud-btn"
          onClick={toggleMute}
          style={{ position: 'absolute', bottom: 74, right: 18, zIndex: 20 }}
          aria-label="Ativar som"
        >
          🔇 Toque para ativar o som
        </button>
      )}
    </>
  );
}
