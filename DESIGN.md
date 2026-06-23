# 幻映工作台 · 前端设计规范（强制）

> **任何 UI/交互改动前必读本文件。** 本文件 = 幻映适配细则（本节）+ Warp DESIGN.md 原文（下文）。
> 与原文冲突时，以本节适配细则为准（适配决策均有用户验收记录，见 docs/ui-upgrade/08-10）。

## 幻映适配细则（2026-06-12 用户验收定版）

### 色彩（中性 re-base：Warp 的暖炭在用户屏幕读紫，经用户确认改中性灰，其余规则不变）
- 画布底 `#141414`（常显点阵：暗色 rgba(255,255,255,.025)、白昼模式纯白底 + rgba(0,0,0,.05) 黑点；间距 48px × 缩放跟随 `--hy-zoom`）
- 表面阶梯：`#1b1b1b`（一级面/PI面板/输入卡）→ `#262626`（浮层/菜单）→ 发丝线 `#2e2e2e`/`#333333`
- 文字：`#f5f5f5` 主 / `#c4c4c4` 次 / `#a8a8a8` 弱
- **无彩色 accent**（Warp 铁律）：主色 = 近白 `#f5f5f5`，选中/确认/运行均用中性系；语义色仅 danger `#f05b5b`、success `#22c98b`、warning `#f4b740`
- 禁纯黑、禁蓝紫渐变、禁绿色荧光（#b8ff37 系已清除）

### 形状与层级（严格 Warp）
- 圆角：按钮/输入 3px · 卡片/图标瓦片 4px · 大卡/浮层/节点 6px · 胶囊 999 仅限圆形图标容器与状态丸
- **禁投影**：层级 = 表面对比 + 1px 发丝线（功能性 inset 环除外，如选中环）
- 选中环：2px `#a8a8a8` 瞬时无过渡

### 字体与字重
- UI：Inter 主导（未装机回落 system/Segoe，CJK 链保留）；等宽：DM Mono > JetBrains Mono；衬线点缀：Instrument Serif italic（仅空画布副标题级别的 editorial 时刻）
- 字重只用 400/500 工作对，禁 600+ 当层级

### 按钮制度
- primary：`#f5f5f5` 底 + `#141414` 字 + 3px 圆角 + 14px/500（每个面唯一高亮）
- ghost：透明底 + 发丝边 + ink 字
- 圆形仅图标容器（提交↑钮、FAB）

### 动效
- 状态色过渡 150ms cubic-bezier(.4,0,.2,1)；浮层入场 180ms；无装饰性常驻动画

### 工程铁律
- 所有 UI 改动唯一入口：`styles/theme-upgrade.css`（[S1]-[S6] 分区，新改动开新分区）；index.html 仅增量
- 禁改：style.css 第 1 行 bundle、styles/ 死副本（layout/node-base/node-types/v2/settings/variables.css）、混淆 JS
- PI 面板注入样式用 `[class]` 抬特异性覆盖；执行抽屉双形态见 [S6.7]
- 验证：8777 真机探针（getComputedStyle）优先于截图；面板改动以 appAssistantPanel.p1Ui.test.js 全绿为门

---

# 以下为 Warp DESIGN.md 原文（getdesign.md/warp）

---
version: alpha
name: Warp-Inspired-design-analysis
description: An inspired interpretation of Warp's design language — an agentic terminal-and-development-environment brand whose surface is a warm near-charcoal canvas (a tint warmer than pure black), broken only by clean Inter typography, the occasional Instrument Serif italic moment, and dense terminal-mockup imagery; CTAs are unusually understated, with shape geometry running tighter than most marketing sites.

colors:
  primary: "#f7f5f0"
  on-primary: "#2b2622"
  ink: "#f7f5f0"
  body: "#c9c0ad"
  body-strong: "#dad2c1"
  mute: "#aea69c"
  canvas: "#2b2622"
  canvas-soft: "#383330"
  hairline: "#3f3a36"

