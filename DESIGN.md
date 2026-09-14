---
name: NRDS Hydrofabric Viewer
description: A National Water Model forecast viewer that reads hydrofabric parquet straight from S3 in the browser, with a map-first interface whose chrome floats as solid, tinted-neutral panels over the water. The token layer is shared with the ngiab-client viewer: neutrals tinted toward hue 250, semantic surface/fg/border scales, a warm selection hue kept off the blue choropleth ramp, subtle borders and shadows.
register: product
colors:
  surface: "oklch(0.992 0.004 250)"
  text: "oklch(0.235 0.012 250)"
  title-text: "oklch(0.480 0.014 250)"
  panel-bg: "oklch(0.995 0.003 250)"
  panel-border: "oklch(0.885 0.008 250)"
  panel-muted: "oklch(0.480 0.014 250)"
  popup-bg: "oklch(0.995 0.003 250)"
  map-panel-bg: "#f0f4f7"
  accent: "oklch(0.536 0.13 250)"
  accent-text: "oklch(0.995 0.003 250)"
  select-border: "oklch(0.800 0.010 250)"
  notice-bg: "oklch(0.950 0.055 75)"
  notice-border: "oklch(0.620 0.100 75)"
  notice-text: "oklch(0.400 0.090 75)"
  status-failed-text: "#c33f38"
  link: "#2571b5"
  map-flowpaths: "#1f9ec7"
  map-gauges: "#696f75"
  map-vpu-boundary: "#009988"
  map-divides-highlight: "rgba(179, 55, 54, 0.95)"
  chart-line-1: "#2571b5"
  chart-line-2: "#268444"
  chart-line-3: "#b95115"
  chart-line-4: "#c33f38"
  chart-line-5: "#7750b1"
  bootstrap-primary: "#2571b5"
  bootstrap-accent: "#de3b3d"
  bootstrap-danger: "#c33f38"
typography:
  display:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.5px"
  readout:
    fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    fontVariantNumeric: "tabular-nums"
rounded:
  none: "0"
  sm: "4px"
  md: "8px"
  pill: "999px"
  dot: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
components:
  layer-button:
    backgroundColor: "var(--button-primary-bg)"
    textColor: "var(--accent-text)"
    rounded: "20px"
    padding: "7px 8px"
    size: "44px"
  select-control:
    backgroundColor: "{colors.panel-bg}"
    textColor: "{colors.text}"
    borderColor: "{colors.select-border}"
    rounded: "{rounded.sm}"
    height: "44px"
    heightCompact: "32px"
    focusBorder: "{colors.accent}"
  theme-toggle:
    backgroundColor: "{colors.panel-bg}"
    textColor: "{colors.text}"
    borderColor: "{colors.panel-border}"
    rounded: "{rounded.pill}"
    size: "44px"
  control-panel:
    backgroundColor: "{colors.map-panel-bg}"
    textColor: "{colors.text}"
    borderColor: "{colors.panel-border}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
    width: "min(300px, calc(100vw - 32px))"
    elevation: "var(--elevation-map-control)"
  feature-popup:
    backgroundColor: "{colors.popup-bg}"
    textColor: "{colors.text}"
    borderColor: "{colors.panel-border}"
    rounded: "{rounded.md}"
    padding: "18px 14px 14px"
    maxWidth: "360px"
    elevation: "var(--elevation-map-control)"
  notice:
    backgroundColor: "{colors.notice-bg}"
    borderColor: "{colors.notice-border}"
    textColor: "{colors.notice-text}"
    rounded: "{rounded.pill}"
  status-strip:
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
    typography: "{typography.body}"
---

# Design System: NRDS Hydrofabric Viewer

## 1. Overview

**Creative North Star: "The Instrument Glass"**

An instrument glass is the pane a reading is taken through: the cover over a gauge dial, the window of a stilling well. It is nearly clear, tinted the faintest cool colour by the material itself, and it exists to let you read the water underneath without getting between you and it. This interface is built the same way. The map is the water. Every piece of chrome is a pane of tinted glass laid over it: a control panel, a legend, an anchored reading. Each one is close to the background it sits on, lifts off the map only by a soft shadow, and carries a single cool accent (hue 250) where your attention belongs and a single warm mark (hue 75) where you are being cautioned.

