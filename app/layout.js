import './globals.css';

export const metadata = {
  title: 'TV IPTV Player',
  description:
    'Reprodutor de IPTV (Xtream Codes) otimizado para Smart TV e Android TV Box. Navegação por controle remoto, PWA instalável.',
  applicationName: 'TV IPTV Player',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'IPTV TV',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b0f17',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Meta tags extras para WebView/Android TV (TWA) */}
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" href="/icons/icon-192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