typography:
  display-xl:
    fontFamily: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif
    fontSize: 64px
    fontWeight: 400
    lineHeight: 70.4px
    letterSpacing: -1.6px
  display-lg:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 48px
    fontWeight: 400
    lineHeight: 52.8px
    letterSpacing: -1.2px
  display-md:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 32px
    fontWeight: 500
    lineHeight: 40px
    letterSpacing: -0.8px
  display-sm:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 24px
    fontWeight: 500
    lineHeight: 32px
    letterSpacing: -0.4px
  display-serif:
    fontFamily: Instrument Serif, Georgia, "Times New Roman", serif
    fontSize: 48px
    fontWeight: 400
    lineHeight: 52px
    letterSpacing: -0.5px
  body-lg:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  body-md:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md-strong:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
  body-sm:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm-strong:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  caption:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  code:
    fontFamily: DM Mono, ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
  code-md:
    fontFamily: DM Mono, ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  button-md:
    fontFamily: Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px

rounded:
  none: 0px
  xxs: 1px
  xs: 2px
  sm: 3px
  md: 4px
  lg: 6px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 10px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  4xl: 64px
  5xl: 96px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm-strong}"
    padding: "{spacing.md} {spacing.xl}"
  nav-link:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs} {spacing.md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.lg}"
  button-secondary-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.lg}"
  button-icon-circular:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs}"
  text-input:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.md}"
  card-content:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
  card-mockup:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  download-tile:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
  press-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    padding: "{spacing.lg} 0"
  job-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md-strong}"
    padding: "{spacing.lg} 0"
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: "{spacing.5xl} {spacing.xl}"
  content-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
    padding: "{spacing.5xl} {spacing.xl}"
  partner-logo-tile:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  testimonial-card:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.xl}"
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: "{spacing.3xl} {spacing.xl}"

  # ─── Examples (illustrative) — auto-derived; resolve any TO_FILL markers below ───
  ex-pricing-tier:
    description: "Default Pricing tier card. Re-uses feature-card chrome with brand canvas-soft surface."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-pricing-tier-featured:
    description: "Featured/highlighted tier — polarity-flipped surface (dark fill + light text in light mode, light fill + dark text in dark mode)."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-product-selector:
    description: "What's Included summary card — re-purposed for SaaS / B2B verticals (NOT a literal product gallery)."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-cart-drawer:
    description: "Subscription summary — re-purposed for SaaS / B2B (line items per add-on, not literal cart)."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
    item-divider: "{colors.hairline}"
  ex-app-shell-row:
    description: "Sidebar nav row inside the App Shell example. Active state uses brand primary as the indicator."
    backgroundColor: "{colors.canvas}"
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.md}"
  ex-data-table-cell:
    description: "Default data-table th + td chrome. Header uses mono-caps eyebrow typography; body uses body-sm."
    headerBackground: "{colors.canvas-soft}"
    headerTypography: "{typography.caption}"
    bodyTypography: "{typography.body-sm}"
    cellPadding: "{spacing.sm} {spacing.md}"
    rowBorder: "{colors.hairline}"
  ex-auth-form-card:
    description: "Sign-in / sign-up card. Re-uses feature-card chrome with text-input primitives inside."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-modal-card:
    description: "Modal dialog surface — same chrome as feature-card with elevated shadow."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  ex-empty-state-card:
    description: "Empty-state illustration frame."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.lg}"
    padding: "{spacing.2xl}"
    captionTypography: "{typography.body-md}"
  ex-toast:
    description: "Toast notification surface — feature-card shape + medium shadow."
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
    typography: "{typography.body-sm}"

---


## Overview

Warp is an "agentic development environment" — a terminal application that wraps an AI agent — and its marketing site mirrors the product's posture: a single dark band running the entire page, warmer than pure black (`{colors.canvas}` `#2b2622` carries a hint of brown-beige from the brand's oklch-defined warmth value), with copy set almost entirely in Inter. The page reads more like a developer's reading-mode editor than a marketing surface.

