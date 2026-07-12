# Warm Park Redesign — Design Spec

**Date:** 2026-07-12
**Decisions (ratified with Brad):** warm & playful park energy · visual system + key
surfaces · one quiet trust line per card · evolve-in-place implementation (no
component library).

## Problem

The app is functionally strong (grades, dot meters, trust tiers, offline, a11y) but
visually generic and cluttered:

- CSS requests Inter but never loads it — users see system fonts. No display face,
  no brand identity beyond default Tailwind teal-on-stone.
- Box-in-box noise: Home shows the brand twice plus a "catalog preview" stat box and
  two notice banners before content; Browse mobile stacks two banners before the
  first food item.
- Menu cards carry ~9 competing elements in 5+ accent colors; ~2 cards fit per phone
  screen; every estimated card shouts an amber "verify before dosing" pill →
  habituation (banner blindness) defeats the safety goal.
- Flat depth model (white box + border + small shadow on gray) and a global
  `* { transition }` rule.
- The park-theme system (`src/lib/park-themes.ts`: per-resort gradients, surfaces,
  emoji) exists but Home deliberately ignores it.

## Direction

Warm, playful, park-day energy — while keeping clinical trust: color is *decorative
on surfaces, semantic on data*. Traffic-light thresholds, grade letters, and all
dosing-safety copy on detail/meal surfaces are unchanged.

## 1. Design tokens (src/index.css, Tailwind v4 `@theme`)

- **Fonts (self-hosted via @fontsource, added to `dependencies`):**
  - Display: `Baloo 2` (variable) — rounded, friendly, confident at bold weights.
    Used for h1–h3, grade badges, nav labels, hero numerals.
  - Body: `Nunito Sans` (variable) — warm humanist sans, highly readable at 14–16px.
  - Registered as `--font-display` / `--font-sans` in `@theme`.
- **Palette:**
  - Base surface: warm cream `#faf7f2` (replaces stone-50); cards stay white;
    section tints use park-theme `surface` colors.
  - Ink: warm stone-900/600/500 (unchanged roles).
  - Brand primary: keep teal family (`#0d9488` anchor) for continuity and trust.
  - Decorative "sunrise" gradient (teal-500 → emerald-400 → amber-300) for the Home
    hero panel and small flourishes only — never on semantic elements.
  - Semantic traffic-light colors (green/amber/rose), grade colors, alcohol purple:
    **unchanged**.
- **Depth & shape:** layered soft shadows (`0 1px 2px rgba(28,25,23,.06), 0 12px
  32px -16px rgba(28,25,23,.18)`); radii: hero/panels 24px, cards 16px,
  buttons/inputs 12px, chips full.
- **Motion:** delete `* { transition }`; targeted transitions on interactive
  elements; two micro-interactions: heart "pop" (scale keyframe) on favorite, and
  the existing add-to-meal success morph retimed. Respect
  `prefers-reduced-motion: reduce` (disable both).
- High-contrast mode: extend the existing `.high-contrast` overrides to any new
  utility classes/tints introduced.

## 2. Header + navigation

- Header: warm cream translucent (`bg/85 + backdrop-blur`), full wordmark in the
  display face at all breakpoints (today mobile shows only a heart icon), contrast +
  settings on the right. Height unchanged.
- Bottom nav (mobile): active tab becomes a filled teal pill (icon + label) instead
  of a top border; inactive items unchanged; badge unchanged.
- Sidebar (desktop): same structure, active item keeps tinted pill; label typography
  moves to display face at semibold.

## 3. Home

- **Hero panel:** rounded-3xl sunrise-gradient panel containing: display-face
  headline — "Eat the parks with confidence." — and one
  subline that folds in the catalog stats ("Carb counts and nutrition confidence
  for {items} menu items across {destinations} destinations — before you reach the
  queue."), killing the "Catalog preview" debug box,
  the search form (white, large, soft shadow), and the preset chip rail (white/80
  chips on the gradient). The duplicate brand block (icon tile + "DiabetesGuide"
  h1) is removed — brand lives in the header; the h1 becomes the headline.
- **Disclaimer:** ONE compact line under the hero (icon + "Educational tool — not
  medical advice. Nutrition may be estimated." + Data Sources link). The favorites
  nudge keeps its row but restyles as a quiet tinted line.
- **Destination sections:** activate park themes. Each resort section header gets
  its theme-gradient icon tile (emoji from theme) and theme-colored "Browse" button
  text; category tiles get theme `surface` background tint on hover and
  theme-colored left accent + icon tile (replacing all-teal). The sticky jump-nav
  chips stay, restyled as soft chips on cream with backdrop blur.

## 4. Menu item card (the big declutter)

Target: ~40% shorter; 3–4 cards per phone screen; one accent color at rest.

Keep: grade badge (slightly smaller), stretched-link pattern, favorite heart,
memoization, all aria labels/live regions.

New layout:
1. Grade badge · name · heart.
2. Restaurant · category as one muted text line (category pill removed).
3. Nutrition row: carbs hero (large, display face) with its DotMeter; net carbs,
   calories, sugar, protein as plain numbers (their DotMeters removed); alcohol
   grams stays (purple, it is semantic).
4. **One quiet trust line** (replaces: annotation banner + estimate pill + quality
   warning + grade-label line): a single muted line, at most one message, chosen by
   priority: high-risk annotation (if any) → else estimate tier ("~ estimate —
   check details"). Amber text, no pill background. Full warnings remain on the
   item detail page and meal builder (dosing surfaces) — unchanged there.
5. Actions: compact primary "Add" pill button (auto width) + icon-only Compare with
   aria-label on the left; a quiet "Details ›" link on the right of the same row
   (replaces the "More details" text link; the whole card stays clickable via the
   stretched link).
6. Tags row (Vegetarian/Fried/Seasonal) removed from cards — they remain on the
   item detail page. "Nutrition unavailable" state keeps its explanatory line.

## 5. Browse + filter bar

- The two stacked banners merge into one compact line: "Educational tool — not
  medical advice · showing a 3,000-item preview — pick a destination for the full
  catalog" (second clause only in All-Destinations mode).
- Sticky filter bar: white/80 + backdrop-blur, soft chips; grade filter buttons
  restyled to look like the grade badges (letter in colored ring); slider keeps its
  styling with the new radius/shadow tokens.
- List/By-Destination toggle becomes a segmented control (single rounded container,
  sliding active pill).
- Results-count box becomes a plain text line.

## 6. Out of scope (inherit tokens only)

Insulin helper, Packing, Guide, Advice, Plan, Settings, item detail, meal builder,
search page layouts. They pick up fonts/colors/radii from tokens automatically; no
structural edits. Dark mode: not in this pass.

## 7. Safety guardrails (non-negotiable)

- Traffic-light thresholds, grade computation, and trust-tier logic untouched
  (presentation-only changes).
- Dosing-grade gating and all "verify before dosing" copy on item detail, meal
  builder, and insulin surfaces unchanged.
- Text contrast ≥ 4.5:1 on all new tinted surfaces; 44px touch targets preserved;
  focus rings, skip links, aria-live regions preserved.

## 8. Validation

- `npm test` (823 tests) — update tests that assert removed card elements (tag
  pills, "More details" link, per-metric dot meters, warning pill copy on cards);
  behavioral/lib tests must pass unmodified.
- `npm run lint`, `npm run build`.
- Playwright before/after screenshots at 390×844 and 1440×900 for Home and Browse
  (before shots captured 2026-07-12: home-mobile/home-desktop/browse-*.png).
- Cards-per-screen check: ≥3 item cards visible at 390×844 in Browse list view.