The colour posture is the whole argument. The palette is tinted-neutral OKLCH: surfaces, text and borders all sit on the hue-250 axis at low chroma (0.003 to 0.014), so the chrome reads as glass with a cool cast rather than as clinical white or flat grey. Saturation is spent, not sprinkled. The accent, a blue at `oklch(0.536 0.13 250)`, marks the active state, the focus ring and the selected option, and nothing else. The warm notice colour at hue 75 marks the research-preview caution and the first-run notice, and nothing else. The five chart series and the map paint layers carry the rest of the system's colour, because those are measurements. When the interface shows you colour, it means state; when the map shows you colour, it means data.

The system is theme-aware to the core, not as a coat of paint. A full light palette lives in `:root`, and a dark palette applied through the `theme-dark` mixin answers every token. The theme follows `prefers-color-scheme` by default and is also switchable by a manual toggle that stamps `data-theme` on the document root, so both directions win. The two themes move together because the basemap moves with them: `--map-style-url` resolves to a different S3 style document per theme, and a light pane over a dark basemap is unreadable, so the pair is not optional.

What this system rejects is the old teal "gauge house" look it replaced (a single teal accent, achromatic-only chrome, a system-font stack) and the heavier reflexes around it: skeuomorphic drop shadows on every surface, dense multi-modal chrome that covers the map to tell you something, and garish high-chroma colour pushed to its extremes. The glass is quiet on purpose.

**Key Characteristics:**
- Tinted-neutral OKLCH chrome on the hue-250 axis, saturated colour reserved for data. Colour in the UI means state; colour on the map means measurement.
- One cool accent (hue 250) and one warm caution (hue 75), both used sparingly.
- Mostly flat. Depth comes from tonal layering and a visible hairline border (`--panel-border-color`); only chrome that floats over the basemap gets a soft, tinted shadow.
- One typeface, self-hosted: Public Sans, three weights (400, 500, 600), behind a `system-ui` fallback stack; monospace is the `SFMono/Menlo` system stack, used only for readouts.
- Both themes are first-class, because the basemap swaps with them. Manual toggle and `prefers-color-scheme` both drive the same effective-theme signal.
- The signature move: a reading opens anchored on the feature you clicked, not in a modal over the map. On mobile it becomes a bottom sheet.

## 2. Colors: The Tinted Glass Palette

Tinted neutrals on a single cool axis carrying the entire interface, one blue accent for active state and focus, one warm amber for caution, and saturated values reserved for the data channels on the map and in the chart.

### Neutral (the glass)
Every chrome surface, text role and border lives on hue 250 at low chroma, which is the faint cool cast that makes the chrome read as tinted glass rather than plain white.

- **Surface** (`--background-color`, `oklch(0.992 0.004 250)` light, `oklch(0.205 0.010 250)` dark): the app background.
- **Panel** (`--panel-background`, `oklch(0.995 0.003 250)` light, `oklch(0.245 0.012 250)` dark) and **Popup** (`--popup-bg`, `oklch(0.995 0.003 250)` light, `oklch(0.245 0.012 250)` dark): the panes, one tinted surface family shared with the ngiab-client viewer. Kept a hair off Surface so a pane separates from the frame behind it.
- **Text** (`--text-color`, `oklch(0.235 0.012 250)` light, `oklch(0.945 0.006 250)` dark) and **Muted** (`--panel-text-muted`, `oklch(0.480 0.014 250)` light, `oklch(0.760 0.010 250)` dark): body and secondary copy.
- **Hairline** (`--panel-border-color`, `oklch(0.885 0.008 250)` light, `oklch(0.330 0.012 250)` dark): the subtle border that does the separating in place of a shadow, matching the ngiab-client border weights.

### Accent (the one cool mark)
- **Accent** (`--nav-pill-active-bg`, `oklch(0.536 0.13 250)` light, `oklch(0.624 0.13 250)` dark), with its paired label `--nav-pill-active-text-color`: the active navigation state, the selected dropdown option, and every focus ring in the app (`--focus-ring` resolves to it). This is the only chroma in the resting chrome. The Bootstrap anchor for the same hue is `$primary` (`#2571b5`), which also serves `--link-color` in light.

