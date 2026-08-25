import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const barlow = localFont({
  src: [
    { path: './fonts/barlow-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/barlow-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/barlow-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/barlow-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-barlow',
  display: 'swap',
  // OFL 1.1,Jeremy Tribby;文件与许可记录见 app/fonts/README.md
});

const azeretMono = localFont({
  src: [
    { path: './fonts/azeret-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/azeret-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-azeret',
  display: 'swap',
  // OFL 1.1,Martin Vácha & Daniel Quisek(Displaay);见 app/fonts/README.md
});

export const metadata: Metadata = {
  title: '云签 · 书签导航',
  description: '云签 YunQian - 跨浏览器书签汇集与链接导航',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#edf0ee' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f1c' },
  ],
};

import { Providers } from './Providers';

// 首帧防闪烁:paint 前从 localStorage / 系统偏好解析主题,写入 data-theme
const themeBootstrap = `(function(){try{var t=localStorage.getItem('yunqian:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${barlow.variable} ${azeretMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <div
          dangerouslySetInnerHTML={{
            __html: '<!-- yunqian/starchart v0.2.0: direction contract in docs/08-ui-redesign.md -->',
          }}
        />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
