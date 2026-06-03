# CoEDM Control System — Light Mode Design Spec
> Context document for Antigravity implementation.  
> Derived by pixel-analysing the actual dark-mode screenshot of CoEDM v4.2.8.

---

## 1. Overview

CoEDM is an industrial HMI (Human-Machine Interface) for CNC/EDM machine monitoring. The UI is structured as a full-viewport dashboard with a fixed topbar, subheader tab bar, three-column main area, and a bottom navigation bar. The light mode is a direct tonal inversion of the dark mode — every surface, border, text, and accent color is mapped to its light-mode counterpart while preserving hue identity.

**Framework context:** The existing app uses a dark theme built on a warm near-black/olive palette. This spec defines the light theme as a CSS variable swap — no structural changes to layout or components are required.

---

## 2. Color Tokens

All values are exact. Dark-mode source values were pixel-sampled from the live screenshot.

### 2.1 Surface Stack

| Token | Dark (source) | Light (target) | Usage |
|---|---|---|---|
| `--color-topbar-bg` | `#3b3d3a` | `#f5f5f3` | Top navigation bar background |
| `--color-subheader-bg` | `#242422` | `#e8e8e5` | Tab/subheader bar background |
| `--color-page-bg` | `#242422` | `#edecea` | Page/body background (between panels) |
| `--color-card-bg` | `#333532` | `#ffffff` | Card and panel fill |
| `--color-card-bg-alt` | `#313432` | `#f9f9f7` | Alternate card (right panel) |
| `--color-bottomnav-bg` | `#242422` | `#e4e4e0` | Bottom navigation bar background |
| `--color-viewport-bg` | `#0c0b10` | `#d4d3d0` | CNC viewport/canvas background |
| `--color-viewport-inner` | `#09080d` | `#c2c1be` | Inner viewport (darker well) |

### 2.2 Borders

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--color-border` | `#404240` | `#d0d0cc` | Default card and panel borders |
| `--color-border-strong` | `#505250` | `#b8b8b4` | Stronger divider lines, section borders |

### 2.3 Typography

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--color-text-primary` | `#c3ccc9` | `#1a1c1a` | Headings, values, primary labels |
| `--color-text-secondary` | `#8a8c89` | `#52544f` | Supporting labels, secondary info |
| `--color-text-dim` | `#5a5c59` | `#858780` | Tertiary labels, SCADA-style uppercase micro-labels |

### 2.4 Accent Colors

All accents preserve their hue from dark mode. Lightness is adjusted for contrast on white/light surfaces.

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--color-accent-amber` | `#e8c085` | `#c8860a` | Active tab underline (MONITORING), active nav pill border/text |
| `--color-accent-amber-bg` | `rgba(232,192,133,0.12)` | `#fef3e0` | Active tab/pill background fill |
| `--color-accent-teal` | `#4aada0` | `#0b7a6e` | PLC LIVE badge, TELEM badge, axis track fill, active LED dot |
| `--color-accent-teal-bg` | `rgba(74,173,160,0.12)` | `#e0f5f3` | Teal badge background |
| `--color-accent-cyan` | `#00cafc` | `#007db8` | Bottom bar special elements (COBOT icon, etc.) |
| `--color-accent-cyan-bg` | `rgba(0,202,252,0.1)` | `#e0f3fc` | Cyan accent background |
| `--color-tool-amber` | `#f99c01` | `#f99c01` | CNC tool triangle in viewport — **unchanged in both modes** |

### 2.5 Status / LED Colors

| Token | Dark | Light | Usage |
|---|---|---|---|
| `--color-led-green` | `#3a7a58` | `#1e7a48` | Running / Online / Active LED dot |
| `--color-led-green-bg` | `rgba(58,122,88,0.15)` | `#d6f0e4` | Green status badge background |
| `--color-led-orange` | `#c9922e` | `#b06010` | Warning / Idle / Standby LED dot |
| `--color-led-orange-bg` | `rgba(201,146,46,0.15)` | `#fde8d0` | Orange status badge background |
| `--color-led-red` | `#c14e5d` | `#c0282f` | Alarm / Offline / Fault LED dot |
| `--color-led-red-bg` | `rgba(193,78,93,0.15)` | `#fcd8d9` | Red status badge background |
| `--color-led-off-border` | `#5a5c59` | `#a0a09c` | Hollow LED (disconnected state) border |

---

## 3. Typography

No font changes between dark and light mode. Existing font stack is preserved exactly.

| Role | Font | Size | Weight | Letter Spacing | Transform | Color token |
|---|---|---|---|---|---|---|
| Brand / Logo | Inter | 13px | 700 | -0.01em | — | `--color-text-primary` |
| Card title | Inter | 10px | 700 | 0.07em | UPPERCASE | `--color-text-primary` |
| Micro label (VIBRATION, RAW POS) | Inter | 9px | 600 | 0.07em | UPPERCASE | `--color-text-dim` |
| Badge / pill text | Inter | 9–10px | 700 | 0.06em | UPPERCASE | (per status color) |
| Nav item | Inter | 9px | 600 | 0.05em | UPPERCASE | `--color-text-dim` |
| Sensor value (large) | JetBrains Mono | 18–20px | 500 | — | — | `--color-text-primary` |
| Axis value | JetBrains Mono | 17px | 500 | — | — | `--color-text-primary` |
| Feed rate value | JetBrains Mono | 14px | 500 | — | — | `--color-text-primary` |
| Timestamp / ping | JetBrains Mono | 9px | 400 | — | — | `--color-text-dim` |

