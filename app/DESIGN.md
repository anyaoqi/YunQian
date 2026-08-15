# 云签 · DESIGN.md — 星航图设计系统

> 从 v0.2.0 UI 重构建成的代码记录(ground truth over intention)。
> 方向决策过程与完整规范背景见 `docs/08-ui-redesign.md`;重构前旧界面存档见 `docs/ui-baseline/`。
> 本文是后续新界面(分享页、多用户、设置页等)必须遵循的视觉契约。

## 一句话世界

整个应用是一张图纸:浅色是白昼的**工程坐标纸**(制图员的桌面),深色是**夜空星图**。高频站点是星,访问次数是星等,集合是星座,标签与计数是 mono 图例标注。

## Token 体系

唯一来源:`app/app/styles/tokens.css`。改设计先改 token,禁止在组件里写裸色值。

### 色彩(浅色 · 坐标纸 / 深色 · 夜空)

| Token | 浅色 | 深色 | 语义 |
|---|---|---|---|
| `--bg-page` | `#edf0ee` | `#0a0f1c` | 页面底,叠 24px 网格(`--grid-minor`/`--grid-major`,每 5 格主线) |
| `--bg-card` | `#f8faf8` | `#101827` | 卡面/列表面板,微亮于纸面;深色靠亮度分层,不靠阴影 |
| `--bg-inset` | `#e7ebe8` | `#0c1322` | 输入框、favicon 框、分类行等内嵌面 |
| `--text-main` | `#1b2735` | `#e6edf5` | 正文(墨蓝 / 星白) |
| `--text-muted` | `#56687a` | `#93a3b4` | 次要文字 |
| `--text-faint` | `#6b7e93` | `#7c90a6` | 仅 mono 图例标注,不承载正文 |
| `--accent` | `#c2410c` | `#d9a441` | **唯一强调色**:信号橙 / 星金。主按钮、激活态、选中态 |
| `--accent-mark` | `#e8590c` | `#e5b45a` | 图形标记级强调(边框、焦点环、星等环) |
| `--line` | `#2f6f8f` | `#6ec6b8` | 星座青蓝:连线、链接 hover、结构性点缀,**不与强调色竞争** |
| `--hairline` | `rgba(27,40,53,.14)` | `rgba(230,237,245,.12)` | 1px 发丝线,全站边框纪律 |
| `--danger` | `#c2372f` | `#ff6b5e` | 危险操作 |
| `--star-gold` | `#b9821f` | `#d9a441` | 星标图标专用 |

纪律:发光只允许出现在深色首页的数据星点(1 等星 `box-shadow: 0 0 20px rgba(217,164,65,.5)`),chrome 永不发光;浅色零发光。彩色底上的次要文字从色相衍生,不用纯灰。

### 排版

- `--font-sans`:Barlow(自托管 latin 400–700,`next/font/local`,变量 `--font-barlow`)→ 中文系统栈(PingFang SC → HarmonyOS Sans SC → MiSans → Microsoft YaHei)。所有拉丁字符自动获得 DIN 系制图气质
- `--font-mono`:Azeret Mono(`--font-azeret`)→ 系统等宽。**所有数字**走 mono + `tabular-nums`(计数、日期、域名、分页、标签计数)
- 字号:`--text-xs` 11(mono 专用)/`--text-sm` 12(meta)/`--text-base` 13/`--text-body` 14(正文,中文下限)/`--text-md` 15(列表标题)/`--text-lg` 17/`--text-xl` 20(对话框标题)/`--text-2xl` 24(页面 h1)
- 字体文件与许可:`app/app/fonts/`(OFL 1.1,README 同目录)。**禁止**引入 Google Fonts 远程 @import(国内不可达,曾是旧版缺陷)

### 度量

- 圆角:chip `3px` / 控件 `5px`(`--radius-ctl`)/ 卡面 `6px`。仪表级收紧,永不大圆角
- 间距:`--space-1..12` = 4px 网格
- 阴影:浅色仅卡面一级(`--shadow-card`,带偏移+柔化)与浮层(`--shadow-raised`/`--shadow-modal`);深色 shadow 退化为 1px 亮度线
- 焦点环:`--focus-ring` = 3px 橙/金 25% 透明环,全站统一

### 动效

- 三档时长 `--dur-fast/base/slow` = 120/200/320ms;统一缓动 `--ease: cubic-bezier(0.2,0,0,1)`
- **签名时刻**(每页只此一处大编排):首页星等磁贴按序渐次点亮(motion stagger 50ms,opacity+scale 0.88→1)
- 星座线:hover 同集合磁贴 → SVG `<line>` 以 `stroke-dashoffset` 画出青蓝连线,无关磁贴压暗至 0.45
- 模态:backdrop fade 160ms + 面板 scale 0.98→1 + y 8→0(motion AnimatePresence,含退场)
- 视图切换:mode="wait" crossfade + y 位移 180ms
- 全部尊重 `prefers-reduced-motion`(base.css 全局短路 + useReducedMotion)

