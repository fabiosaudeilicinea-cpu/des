# 📺 TV IPTV Player — PWA Xtream Codes para Smart TV / Android TV Box

Reprodutor de IPTV inspirado em **OTT Navigator** e **XCIPTV**, construído com
**Next.js 14 (App Router)** + **hls.js**, empacotável como **PWA** e convertível
em **APK (TWA)** via **PWA Builder**. Navegação completa por controle remoto
(D-Pad + atalho numérico de canais).

---

## 1. Estrutura de arquivos

```
tv-iptv-player/
├── package.json              # deps: next, react, hls.js
├── next.config.mjs
├── public/
│   ├── manifest.json         # PWA: fullscreen, landscape, ícones any/maskable + banner 16:9
│   ├── sw.js                 # Service Worker (app-shell cache-first; nunca cacheia /api/* nem streams)
│   └── icons/                # icon-192, icon-512, maskable-512, tv-banner-16x9
├── app/
│   ├── layout.js             # metadados, <link manifest>, viewport p/ TV
│   ├── page.js               # roteador Login ↔ Home + registro do Service Worker
│   ├── globals.css           # tema escuro "10-foot UI", anéis de :focus para D-Pad
│   └── api/
│       ├── xtream/route.js   # proxy anti-CORS da API Xtream (authenticate/live/categories/userinfo)
│       └── stream/route.js   # proxy de vídeo (.m3u8 reescrito / .ts repassado)
├── components/
│   ├── LoginScreen.jsx       # Server URL / Usuário / Senha
│   ├── TvHome.jsx            # layout 2 colunas + atalho numérico + HUD
│   └── HlsPlayer.jsx         # player hls.js com fallback nativo (Safari/WebView)
└── lib/xtream.js             # helpers (normalização de URL, sessão em localStorage)
```

### Como cada requisito foi atendido

| Requisito | Onde |
|---|---|
| Manifest TV (`fullscreen`, `landscape`) | `public/manifest.json` (`display_override`, `orientation`, screenshots `form_factor: wide`) |
| Service Worker funcional | `public/sw.js` + registro em `app/page.js` |
| Login Xtream | `components/LoginScreen.jsx` → `GET /api/xtream?action=authenticate` |
| Resolução de CORS (API) | `app/api/xtream/route.js` (Node runtime, serverless na Vercel) |
| Resolução de CORS (vídeo) | `app/api/stream/route.js` — reescreve URIs relativas/absolutas das playlists para continuarem no proxy; segmentos `.ts` são repassados binários com `Access-Control-Allow-Origin: *` |
| Foco D-Pad | `globals.css`: `:focus-visible` com anel amarelo 4px + zoom 1.03 + sombra (visível a 3 m) |
| Atalho numérico (0-9 + overlay + 1,5 s) | `TvHome.jsx`: listener global `keydown`, buffer `digits`, overlay `.number-overlay`, `setTimeout(1500)` → `tuneToNumber()` |
| Player HLS | `HlsPlayer.jsx` (`hls.js`, auto-play mudo, recuperação de erros NETWORK/MEDIA, fallback HLS nativo) |
| Layout 2 colunas + tela cheia | `TvHome.jsx` (lista à esquerda / player à direita; tecla **M** ou botão alterna modo teatro) |

### Atalhos de controle remoto

| Tecla | Ação |
|---|---|
| `0-9` | Digitar número do canal → overlay → sintoniza após 1,5 s de inatividade |
| `Backspace` | Cancela a entrada numérica |
| `↑ ↓ ← →` | Navegação D-Pad pela lista/botões (focus nativo do navegador) |
| `PageUp / PageDown` | Canal anterior / próximo |
| `M` | Alternar lista lateral (modo tela cheia) |
| `Enter` | Confirmar (login / abrir canal focado) |
| `Esc` | Sai do modo teatro / foca o botão Sair |

### Variável de ambiente (opcional)

- `XTREAM_ALLOWED_HOSTS` — lista separada por vírgulas de hosts permitidos no
  proxy (ex.: `painel.example.com`). Em produção, IPs privados/localhost são
  bloqueados por padrão (proteção SSRF); use esta allowlist para exceções.

---

## 2. Rodando localmente

```bash
npm install
npm run dev      # http://localhost:3000
# produção local:
npm run build && npm start
```

## 3. Deploy na Vercel

1. Suba o repositório no GitHub/GitLab:
   ```bash
   git add -A && git commit -m "TV IPTV Player PWA" && git push
   ```
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
   - Framework: **Next.js** (detectado automaticamente). Build/install/start
     commands padrão — nada a configurar.
3. (Opcional) *Settings → Environment Variables*: adicione
   `XTREAM_ALLOWED_HOSTS` se quiser restringir os painéis aceitos.
4. Deploy. A Vercel serve as rotas `/api/xtream` e `/api/stream` como funções
   serverless — é isso que elimina o CORS: o navegador só fala com o seu domínio
   `*.vercel.app` (HTTPS), e o servidor IPTV conversa apenas com a função Node.
5. **Importante:** o PWA exige HTTPS (a Vercel já fornece) e o Service Worker na
   raiz (`/sw.js`), por isso ele fica em `public/` e é registrado com
   `scope: '/'`.

## 4. Empacotamento no PWA Builder (APK Android TV via TWA)

1. Acesse [pwabuilder.com](https://www.pwabuilder.com) e informe a URL da
   Vercel. O site deve pontuar bem em *Manifest* e *Service Worker*
   (ícones 192/512 + maskable e banner 16:9 já incluídos no manifest).
2. Clique em **Package for Stores → Android**.
3. Na aba **Android Options**:
   - **Host App**: escolha **TWA (Trusted Web Activity)**.
   - **Launcher Icons**: confirme os ícones detectados do manifest.
   - *(Opcional)* preencha assinatura (*Signing*): gere um keystore com
     `keytool -genkey -v -keystore tv-iptv.keystore -alias tv-iptv -keyalg RSA -keysize 2048 -validity 10000`
     e faça upload, ou use o *store signing* da Play Store.
4. **Generate Package → APK** (para testes laterais na TV Box) e/ou
   **Android Bundle (AAB)** (para Google Play).
5. Instale o APK na Android TV Box (`adb install tv-iptv.apk` ou por pendrive)
   e teste: login → lista → navegação por setas → dígitos no controle.

Dicas para TV Box:
- O modo **fullscreen** do TWA remove a barra do Chrome; o app abre como
  "nativo".
- Se a WebView da caixa não suportar `hls.js` por MSE, o player cai
  automaticamente no caminho HLS nativo (`video.canPlayType`), que funciona na
  maioria das Android TVs.
- Controle remoto Bluetooth/IR: teclas numéricas comuns (KEYCODE_0..9) chegam
  ao Chromium como eventos de teclado `0-9`, exatamente o que o listener de
  `keydown` consome.

## 5. Observações de segurança

- As credenciais ficam em `localStorage` do dispositivo (apenas para uso
  pessoal na sua TV). Não use este app como serviço multiusuário público sem
  adicionar uma camada própria de autenticação.
- O proxy de stream valida protocolo http/https e bloqueia hosts privados em
  produção (configurável via `XTREAM_ALLOWED_HOSTS`).
