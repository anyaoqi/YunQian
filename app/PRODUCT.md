# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- 主要用户:开发者本人,单机部署、日常真实使用;UI 重构首先服务其真实工作流。
- 第二受众(已确认的近期方向):开源社区与其他自部署用户,新用户首次体验(空状态引导、书签导入流程)需兼顾。
- 文档画像(目标人群):开发者/技术研究者、内容创作者/学生、重度书签用户(数千条浏览器书签待迁移)。

## Product Purpose

云签是跨浏览器的书签汇集与链接导航工具:「网址导航 + 知识库」双形态——对外是一眼可达的导航面板,对内是可检索、可注释、可复用的个人收藏库。成功指标(文档既有):常用站点 2 秒内点开;≥1000 条书签导入 < 3s;单条收藏平均操作 < 5s。

## Positioning

对比 Raindrop.io / Toby / Pocket / 浏览器原生书签,三点差异化:

1. 数据自主 + 零门槛部署:自托管、单文件 SQLite,可备份可迁移,无订阅。
2. 导航面板形态:不是「稍后读」清单,而是替代新标签页的日常入口。
3. AI 原生预留:架构层预留语义检索与自动打标(embedding / content_snapshot 表)。

## Operating Context

- 典型流程:用户从 Chrome/Edge/Firefox/Safari 导出 Netscape bookmarks.html 导入(保留文件夹层级与 TAGS);另支持 Raindrop CSV、Toby JSON、Pocket HTML;导出 JSON 备份或可回导浏览器的 HTML。
- 本地优先:无注册、无云服务,数据在本机 SQLite(app/data/yunqian.db,WAL 模式,gitignore)。
- 当前无登录鉴权,README 明确警告勿直接暴露公网;已通过 Docker + Railway 部署验证。
- 中文界面;标签输入支持中文逗号、英文逗号或换行分隔。

## Capabilities and Constraints

- v0.1.0 功能:书签增删改查、星标、访问计数、分页、四种排序;树形集合(无限层级);跨集合标签;关键词/集合/标签/星标交叉筛选;批量操作;回收站;标题与封面抓取;响应式;深色模式。
- 技术约束:Node ≥ 22.5(内置 node:sqlite)、Next.js 15 App Router(standalone 输出)、React 19、TypeScript、pnpm workspace。
- 已确认的近期边界:分享页(SSR)与多用户体系即将引入——UI 重构需为其预留入口与信息架构空间。
- 无鉴权是当前事实而非永久承诺;用户体系属路线图近期目标。

## Brand Commitments

- 名称:云签 / YunQian。中文界面语言。

## Evidence on Hand

- 产品与规划文档:`docs/00-vision.md`(愿景与竞品)、`docs/01-prd.md`(PRD)、`docs/05-roadmap.md`(路线图)等 `docs/` 全系列。
- 重构前视觉基线:`docs/ui-baseline/01–06`(浅色/深色/列表/集合/添加弹窗/移动端,2026-08-15 截取)。
- 无真实用户证言、案例、数据;未来工作不得虚构此类内容。

## Product Principles

1. 导航优先(已确认):当「导航面板密度/速度」与「知识库组织深度」冲突时,导航优先。
2. 数据自主:本地优先、单文件数据库、零订阅零锁定是一切设计的前提约束。
3. 组织自由:集合树 + 标签双轴、多维交叉筛选是核心交互资产。
4. 兼顾首访:面向开源推广,空状态与导入引导属于产品体验,不是附属品。
5. 为演进留位:分享页与多用户即将到来,布局与导航信息架构需预留扩展点。