## 组件语言

- **图标**:lucide-react,统一 1.8 stroke / 15px。语义:全部书签=Compass、星标=Star、未分类=CircleDashed、回收站=Trash2、星图首页=House、列表=List、网格=LayoutGrid、空态=Telescope。**禁止** emoji/Unicode 字符做系统图标(用户数据里的自定义集合 emoji属内容,允许)
- **favicon 容器**:列表/日志=方形发丝线框(`--radius-chip`);首页星等=圆框,星等映射 rank 1-2→`mag-1`(50px+2px 橙环+深色光晕)/3-5→`mag-2`/6-9→`mag-3`/10+→`mag-4`
- **chip**:1px 发丝线 + 卡面底 + 12px 文字;可点击 chip hover 变青蓝;tag-dot 是 45° 旋转小方钻
- **按钮**:primary=强调色实心 / secondary=卡面+发丝线 / ghost=透明 hover 橙软底 / danger=橙线框 hover 填充。图标 15px 居左
- **列表**(工程表):`--bg-card` 面板 + 行间发丝线;书签行 = checkbox + favicon 框 + 标题(15/600,hover 青蓝下划线 offset 3px)+ mono 域名 + 摘要 + chip 行 + mono 日期/访问数;操作按钮 hover 显现
- **对话框**:统一 `ui/Modal` 壳(右上角关闭、Esc、背景滚动锁、点遮罩关闭),表单字段 label 上置 12px 600 muted
- **命令面板**(Ctrl/⌘+K):`cmdk-*` 系,顶部对齐 12vh,分组 书签/集合/操作,mono 快捷键提示脚注
- **空态**:虚线圆框 Telescope 图标 + 标题 + 说明 + 主/次双动作(导入优先——首访引导是产品体验)
- **toast**:底部居中,success 图标青蓝/error 红框
- 浏览器表面:选区=橙/金 22-30%、滚动条=细式 thumb、光标与数字已 tabular 化——新界面必须延续

## 布局骨架

- `.app-shell`:248px 侧栏 + 内容(max 1560px 居中);侧栏可折叠至 56px(图标列,`yunqian:sidebar-collapsed` 持久化)
- 侧栏(星表图例):品牌行(logo+云签+YUNQIAN mono 标)→ 主导航四项(Compass/Star/CircleDashed/Trash2,激活=强调色实心)→ 集合树(折叠三角+缩进+mono 计数)→ 标签区(色钻+计数)→ 底部「本地优先」注脚(此处为分享/多用户预留扩展位)
- 工具栏(仪表条):搜索框(内嵌 `/` 聚焦提示与 `Ctrl K` 命令面板按钮)→ 排序 → 视图分段 → 导入 → 导出组(HTML|导出)→ 主题开关 → 添加书签(强调色)
- 内容头:面包屑 + h1(24px)+ mono 计数;**星图首页隐藏内容头**(工具条+星图即整页)
- 移动端 ≤850px:侧栏转为顶部块(主导航 4 列图标栅),集合/标签区隐藏;≤520px 单列网格、动作常显

## 主题机制

`html[data-theme="light|dark"]` 切换 token;`app/app/layout.tsx` 内联 bootstrap 脚本在首帧前从 `localStorage('yunqian:theme')`/系统偏好写入 data-theme(**防闪白**,新页面禁止在 React effect 里才设主题)。图标由 CSS 按 data-theme 切换,避免水合闪烁。

## 禁止事项(防退化)

1. 紫色系、渐变文字、玻璃拟态装饰、发光 chrome、大圆角卡片、emoji 图标
2. 正文/占位文字用 `--text-faint`;faint 只给 mono 图例
3. 在组件里写裸 hex;一切过 token
4. kicker/eyebrow 小标签(标题自持重量)
5. 远程字体 CDN;字体一律自托管
6. `window.prompt/confirm`(用 `ui/ConfirmDialog` 与 `ui/Modal`)

## 文件地图

```
app/app/styles/tokens.css          # 全部 token(浅/深)
app/app/styles/base.css            # reset、网格底纹、浏览器表面、reduced-motion
app/app/styles/components/primitives.css   # 按钮/输入/chip/模态壳/toast/右键菜单/kbd
app/app/styles/components/shell.css        # app-shell/侧栏/工具栏/内容头/命令面板
app/app/styles/components/views.css        # 首页星图/日志/列表/网格/批量条/回收站
app/app/styles/components/dialogs.css      # 表单细节/导入/标签管理/确认框/响应式
app/app/fonts/                     # Barlow + Azeret Mono(woff2 + 许可说明)
app/components/ui/                 # Modal / Toast / ConfirmDialog 原语
```