---

## 4. Layout Structure

The layout is a fixed full-viewport shell. No layout changes are needed between dark and light modes — only color swaps.

```
┌─────────────────────────────────────────────────────┐  h: 38px
│  TOPBAR  (brand · breadcrumb · status pills · btn)  │
├─────────────────────────────────────────────────────┤  h: 32px
│  SUBHEADER  (tabs · status tower indicators)        │
├──────────┬──────────────────────────┬───────────────┤
│          │                          │               │
│  LEFT    │     CENTER               │  RIGHT        │
│  248px   │     (flex: 1)            │  220px        │
│          │                          │               │
│  cards   │  viewport (flex:1)       │  axis panel   │
│  stacked │  + 4 bottom tiles        │               │
│          │                          │               │
├─────────────────────────────────────────────────────┤  h: 46px
│  BOTTOM NAV  (brand · nav items · status · ping)    │
└─────────────────────────────────────────────────────┘
```

- **Gap between columns:** 6px
- **Panel padding:** 6px (page-level)
- **Card internal padding:** 8px 10px (body), 6px 10px (header)
- **Border radius:** 3px (uniform — `--radius`)
- **Card header border:** 1px solid `--color-border` (bottom only)

---

## 5. Component Specifications

### 5.1 Topbar

- Background: `--color-topbar-bg`
- Bottom border: `1px solid --color-border`
- Height: 38px

**Status pills** (OPC-UA, FEED, SPINDLE):
- Background: `--color-topbar-bg`
- Border: `1px solid --color-border`
- Border-radius: 2px
- Padding: `3px 8px`
- Font: Inter 10px / 600 / 0.06em / UPPERCASE
- Color: `--color-text-secondary`
- LED dot: 7px circle, color per status

**Disconnect button:**
- Background: `--color-accent-amber-bg`
- Border: `1px solid --color-accent-amber`
- Color: `--color-accent-amber`
- Font: Inter 10px / 700 / 0.07em / UPPERCASE
- Padding: `4px 10px`
- Border-radius: 2px

### 5.2 Subheader / Tab Bar

- Background: `--color-subheader-bg`
- Bottom border: `1px solid --color-border`
- Height: 32px

**Active tab:**
- Color: `--color-accent-amber`
- Border-bottom: `2px solid --color-accent-amber`
- Background: transparent

**Inactive tab:**
- Color: `--color-text-dim`
- Border-bottom: `2px solid transparent`

### 5.3 Cards

- Background: `--color-card-bg`
- Border: `1px solid --color-border`
- Border-radius: 3px

**Offline/fault card variant:**
- Left border: `2px solid --color-led-red` (replaces normal left border)

### 5.4 Badges

| Variant | Background | Border | Text color |
|---|---|---|---|
| Teal (PLC LIVE, TELEM) | `--color-accent-teal-bg` | `--color-accent-teal` | `--color-accent-teal` |
| Dim (IDLE) | `--color-subheader-bg` | `--color-border-strong` | `--color-text-dim` |
| Red (OFFLINE) | `--color-led-red-bg` | `--color-led-red` | `--color-led-red` |
| Orange (WARN) | `--color-led-orange-bg` | `--color-led-orange` | `--color-led-orange` |

All badges: Inter 9px / 700 / 0.06em / UPPERCASE / padding `2px 6px` / border-radius 2px

### 5.5 LED Dots

| State | Fill | Border |
|---|---|---|
| Green (online/running) | `--color-led-green` | `--color-led-green` |
| Orange (idle/warn) | `--color-led-orange` | `--color-led-orange` |
| Red (offline/alarm) | `--color-led-red` | `--color-led-red` |
| Off/disconnected | transparent | `--color-led-off-border` |

- Size: 7px (inline), 8px (topbar pills), 20px (status tower large LEDs)
- Shape: perfect circle (`border-radius: 50%`)
- Tower LEDs (large, inactive): `opacity: 0.3` to simulate unlit state

### 5.6 Axis Track (progress bar)

- Height: 3px
- Background: `--color-subheader-bg`
- Fill: `--color-accent-teal`
- Border-radius: 2px
- Margin: `4px 0 8px`

### 5.7 Bottom Navigation

- Background: `--color-bottomnav-bg`
- Top border: `1px solid --color-border`
- Height: 46px

**Active nav item:**
- Background: `--color-accent-amber-bg`
- Border: `1px solid --color-accent-amber`
- Color: `--color-accent-amber`
- Border-radius: 2px

**Inactive nav item:**
- Color: `--color-text-dim`
- Background: transparent

### 5.8 Viewport / Canvas