The decoration is restrained. Two terminal screenshots open the hero (split between the two main product modes — agent + terminal). A partner-logo strip (Anthropic / OpenAI / Google / Stanford) sits below the hero on a slightly warmer tile surface. A single testimonial card with a portrait photograph. A press-coverage list. Then the page closes with download tiles for Mac / Linux / Windows. There is no gradient, no atmospheric backdrop, no illustration system.

Type is the second decisive voice. Hero display sits at 64 px Inter weight 400 with `-1.6px` tracking — restrained for a hero, deliberately quiet. The brand carries DM Mono as its monospace face for code blocks, and Instrument Serif italics occasionally appear for editorial moments. Body text is 16 px Inter at line-height 1.5, very readable.

**Key Characteristics:**
- A single primary "color" — really an off-white `{colors.primary}` (`#f7f5f0`) — that doubles as text on canvas and as the button-primary fill. There is no chromatic brand accent.
- Warm dark canvas (`{colors.canvas}` `#2b2622`) is the only page surface. The brand's defining tone is the brown-warmth, not pure black.
- Extremely tight button radii — 3 / 4 px (1 / 2× the brand's `{rounded.md}` 4 px base) — the brand never uses generous pill shapes for CTAs. Only icon containers use `{rounded.full}`.
- Inter sans + DM Mono mono is the canonical pairing. Instrument Serif appears as a third editorial face for occasional italics.
- Terminal-mockup imagery is the brand's only consistent decorative system — no gradients, no atmospheric overlays.
- A subtle warm tint runs through every neutral; even body text and dividers carry a hint of warmth rather than neutral gray.

## Colors

### Brand & Accent
- **Off White Primary** (`{colors.primary}` — `#f7f5f0`): The brand's "primary" is a warm off-white. Used as button-primary fill, as default text on canvas, as the wordmark color. There is no chromatic brand accent — the off-white IS the brand's distinguishing tone.

### Surface
- **Canvas** (`{colors.canvas}` — `#2b2622`): The warm dark page background. Resolved from `oklch(22.0% 0.004 84.6)`. Slightly browner than pure black, slightly warmer than a neutral gray — the warmth IS the brand's identity.
- **Canvas Soft** (`{colors.canvas-soft}` — `#383330`): A lighter warm-dark fill used for cards, mockup chrome, and partner-logo tiles.
- **Hairline** (`{colors.hairline}` — `#3f3a36`): 1 px solid divider on dark surfaces.

### Text
- **Ink** (`{colors.ink}` — `#f7f5f0`): Default text on canvas — same off-white as the primary, intentionally unified.
- **Body Strong** (`{colors.body-strong}` — `#dad2c1`): Mid-emphasis body text.
- **Body** (`{colors.body}` — `#c9c0ad`): Secondary body text — captions, supporting copy, press-coverage rows.
- **Mute** (`{colors.mute}` — `#aea69c`): Lowest-priority text — timestamps, fine print, footer secondary lines. Resolved from `oklch(71.5% 0.008 84.6)`.

### Semantic
The brand doesn't surface a separate error / warning / success palette in its marketing pages. Validation cues come from the unified off-white system; in-product semantic colors live in the terminal application proper.

## Typography

### Font Family
Three faces ladder the system:
1. **Inter** for every display, body, button, link, and label role. Weights 400 / 500 are the working pair. Used with the brand's "Inter Fallback" custom face as the metric-compatible system fallback.
2. **DM Mono** for terminal mockups, command snippets, and code blocks. Weight 400 only. Loaded as `--font-dm-mono`.
3. **Instrument Serif** for occasional editorial italic moments — rare on the marketing surface, but documented as a third face for emphasised tagline-style phrases. **Abel** is also loaded as a fourth fallback for headline emphasis.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 64px | 400 | 70.4px | -1.6px | Hero headline ("Warp is the agentic development environment"). |
| `{typography.display-lg}` | 48px | 400 | 52.8px | -1.2px | Section headlines. |
| `{typography.display-md}` | 32px | 500 | 40px | -0.8px | Sub-section displays. |
| `{typography.display-sm}` | 24px | 500 | 32px | -0.4px | Card titles and lead emphasis. |
| `{typography.display-serif}` | 48px | 400 | 52px | -0.5px | Instrument Serif italic editorial moments. |
| `{typography.body-lg}` | 18px | 400 | 28px | 0 | Lead paragraphs. |
| `{typography.body-md}` | 16px | 400 | 24px | 0 | Default body. |
| `{typography.body-md-strong}` | 16px | 500 | 24px | 0 | Bold inline body. |
| `{typography.body-sm}` | 14px | 400 | 20px | 0 | Secondary body. |
| `{typography.body-sm-strong}` | 14px | 500 | 20px | 0 | Nav link / button labels. |
| `{typography.caption}` | 12px | 400 | 16px | 0 | Captions, fine print. |
| `{typography.code}` | 13px | 400 | 18px | 0 | Terminal mockup body. |
| `{typography.code-md}` | 14px | 400 | 20px | 0 | Inline command snippets. |
| `{typography.button-md}` | 14px | 500 | 20px | 0 | Button labels. |

### Principles
- **Hero display at weight 400** — the brand reads as quietly confident, not as a billboard.
- **Negative tracking is part of the voice.** `-1.6 px` at 64 px hero, scaling down through display levels.
- **Inter for narrative, DM Mono for technical.** Strict role separation.

### Note on Font Substitutes
All three faces are open or freely-loadable:
- **Inter** — load directly from Google Fonts or Vercel-hosted CDN.
- **DM Mono** — open-source on Google Fonts.
- **Instrument Serif** — open-source on Google Fonts.

## Layout

### Spacing System
- **Base unit**: 4 px (with occasional 10 px and 6 px values for button padding).
- **Tokens**: `{spacing.xxs}` 2 px · `{spacing.xs}` 4 px · `{spacing.sm}` 8 px · `{spacing.md}` 10 px · `{spacing.lg}` 16 px · `{spacing.xl}` 24 px · `{spacing.2xl}` 32 px · `{spacing.3xl}` 48 px · `{spacing.4xl}` 64 px · `{spacing.5xl}` 96 px.
- **Section padding**: hero / content bands use `{spacing.5xl}` 96 px on desktop.
- **Card interior**: cards sit at `{spacing.xl}` 24 px.

### Grid & Container
- Marketing content centres at roughly 1200 px width.
- Hero: 2-column at desktop (split between two terminal screenshots), stacks at mobile.
- Partner logos: 5-up wrapping flex row.
- Download tiles: 3-up at desktop (Mac / Linux / Windows), 1-up at mobile.

### Responsive Strategy

#### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Hero stacks; 1-up grids; nav hamburger. |
| Tablet | 768–1023px | 2-up grids. |
| Desktop | ≥ 1024px | Full hero split; 3-up download tiles. |

#### Touch Targets
Buttons render at ~36 px tall (8 px vertical padding + 20 px line-height). Mobile inflates touch area through additional padding to meet WCAG 44 × 44 px floor.

#### Collapsing Strategy
- Nav: full link row + Sign in / Download right cluster at desktop. Hamburger at mobile.
- Hero terminal-mockup split: stacks vertically at mobile.
- Press / job rows: full-width single column; stay legible at all widths.

#### Image Behavior
- **Terminal mockups**: rendered as dark cards with the actual terminal UI inside (warm canvas + colored syntax). Aspect ratio ~3:2.
- **Partner logos**: monochrome SVGs on dark tile cards.
- **Testimonial portraits**: 1:1 square crop inside `{rounded.md}` card chrome.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Level 0 — Flat | No shadow, no border. | Default for hero band. |
| Level 1 — Hairline | 1 px solid `{colors.hairline}` border on `{colors.canvas-soft}`. | Default card chrome. |
| Level 2 — Inset Card | Canvas-soft fill against canvas background with 1 px hairline. | Mockup cards, download tiles, testimonial cards. |

The brand uses surface-contrast and hairline borders for elevation; soft drop-shadows do not appear in the marketing surface.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Full-bleed bands. |
| `{rounded.xxs}` | 1px | Tightest in-text indicator. |
| `{rounded.xs}` | 2px | Inline very-small chips. |
| `{rounded.sm}` | 3px | Default button radius — extremely tight. |
| `{rounded.md}` | 4px | Card chrome (the brand's `--radius` base). |
| `{rounded.lg}` | 6px | Slightly larger cards. |
| `{rounded.pill}` | 9999px | Icon containers, status pills. |

### Photography Geometry
- Terminal mockups: ~3:2 inside `{rounded.md}` card chrome.
- Partner logos: monochrome SVGs at consistent 24 px height inside tile cards.
- Testimonial portraits: 1:1 square inside `{rounded.md}`.

## Components

### Buttons

**`button-primary`** — the off-white CTA on dark canvas.
- Background `{colors.primary}` (off-white), text `{colors.on-primary}` (warm dark), label `{typography.button-md}`, padding `{spacing.sm} {spacing.lg}`, shape `{rounded.sm}` 3 px. Tight.

**`button-secondary-ghost`** — the ghost-style secondary used for nav and tertiary actions.
- Background `{colors.canvas}`, text `{colors.ink}`, no border, same typography / shape.

**`button-icon-circular`** — the circular icon container.
- Background `{colors.canvas}`, ink icon, shape `{rounded.full}`. Used for nav controls (search, theme).

### Cards & Containers

**`card-content`** — the default content card on canvas-soft.
- Background `{colors.canvas-soft}`, text `{colors.ink}`, 1 px solid `{colors.hairline}`, padding `{spacing.xl}`, shape `{rounded.md}`.

**`card-mockup`** — the terminal-screenshot mockup card.
- Same chrome as `card-content` but body in `{typography.code}` (DM Mono) when text appears inside.

**`download-tile`** — the Mac / Linux / Windows download tile.
- Background `{colors.canvas-soft}`, text `{colors.ink}`, hairline border, padding `{spacing.xl}`, shape `{rounded.md}`. Hosts a platform icon + label + download CTA.

**`partner-logo-tile`** — the canvas-soft tile hosting a partner logo.
- Background `{colors.canvas-soft}`, monochrome logo SVG inside, padding `{spacing.lg}`, shape `{rounded.md}`.

**`testimonial-card`** — the single quote-style card with a portrait.
- Background `{colors.canvas-soft}`, text `{colors.ink}`, padding `{spacing.xl}`, shape `{rounded.md}`. Portrait 1:1 + body in `{typography.body-md}`.

**`press-row`** — the press-coverage list item.
- Background `{colors.canvas}` (no fill — sits on the canvas band), 1 px solid bottom border `{colors.hairline}`, body in `{typography.body-md}`, padding `{spacing.lg}` 0.

**`job-row`** — the "Join our team" list item (single row per open role).
- Background `{colors.canvas}`, 1 px solid bottom border, body in `{typography.body-md-strong}`, padding `{spacing.lg}` 0.

### Inputs & Forms

**`text-input`** — the dark-canvas text input.
- Background `{colors.canvas-soft}`, text `{colors.ink}`, 1 px solid `{colors.hairline}`, body in `{typography.body-sm}`, padding `{spacing.sm} {spacing.md}`, shape `{rounded.sm}`.

### Navigation

**`nav-bar`** — the sticky top nav.
- Background `{colors.canvas}`, text `{colors.ink}`, padding `{spacing.md} {spacing.xl}`.

**`nav-link`** — link items in nav.
- Background `{colors.canvas}`, text `{colors.ink}`, body in `{typography.body-sm-strong}`, padding `{spacing.xs} {spacing.md}`, shape `{rounded.sm}`.

**`footer`** — the footer band.
- Background `{colors.canvas}`, text `{colors.body}`, padding `{spacing.3xl} {spacing.xl}`. Body in `{typography.body-sm}`.

### Signature Components

**`hero-band`** — the dark hero band hosting the 64-px Inter headline.
- Background `{colors.canvas}`, text `{colors.ink}`, padding `{spacing.5xl} {spacing.xl}`. Headline `{typography.display-xl}` (64 px / 400 / `-1.6 px`). Below: a 2-column terminal-mockup split.

**`content-band`** — the standard content band.
- Background `{colors.canvas}`, text `{colors.ink}`, padding `{spacing.5xl} {spacing.xl}`. Section headline `{typography.display-md}`.

### Examples (illustrative)

> Auto-derived kit-mirror demonstration surfaces (`scripts/derive-examples-block.mjs`). Each `ex-*` entry references brand-native primitives so downstream consumers (`/preview-design`, `/generate-kit`) re-skin the same 10 surfaces consistently. `TO_FILL` markers indicate missing primitives — resolve in the LLM judgment pass.

**`ex-pricing-tier`** — Default Pricing tier card. Re-uses feature-card chrome with brand canvas-soft surface.
- Properties: `backgroundColor`, `textColor`, `borderColor`, `rounded`, `padding`

**`ex-pricing-tier-featured`** — Featured/highlighted tier — polarity-flipped surface (dark fill + light text in light mode, light fill + dark text in dark mode).
- Properties: `backgroundColor`, `textColor`, `rounded`, `padding`

**`ex-product-selector`** — What's Included summary card — re-purposed for SaaS / B2B verticals (NOT a literal product gallery).
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-cart-drawer`** — Subscription summary — re-purposed for SaaS / B2B (line items per add-on, not literal cart).
- Properties: `backgroundColor`, `rounded`, `padding`, `item-divider`

**`ex-app-shell-row`** — Sidebar nav row inside the App Shell example. Active state uses brand primary as the indicator.
- Properties: `backgroundColor`, `activeIndicator`, `rounded`, `padding`

**`ex-data-table-cell`** — Default data-table th + td chrome. Header uses mono-caps eyebrow typography; body uses body-sm.
- Properties: `headerBackground`, `headerTypography`, `bodyTypography`, `cellPadding`, `rowBorder`

**`ex-auth-form-card`** — Sign-in / sign-up card. Re-uses feature-card chrome with text-input primitives inside.
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-modal-card`** — Modal dialog surface — same chrome as feature-card with elevated shadow.
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-empty-state-card`** — Empty-state illustration frame.
- Properties: `backgroundColor`, `rounded`, `padding`, `captionTypography`

**`ex-toast`** — Toast notification surface — feature-card shape + medium shadow.
- Properties: `backgroundColor`, `rounded`, `padding`, `typography`


## Do's and Don'ts

### Do
- Reserve `{colors.primary}` off-white for primary CTA pills and default text. There is no chromatic accent.
- Use tight `{rounded.sm}` 3 px or `{rounded.md}` 4 px button radii. The brand never uses generous pills for CTAs.
- Set hero headlines in Inter weight 400 with `-1.6 px` tracking. The brand reads as quietly confident.
- Pair Inter (sentence-case) with DM Mono (code blocks, terminal mockups).
- Keep the warm-dark canvas tone — pure black breaks the brand's identity.

### Don't
- Don't introduce a chromatic brand accent. The off-white-on-warm-dark IS the brand's voice.
- Don't render the hero headline in heavy weight (700+). The brand's display is intentionally light.
- Don't use generous pill CTAs. The brand's button radius is 3-4 px, almost rectangular.
- Don't replace the warm dark canvas with neutral gray or pure black. The warmth IS the brand.
- Don't drop a soft drop-shadow on cards. Hairlines + surface contrast carry elevation.
