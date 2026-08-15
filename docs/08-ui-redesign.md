# 08 · UI 系统重构设计 —「星航图」

> 版本:v0.2.0 · 状态:已批准,实施中 · 基线对照:`docs/ui-baseline/01–06`(2026-08-15 截取的重构前状态)
>
> 决策方式:从「重度书签用户的真实世界」推导出四个候选视觉世界(藏书印 / 星航图 / 老式管理器 / 现代工具风),经用户确认锁定 **星航图**。约束:保留「侧栏 + 工具栏 + 三视图」信息架构,浅色优先打磨,数据层与 API 零改动。

---

## 1. 方向合同(实施与验收的最高依据)

**THESIS** — 云签的首页不是「快捷方式面板」而是一张星图:高频站点按访问量呈现为不同星等的亮星,集合是星座,标签是星表编号。浅色模式是白昼的工程坐标纸(制图员的桌面),深色模式是真正的夜空。拒绝的行业默认:紫灰渐变工具面板 + 白卡片 + emoji 图标。

**OWN-WORLD** — 拿掉全部内容也能认出这是云签:青灰坐标纸底 + 24px 细网格、信号橙作为唯一强调色、星座青蓝只作结构与连线色、mono 图表标注层(计数/日期/域名全部 `tabular-uns`)、1px 发丝线边框纪律、仪表级小圆角。深色模式是蓝黑夜空,发光只允许出现在数据星点本身,chrome 零发光。

**STORY** — 用户打开云签,一眼看到的是自己的高频站点按亮度排布的星图;星越亮=越常用,2 秒内点开它。往下是「观测日志」式的最近添加。侧栏是星表图例(集合树),搜索是星表检索。

**FIRST VIEWPORT** — 首页第一屏:顶部仪表工具条(搜索/排序/视图切换/添加),下方「高频站点」星图面板——12 枚星等磁贴按访问次数递减亮度渐次点亮,磁贴为 favicon + 名称 + mono 计数戳记;其后是「最近添加」观测日志列表。主操作「添加书签」位于工具条右端,信号橙实心按钮。

**FORM** — 星航图(候选名单第 2 位,用户确认锁定;签名为 `starchart/operate/light-first`)。

**FINISH** — 未审查与未文档化的交付不算完成:本次重构以截图审查(浅/深 × 桌面/移动)、缺陷修复批次、DESIGN.md 设计系统文档化为收尾。

---

## 2. 色彩系统

策略:**克制型**(中性底 + 单强调色)。星座青蓝只承担结构与连线,不与信号橙竞争。色彩随主题切换的是「场景」而非简单反色——浅色是坐标纸,深色是夜空。

### 2.1 浅色 · 工程坐标纸(优先打磨)

| Token | 值 | 用途 |
|---|---|---|
| `--bg-page` | `#EDF0EE` | 页面底:青灰纸 + 24px 细网格线(rgba(27,40,53,.045)) |
| `--bg-card` | `#F8FAF8` | 卡面,微亮于纸面 |
| `--text-main` | `#1B2735` | 墨蓝正文 |
| `--text-muted` | `#5A6B7A` | 次要文字 |
| `--accent` | `#D9480F` | 信号橙·唯一强调色(文字级,≥4.5:1) |
| `--accent-mark` | `#E8590C` | 信号橙·标记级(图形元素) |
| `--line` | `#2F6F8F` | 星座青蓝:连线、结构、链接 hover |
| `--danger` | `#C2372F` | 危险操作 |

### 2.2 深色 · 夜空(同步完整交付)

| Token | 值 | 用途 |
|---|---|---|
| `--bg-page` | `#0A0F1C` | 夜空蓝黑 |
| `--bg-card` | `#101827` | 卡面,亮度分层而非阴影 |
| `--text-main` | `#E6EDF5` | 星白 |
| `--text-muted` | `#8A99AC` | 次要 |
| `--accent` | `#D9A441` | 星金·唯一强调色 |
| `--line` | `#6EC6B8` | 青:星座连线 |

### 2.3 色彩纪律

- 发光仅允许出现在深色首页最亮的 1 等星(数据星点)上;浅色模式零发光。
- 所有正文/占位文字对比度 ≥4.5:1,大字号 ≥3:1;实施时逐对校准。
- 次要文字在彩色底上从该色相加色衍生,禁用纯灰。
- 浏览器原生表面全部纳入主题:文字选区、光标、滚动条、焦点环、下划线偏移、表格数字。

---

## 3. 排版系统

| 层 | 字体 | 用途 |
|---|---|---|
| 中文正文 | 系统栈:`PingFang SC, HarmonyOS Sans SC, MiSans, Microsoft YaHei` | 不加载中文 webfont(体积/速度) |
| 拉丁显示 | Barlow 或 Archivo(DIN/制图系 grotesk,实施二选一定稿) | 品牌、标题拉丁部分;经 `next/font` 构建期拉取、运行时自托管 |
| Mono 标注 | Azeret Mono | 数字、计数、日期、URL、图例标签——星图的「图例签名」 |

- 字号:正文 14px / 次要 13px / meta·mono 12px / mono 标注下限 11px;h1 22–24px(修正现状 10–13px 对中文过小的问题)。
- 数字一律 mono + `font-variant-numeric: tabular-nums`。
- 圆角:chip 3px / 控件 5px / 卡面 6px——仪表级收紧,拒绝大圆角卡片。
- 阴影纪律:浅色仅卡面一级轻阴影(带偏移+柔化);深色不靠阴影,靠亮度分层 + 发丝线。
- **修复现状问题**:Google Fonts `@import`(国内被墙、渲染阻塞)→ `next/font` 自托管;构建机拉取失败则 vendor woff2 入库走 `next/font/local`。