### Caution (the one warm mark)
- **Notice** (`--notice-bg` `oklch(0.950 0.055 75)`, `--notice-border` `oklch(0.620 0.100 75)`, `--notice-text` `oklch(0.400 0.090 75)` in light, all answered warmer in dark): the research-preview badge and the first-run notice, and nowhere else. Warm hue 75 against the cool chrome so a caution never reads as decoration.
- **Failure** (`--status-failed-text` `#c33f38` light / `#e25b52` dark, on `--status-failed-bg`): the failed-load state in the status strip and search notice. Kept as hex because it is shared with data-adjacent surfaces.

### The Data Channels
Not UI colours. These are the saturated values, and each one names a measurement.

- **Chart series**, five entries re-picked per theme: `#2571b5 #268444 #b95115 #c33f38 #7750b1` light, brightened to `#549de5 #5cb572 #e38d3d #e86156 #a780e6` dark. Re-picked because a line that reads on white is invisible on the dark panel.
- **Map paint layers** (all `--map-*`): flowpaths `#1f9ec7` light / `#397d9e` dark, gauges `#696f75` / `#acb2b7`, VPU boundary `#009988` / `#33bbee`, divides highlight `rgba(179, 55, 54, ...)`, cursor and point strokes. Written as hex or `rgba()`, never OKLCH. See the MapLibre Parser Rule.
- **Chart chrome** (all `--chart-*`): axis, grid, tooltip and crosshair colours, also hex or `rgba()`, for the same parser reason on the plotting side.

### Named Rules

**The MapLibre Parser Rule.** Any token that becomes a map paint or style value, or a chart paint value, stays hex or `rgba()`, and is prohibited from being OKLCH. MapLibre's style parser is CSS Color 3: it cannot consume `oklch()`, and it fails silently, drawing nothing at all with no error. This is why every `--map-*` and `--chart-*` token is hex or `rgba()` while the rest of the palette is OKLCH. Never split a token's source of truth to satisfy this; if a value must reach the map, it is hex from the start.

**The Restrained Accent Rule.** The cool accent (hue 250) is spent only on active state, focus and selection, and the warm caution (hue 75) only on the preview notice. Never reach for either as a fill, a heading colour or a decorative edge. If a new UI element wants colour, it wants weight, size or the hairline instead. Saturation in the chrome is always a signal, never a texture.

**The Paired Theme Rule.** Light and dark are not two skins over one design; they are two first-class palettes, and `--map-style-url` swaps with them. Any token added to one theme must always be answered in the other, or the basemap will contradict the chrome the moment the theme flips.

## 3. Typography

**Display and Body Font:** Public Sans, self-hosted as woff2 in weights 400, 500 and 600, behind the full `system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial` fallback stack (`--font-ui`). `font-display: swap` keeps text painted on the first frame.

**Readout Font:** the system monospace stack (`--font-mono`, `SFMono-Regular, Menlo, Monaco, Consolas`), used only where a value needs tabular alignment, such as the popup measurement value.

**Character:** Public Sans is the USWDS typeface, which suits a NOAA and CIROH funded tool and gives the interface one consistent personality across macOS, Windows and Linux instead of shifting with the platform's system font. Three subset weights are a small cost against the viewer's several megabytes of deck.gl, MapLibre, DuckDB and Arrow.

### Hierarchy

Four steps, roughly a 1.15 to 1.20 ratio between neighbours, with weight carrying the contrast that scale alone cannot.

- **Display** (600, `--text-lg` 1.125rem, line-height 1.25): panel and modal titles. The largest type in the app is 18px, because nothing here is a headline.
- **Title** (600, `--text-md` 0.9375rem, line-height 1.4): section headings inside panels, and the feature identifier.
- **Body** (400, `--text-sm` 0.8125rem, line-height 1.5): the default. Panels are narrow enough that line length is bounded by the layout.
- **Label** (500, `--text-xs` 0.75rem, letter-spacing 0.5px where used): control labels, panel section headings, the status strip.
- **Readout** (400, 0.8125rem, `font-variant-numeric: tabular-nums`, monospace): measurement values in the popup, where digits must align.

### Named Rules

**The Weight Before Size Rule.** The scale spans 12px to 18px, which is not enough range to build hierarchy from size alone. Always reach for `--weight-strong` (600) against `--weight-normal` (400) first, and step up a size only when weight has already been spent. `--weight-strong` is 600 because that is a weight the shipped face actually has.