- Background: `--color-viewport-bg`
- Border: `1px solid --color-border-strong`
- Inner dark well: `--color-viewport-inner`
- The CNC tool triangle remains `#f99c01` in both modes (it's an object color, not a theme color)

---

## 6. CSS Variable Block

Drop this block into your existing theme stylesheet to apply the light mode. All existing component styles reference these variables — only this block changes.

```css
:root[data-theme="light"],
.theme-light {
  /* Surfaces */
  --color-topbar-bg:       #f5f5f3;
  --color-subheader-bg:    #e8e8e5;
  --color-page-bg:         #edecea;
  --color-card-bg:         #ffffff;
  --color-card-bg-alt:     #f9f9f7;
  --color-bottomnav-bg:    #e4e4e0;
  --color-viewport-bg:     #d4d3d0;
  --color-viewport-inner:  #c2c1be;

  /* Borders */
  --color-border:          #d0d0cc;
  --color-border-strong:   #b8b8b4;

  /* Text */
  --color-text-primary:    #1a1c1a;
  --color-text-secondary:  #52544f;
  --color-text-dim:        #858780;

  /* Accent — amber (active tab, active nav) */
  --color-accent-amber:    #c8860a;
  --color-accent-amber-bg: #fef3e0;

  /* Accent — teal (badges, axis fill) */
  --color-accent-teal:     #0b7a6e;
  --color-accent-teal-bg:  #e0f5f3;

  /* Accent — cyan (bottom bar special elements) */
  --color-accent-cyan:     #007db8;
  --color-accent-cyan-bg:  #e0f3fc;

  /* Tool indicator — NEVER changes between modes */
  --color-tool-amber:      #f99c01;

  /* Status LEDs */
  --color-led-green:       #1e7a48;
  --color-led-green-bg:    #d6f0e4;
  --color-led-orange:      #b06010;
  --color-led-orange-bg:   #fde8d0;
  --color-led-red:         #c0282f;
  --color-led-red-bg:      #fcd8d9;
  --color-led-off-border:  #a0a09c;
}
```

---

## 7. Dark Mode Reference (Source)

For completeness — the dark values the above were derived from.

```css
:root[data-theme="dark"],
.theme-dark {
  /* Surfaces */
  --color-topbar-bg:       #3b3d3a;
  --color-subheader-bg:    #242422;
  --color-page-bg:         #242422;
  --color-card-bg:         #333532;
  --color-card-bg-alt:     #313432;
  --color-bottomnav-bg:    #242422;
  --color-viewport-bg:     #0c0b10;
  --color-viewport-inner:  #09080d;

  /* Borders */
  --color-border:          #404240;
  --color-border-strong:   #505250;

  /* Text */
  --color-text-primary:    #c3ccc9;
  --color-text-secondary:  #8a8c89;
  --color-text-dim:        #5a5c59;

  /* Accent — amber */
  --color-accent-amber:    #e8c085;
  --color-accent-amber-bg: rgba(232,192,133,0.12);

  /* Accent — teal */
  --color-accent-teal:     #4aada0;
  --color-accent-teal-bg:  rgba(74,173,160,0.12);

  /* Accent — cyan */
  --color-accent-cyan:     #00cafc;
  --color-accent-cyan-bg:  rgba(0,202,252,0.10);

  /* Tool indicator */
  --color-tool-amber:      #f99c01;

  /* Status LEDs */
  --color-led-green:       #3a7a58;
  --color-led-green-bg:    rgba(58,122,88,0.15);
  --color-led-orange:      #c9922e;
  --color-led-orange-bg:   rgba(201,146,46,0.15);
  --color-led-red:         #c14e5d;
  --color-led-red-bg:      rgba(193,78,93,0.15);
  --color-led-off-border:  #5a5c59;
}
```

---

## 8. Theme Toggle Implementation

```js
// Toggle between modes
function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode); // 'light' | 'dark'
  localStorage.setItem('coedm-theme', mode);
}

// On load
const saved = localStorage.getItem('coedm-theme') || 'dark'; // default to dark
setTheme(saved);
```

---

## 9. Notes for Antigravity

- **No layout changes.** All component structure, spacing, and sizing stays identical. Only CSS variable values change.
- **Font stacks unchanged.** Inter + JetBrains Mono. No substitutions.
- **Border radius is 3px throughout** — no rounding changes between modes.
- **Viewport CNC illustration** keeps its internal object colors (`#f99c01` tool triangle, grey machine geometry). The background behind it changes via `--color-viewport-bg`.
- **Status tower LEDs** (large circles in Machine Status Indicators card): use `opacity: 0.3` for the "unlit" state in both modes. When a state is active, remove the opacity modifier.
- **Offline card variant:** Apply `border-left: 2px solid var(--color-led-red)` to the card element (overrides the standard `border: 1px solid var(--color-border)` on the left side only).
- **Disconnect button and active nav pill** both use the amber accent — they should share the same token pair (`--color-accent-amber` / `--color-accent-amber-bg`).
- The subheader background (`--color-subheader-bg: #e8e8e5`) is intentionally slightly darker than the topbar (`#f5f5f3`) to maintain the same hierarchy depth as in dark mode.