## 4. 图标体系

- 全量替换 Unicode 字符 + emoji 混搭 → **lucide-react**,统一尺寸(14/16/20px)与线宽(1.5)。
- 图标语义映射:全部书签=Compass、星标=Star、未分类=CircleDashed、回收站=Trash2、搜索=Search、添加=Plus、导入=Upload、导出=Download、主题=Moon/Sun、排序=ArrowUpDown、视图=Home/List/Grid。
- favicon 保持真实站点图标(操作识别优先),容器统一为圆形星框。

## 5. 动效语法(motion 库编排)

- 时长三档:120ms 微交互 / 200ms 标准 / 320ms 场景;缓动统一 `cubic-bezier(0.2, 0, 0, 1)`(token 化)。
- **签名动效·星点点亮**:首页加载时星等磁贴按访问量排序渐次点亮(opacity + scale,stagger 60–80ms)——全站唯一的大型编排时刻,不散射到其他区块。
- 星座连线:hover 亮星用 SVG `stroke-dashoffset` 画出同集合连线(仅首页星图区)。
- 视图切换 crossfade + 轻微 y 位移;对话框 scale 0.98→1 + fade(AnimatePresence 进出场);列表增删 layout 动画;拖拽入集合时目标呈「引力高亮」。
- 全部动效尊重 `prefers-reduced-motion`;内容默认可见,入场动效不阻断首屏。

## 6. 交互升级(保留架构内的形态重设计)

| 升级 | 说明 |
|---|---|
| ⌘K 命令面板 | 服务「2 秒可达」:模糊搜书签(标题/URL/标签)+ 快捷动作(添加、切主题、跳集合);复用现有搜索 API |
| 侧栏可折叠 | 桌面端可收窄为图标栏;底部为分享页/多用户预留入口位 |
| 原生对话框清除 | `window.prompt`(新建分类)→ 内联对话框;全部 `window.confirm` → ConfirmDialog |
| Toast 反馈 | 删除/恢复/导入等操作结果轻提示,替代静默刷新 |
| 快捷键保留 | n / / / e / Delete / g+数字 全部保留生效 |

## 7. CSS 架构与组件改造

**CSS**:保持 vanilla CSS + CSS 变量体系(不迁 Tailwind)。`globals.css`(394 行单文件)拆分为分层文件:

```
app/app/styles/
├── tokens.css      # 色/字/距/角/影/动效 token,浅深双主题
├── base.css        # reset、排版、焦点环、选区、滚动条、网格底纹
└── components/     # shell / views / dialogs / primitives 分组
```

**组件**:改造 15 个现有(Sidebar 星表图例式集合树、Toolbar 仪表条、HomePanel 星图签名面板、BookmarkList 工程表格、GridView 观测卡、5 个对话框、BatchActionBar、TrashList、Favicon 星框、ThemeToggle、Logo);新增 CommandPalette、Toast、ConfirmDialog、StarMark(星等组件)。

**技术债务一并修复**:

1. 深色主题首帧闪白 → layout `<head>` 内联防闪烁脚本(pre-paint 读 localStorage 设 `data-theme`)
2. `themeColor: '#d97757'` 遗留错误值 → 按主题双色 media 配置
3. 4 处未定义死 class(`.trash-view`、`.tag-edit-panel`、`.muted`、`.breadcrumb-step`)→ 补齐或清除
4. `.eyebrow`(kicker 式小标签)按工艺底线移除——标题自持重量

## 8. 实施阶段与检查点

| 阶段 | 内容 | 检查点 |
|---|---|---|
| 1 地基 | 依赖(lucide-react + motion)、tokens/base CSS、字体、防闪烁、图标 | 应用启动无回归 |
| 2 骨架 | Sidebar + Toolbar + App 壳 | 浅色桌面截图 |
| 3 签名面 | HomePanel 星图(星等磁贴 + 星座 hover + 观测日志) | 对照 FIRST VIEWPORT 合同截图自查 |
| 4 数据视图 | 列表/网格/分页/空状态/首访导入引导 | 桌面截图 |
| 5 对话框 | 5 个对话框 + 批量条 + 回收站 + confirm/toast 替换 | 交互回归 |
| 6 动效 | 全站 motion 编排 pass | 录屏/截图 |
| 7 响应式 | ≤850 / 640 / 520px 三档 | 移动端截图 |
| 8 收尾 | 截图审查(浅/深 × 桌面/移动)、检测器修复批次、DESIGN.md | 完成审查通过 |

验证:`pnpm typecheck` + 开发服务器截图逐阶段检查;既有功能(快捷键、拖拽、导入导出、批量、回收站)全量回归。

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 构建机(国内)拉不到 Google Fonts | vendor woff2 入库走 `next/font/local` |
| 深色星图滑向「霓虹发光」AI 俗相 | 发光严格限定数据星点,chrome 零发光 |
| 星图语言压过操作密度 | 星座语言只活在首页与网格容器;数据列表始终保持表格可读(导航优先原则) |
| 复古图表风在 1000+ 书签密度下失效 | 列表视图以密度优先,装饰元素在长列表中退位 |

## 10. 不变项

- `lib/`(api client / 类型 / 服务端数据层)、全部 API 路由、SQLite 数据结构与存量数据。
- 信息架构:侧栏(导航/集合树/标签)+ 工具栏(搜索/排序/视图/导入导出)+ 三视图(home/list/grid)。
- `docs/ui-baseline/` 保留为重构前「before」存档,供对照。