**The Four Steps Rule.** The scale is `--text-xs`, `--text-sm`, `--text-md`, `--text-lg`, and nothing else. A fifth size is a signal that something in the layout is wrong, never that the scale is too short.

## 4. Elevation

Flat by default, and lifted only where the surface underneath is not ours to control. Depth in the chrome comes from tonal layering (a pane sits a hair off its background) and from the hairline border (`--panel-border-color`), which separates one surface from the next without a gradient pretending to be an edge. Bootstrap's default shadows on buttons, switches and form controls are removed by hand; those removals are the doctrine, not omissions.

### Shadow Vocabulary

Two soft, OKLCH-tinted levels, both defined per theme, and both reserved for chrome that floats over the basemap.

- **`--elevation-map-readout`** (`0 1px 3px` and `0 4px 12px` at `oklch(0.235 0.030 250 / 0.10)` in light): the lighter lift, for panes that only report, such as the legend and the readout.
- **`--elevation-map-control`** (`0 1px 2px` and `0 6px 16px` at `oklch(0.235 0.030 250 / 0.10 to 0.12)` in light): the slightly heavier lift, for panes the reader operates, such as the control panel and the anchored feature popup. Softened to the ngiab-client shadow weight. Dark redefines both with `oklch(0 0 0 / ...)` alpha shadows so the lift reads against a dark map.
- **Focus ring** (`--focus-ring`, `2px solid var(--nav-pill-active-bg)`): not elevation. The accent ring on focused controls, drawn on `:focus-visible`, never removed with `outline: none`.

### Named Rules

**The Floating Glass Rule.** A surface is flat at rest, and a shadow is justified only when the surface underneath it is the basemap, which is the one thing in this app the chrome does not own. A docked panel, a modal (which has a scrim), and a tooltip on our own pane are all flat; the control panel, the legend and the anchored popup float over the map and carry the tinted elevation tokens. Never add a shadow to separate two surfaces that are both ours; use the hairline.

**The Tinted Shadow Rule.** Elevation shadows are tinted with the family hue (`oklch(... 250 / alpha)` in light) rather than pure black, so the lift belongs to the palette. Never introduce an untinted `rgba(0, 0, 0, ...)` shadow in the light theme, and never a hard skeuomorphic drop shadow anywhere.

## 5. Components

Controls in this app are read at a glance while a map is moving underneath them, so every one is quiet at rest and unambiguous in state.

### Control panel (ControlMenu)
The one unified map-chrome control (`ControlMenu.js`), floating top-left over the map. A single `LayerButton` reveals a `Panel` that stacks framed `Section` blocks: the model-run selection, the layer toggles, the colour-scale selector, and the theme toggle. It replaced three disconnected regions (a run selector, a separate layer menu, and no manual theme control at all) and only composes their existing behaviour.

- **Panel:** `min(300px, calc(100vw - 32px))` wide, `14px 16px` padding, `--map-panel-bg` face, `1px solid var(--panel-border-color)`, `--radius-md` corners, `--elevation-map-control` lift. Goes edge-to-edge under 768px.
- **Section:** `border-block-end: 1px solid var(--panel-border-color)` for a divider rhythm, with the first and last section trimming their padding and the last dropping the border.
- **LayerButton:** the reveal control, `min` 44px square, `--radius` 20px, transparent when the panel is open and `--button-primary-bg` when closed, with an `aria-expanded` and `aria-controls` pair.

### Feature popup (signature component)
`SelectedFeaturePopup.js`, the app's signature piece. Clicking a catchment opens a MapLibre `Popup` anchored on the feature itself, carrying a compact header of curated fields, a compact variable picker (`VariablesMenu`), and the time-series chart (`TimeSeriesCard`). This replaces the old feature-info modal: the reading now opens where you asked, over the water, without covering the map. On mobile (`useIsSheetLayout`) the popup does not render; the bottom sheet hosts the chart instead.

- **Chrome** (`.feature-chart-popup .maplibregl-popup-content`): `18px 14px 14px` padding, `--radius-md`, `--popup-bg` face, `1px solid var(--panel-border-color)`, `--elevation-map-control` lift.
- **Close button:** a 26x26 square at top-right, `--radius-sm`, transparent until hover.
- **Content** (`PopupContent` with the `$chart` variant): `max-width` 340px, `max-height: min(60vh, 360px)`, scrolls internally; the measurement value uses `--font-mono` for tabular alignment.

