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
        {/* 云签 · 星航图 方向合同(docs/08-ui-redesign.md)
            THESIS:首页是一张星图——高频站点按访问量呈不同星等,分类是星座,标签是星表编号;浅色=白昼工程坐标纸,深色=夜空。拒绝紫灰工具面板+白卡片默认。
            OWN-WORLD:青灰坐标纸+24px细网格、信号橙唯一强调、星座青蓝只作连线、mono图表标注层、1px发丝线、仪表级小圆角;深色发光只在数据星点。
            STORY:用户一眼看到自己的星图,星越亮越常用,2秒点开;往下是观测日志式最近添加;侧栏是星表图例。
            FIRST VIEWPORT:仪表工具条→高频站点星等磁贴渐次点亮(favicon+名称+mono计数)→最近添加观测日志;主操作「添加书签」信号橙按钮居工具条右端。
            FORM:星航图 starchart/operate/light-first。
            FINISH:未审查与未文档化的交付不算完成——以截图审查、修复批次与 DESIGN.md 收尾。 */}
        <div
          dangerouslySetInnerHTML={{
            __html: '<!-- yunqian/starchart v0.2.0: direction contract in docs/08-ui-redesign.md -->',
          }}
        />
        {children}
      </body>
    </html>
  );
}