### Select control
`SelectComponent.js`, a `react-select` styled entirely from tokens. Control height is 44px by default and 32px in `compact` mode. The focus state draws the accent as both border colour and a `0 0 0 2px` ring (`--nav-pill-active-bg`), the menu and options read from `--select-*` tokens, and the selected option carries the accent with its paired label. Always bound to a real `<label htmlFor>` pointing at the control's `inputId`.

### Theme toggle
`ThemeToggle.js`, a real `<button>` at least `--tap-min` (44px) square, `--radius-pill`, `--panel-background` face with a hairline border. It writes the one effective-theme signal that stamps `data-theme` on the root, reports its state with `aria-pressed`, states the action in its accessible name, and shows a sun or moon icon marked `aria-hidden`.

### Status strip and notices
- **StatusStrip:** a pill in the header that renders nothing when idle, counts in-flight loads rather than holding a boolean so overlapping requests cannot make it flicker, and restyles from `--status-failed-*` on failure.
- **Notice / ExperimentalBadge:** the warm caution surface (`--notice-*`), used for the research-preview badge and panel-level "nothing here" statements, never as chrome.

### Named Rules

**The Popup Replaces the Modal Rule.** A reading about a map feature always opens as the anchored popup on the feature, never as a modal over the map. Modals are reserved for content that gates or explains and has no place on the map (the first-run notice, info panels). Never reach for a modal to show a value that belongs to a location; the location is where it goes.

**The Anchored Reading Rule.** The popup is keyed on the selected feature: closing it clears the selection, and re-clicking the same feature reopens it. On a sheet layout the popup yields to the bottom sheet rather than stacking a second surface. Never render both the popup and the sheet chart for the same selection.

## 6. Do's and Don'ts

### Do:
- **Do** keep the chrome on the hue-250 axis at low chroma (0.003 to 0.014) and spend saturated colour only on data.
- **Do** reserve the cool accent (hue 250) for active state, focus and selection, and the warm caution (hue 75) for the preview notice. A new UI colour is almost always a request for weight or size instead.
- **Do** answer every token in both themes, because `--map-style-url` swaps with the theme and a one-sided token will contradict the basemap.
- **Do** write every map paint and chart paint value as hex or `rgba()`. MapLibre's parser is CSS Color 3: `oklch()` returns nothing and the layer draws nothing, silently.
- **Do** keep surfaces flat and let the hairline (`--panel-border-color`) separate them; add a shadow only when the surface underneath is the basemap.
- **Do** tint elevation shadows with the family hue in light, and use the tinted alpha-black variants in dark.
- **Do** give every interactive control at least 44px and a `:focus-visible` ring in `--nav-pill-active-bg`.
- **Do** bind form controls with a real `<label htmlFor>` pointing at the control's own id, including react-select's `inputId`.
- **Do** reach for `--weight-strong` (600) before the next size step. The scale is only four steps wide.
- **Do** open a feature's reading as the anchored popup, and let it become the bottom sheet on mobile.

### Don't:
- **Don't** use pure `#fff` or `#000` in a chrome fill, or a hard-coded colour on one side of a light/dark pair. Tokens are paired; a hard-coded half hides from a token sweep.
- **Don't** feed `oklch()` into a MapLibre style value or a chart paint value. It parses to nothing and fails without an error.
- **Don't** add a token to one theme without answering it in the other.
- **Don't** bring back the old teal "gauge house" look: a lone teal accent, achromatic-only chrome, or a bare system-font stack.
- **Don't** add a heavy skeuomorphic drop shadow, an untinted black shadow in light, or a shadow between two surfaces that are both ours.
- **Don't** push colour to garish high chroma at the extremes; the accent sits at chroma 0.13 and the neutrals near zero on purpose.
- **Don't** reach for a modal to show something about a map feature. That is the anchored popup's job.
- **Don't** stack the feature popup and the sheet chart for the same selection.
- **Don't** animate layout properties or write `transition: all`. Name the property, and use the standard ease-out curve.
- **Don't** ship an infinite animation without a `prefers-reduced-motion` escape.
- **Don't** add a fifth type size or a decorative coloured edge heavier than the 1px hairline.
