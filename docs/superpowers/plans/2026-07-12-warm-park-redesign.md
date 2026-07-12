# Warm Park Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the warm-park visual redesign (spec: `docs/superpowers/specs/2026-07-12-warm-park-redesign-design.md`) — real fonts, warm tokens, hero Home, themed destinations, decluttered menu cards, cleaned-up Browse.

**Architecture:** Evolve-in-place restyle. Tailwind v4 `@theme` tokens in `src/index.css` + self-hosted @fontsource fonts; component-level JSX/class edits on Header, BottomNav, Home, MenuItemCard, Browse, FilterBar. No logic changes to grades/trust/thresholds.

**Tech Stack:** React 19, Tailwind CSS v4 (`@tailwindcss/vite`), @fontsource-variable packages, Vitest + Testing Library, Playwright MCP for visual checks.

## Global Constraints

- Traffic-light thresholds, grade computation, trust-tier logic: **presentation-only changes** (spec §7).
- Dosing warnings on item detail / meal builder / insulin surfaces: unchanged.
- Text contrast ≥ 4.5:1; touch targets ≥ 44px; keep skip links, focus-visible rings, aria-live regions, `role` attributes.
- Fonts self-hosted via @fontsource (no CDN), added to `dependencies` (they ship to the client).
- Every task ends with `npm test` + `npm run build` green, then a commit listing ONLY design files (the working tree also carries unrelated uncommitted audit-script changes — never `git add -A`).
- Validation screenshots at 390×844 and 1440×900 (dev server on :5173, Playwright MCP).

---

### Task 1: Tokens + fonts foundation

**Files:**
- Modify: `package.json` (deps), `src/main.tsx` (font imports), `src/index.css` (tokens)

**Interfaces:**
- Produces: CSS vars/utilities all later tasks use: `--font-display` (`font-display` utility), warm cream page background (`--color-cream: #faf7f2`), `.shadow-soft` layered shadow, `.animate-heart-pop`, hero gradient var `--gradient-sunrise`.

- [ ] Step 1: `npm install @fontsource-variable/baloo-2 @fontsource-variable/nunito-sans`
- [ ] Step 2: In `src/main.tsx`, before `./index.css`: `import '@fontsource-variable/baloo-2'` and `import '@fontsource-variable/nunito-sans'`
- [ ] Step 3: In `src/index.css` add after the tailwind import:

```css
@theme {
  --font-display: 'Baloo 2 Variable', 'Nunito Sans Variable', system-ui, sans-serif;
  --font-sans: 'Nunito Sans Variable', system-ui, sans-serif;
  --color-cream: #faf7f2;
  --shadow-soft: 0 1px 2px rgb(28 25 23 / 0.06), 0 12px 32px -16px rgb(28 25 23 / 0.18);
  --radius-hero: 1.5rem;
}
```

Set `body { font-family: var(--font-sans); background: var(--color-cream); }` (replace the Inter stack). Define `:root { --gradient-sunrise: linear-gradient(120deg, #0d9488 0%, #0ea47a 45%, #f59e0b 130%); }`.

- [ ] Step 4: DELETE the global `* { transition: ... }` rule. Add instead a `.heart-pop` keyframe (`scale 1 → 1.35 → 1`, 300ms) and wrap all keyframe/motion utilities in `@media (prefers-reduced-motion: no-preference)`.
- [ ] Step 5: Update `.high-contrast` block: cream backgrounds (`--color-cream`) map to `#000`; add `.high-contrast .shadow-soft { box-shadow: none !important; }`.
- [ ] Step 6: Replace stone-50 page background usages: `Layout.tsx` root `bg-stone-50` → `bg-[--color-cream]` (or a `bg-cream` utility from @theme), and the Home jump-nav `bg-stone-50/95` → cream equivalent.
- [ ] Step 7: `npm test` (823 pass) + `npm run build`; dev-server screenshot: fonts visibly rounded/warm, cream background.
- [ ] Step 8: Commit: `feat(design): warm token foundation — Baloo 2/Nunito Sans, cream surface, soft shadows, targeted motion`

### Task 2: Header + navigation

**Files:**
- Modify: `src/components/layout/Header.tsx`, `src/components/layout/BottomNav.tsx`

**Interfaces:**
- Consumes: `font-display`, cream tokens (Task 1).

- [ ] Step 1: Header: `bg-white shadow-sm` → `bg-[--color-cream]/85 backdrop-blur border-b border-stone-200/60`; wordmark `<span>` drops `hidden sm:inline` (always visible), gets `font-display text-2xl font-bold`; keep heart icon.
- [ ] Step 2: BottomNav mobile: active item becomes filled pill — replace `border-t-2` treatment with a centered pill behind icon+label: active = `bg-teal-600 text-white rounded-full px-4 py-1.5` wrapper (keep 44px+ hit area on the Link, grid cell unchanged); inactive = `text-stone-500`.
- [ ] Step 3: Sidebar desktop: nav label span gains `font-display`; active pill `bg-teal-600/10 text-teal-800 ring-teal-600/20`.
- [ ] Step 4: `npm test` + `npm run build`; mobile + desktop screenshots (nav pill, wordmark).
- [ ] Step 5: Commit: `feat(design): warm header + pill navigation`

### Task 3: Home hero + single disclaimer

**Files:**
- Modify: `src/pages/Home.tsx` (hero section, lines ~154–252)

**Interfaces:**
- Consumes: `--gradient-sunrise`, `font-display`, `.shadow-soft`.
- Produces: hero copy tests may target: h1 text `Eat the parks with confidence.`

- [ ] Step 1: Replace the brand block + catalog box + paragraph + search + chips + disclaimer stack with one hero panel:

```tsx
<section aria-labelledby="home-title" className="rounded-3xl px-5 py-8 sm:px-8 sm:py-10 text-white shadow-soft" style={{ background: 'var(--gradient-sunrise)' }}>
  <h1 id="home-title" tabIndex={-1} className="font-display text-4xl font-bold leading-tight sm:text-5xl">Eat the parks with confidence.</h1>
  <p className="mt-2 max-w-2xl text-base text-white/90 sm:text-lg">
    Carb counts and nutrition confidence for {totalItemCount.toLocaleString()} menu items
    across {totalDestinationCount} destinations — before you reach the queue.
  </p>
  {/* search form: white input, larger radius, no border; submit = amber-400 text-stone-900 */}
  {/* preset chip rail: chips become bg-white/15 text-white border-white/25 hover:bg-white/25; insulin chip = bg-amber-300/90 text-stone-900 */}
</section>
```

Fallback copy when counts aren't ready: subline reads "Carb counts and nutrition confidence for every park day — before you reach the queue."
- [ ] Step 2: Below hero, ONE compact disclaimer line (replaces the amber box): `<p className="text-xs text-stone-600">` with inline warning icon, text `Educational tool — not medical advice. Nutrition may be estimated.` + `Data Sources` link. Favorites nudge becomes matching quiet line in teal.
- [ ] Step 3: Delete: BrandMark hero tile, "Catalog preview" box, the old `<p>` intro (its copy folds into the hero subline).
- [ ] Step 4: Check `src/pages/__tests__/Home*.test*` for assertions on removed copy ("Catalog preview", old h1 `DiabetesGuide`) and update to the new hero copy.
- [ ] Step 5: `npm test` + `npm run build`; screenshots both sizes.
- [ ] Step 6: Commit: `feat(design): sunrise hero + single-line disclaimer on Home`

### Task 4: Themed destination sections

**Files:**
- Modify: `src/pages/Home.tsx` (`ResortDestinationSection`, jump-nav)

**Interfaces:**
- Consumes: `getThemeForResort(group.id)` from `src/lib/park-themes.ts` (exists).

- [ ] Step 1: In `ResortDestinationSection`, replace `const theme = DEFAULT_THEME` with `const theme = getThemeForResort(group.id)` (delete the brand-surface comment — direction changed by spec).
- [ ] Step 2: Resort icon tile: `style={{ background: theme.gradient }}`, rounded-xl; keep the line-icon (SVG) — theme emoji is decorative overkill at this size.
- [ ] Step 3: Category tiles: left accent + icon tile use `theme.primary`; hover backgrounds `style` on group-hover via `theme.surface` — implement with inline CSS var: tile `style={{ ['--tile-tint' as string]: theme.surface, borderLeftColor: theme.primary }}` + class `hover:bg-[--tile-tint]`.
- [ ] Step 4: Jump-nav chips: `bg-white` → cream-blur (`bg-[--color-cream]/90 backdrop-blur`), rounded-full retained.
- [ ] Step 5: `npm test` + `npm run build`; desktop screenshot — WDW indigo, Disneyland pink, Universal amber/black etc.
- [ ] Step 6: Commit: `feat(design): per-resort theming on Home destinations`

### Task 5: MenuItemCard declutter

**Files:**
- Modify: `src/components/menu/MenuItemCard.tsx`
- Check/Modify tests: `src/hooks/__tests__/useMealCart.test.tsx`, any test asserting card copy

**Interfaces:**
- Consumes: existing `GradeBadge` (`size="md"`), `DotMeter`, `getDiabetesAnnotations`, trust helpers — all unchanged.
- Produces: card keeps: `Add to Meal` button text `Add`, aria-labels unchanged pattern, `Details` link text `Details`.

- [ ] Step 1: Restructure per spec §4 (single file edit):
  - Row 1–2 unchanged structurally, but `GradeBadge size="md"` (was lg); category pill → plain text: `{item.restaurant?.name} · {displayCategory}` one muted line.
  - Nutrition row: carbs value gains `font-display text-3xl`; keep carbs DotMeter; REMOVE DotMeters for cal/sugar/protein (plain numbers); keep net + alcohol as-is.
  - ONE trust line replacing 4 blocks (annotation banner, estimate pill, quality-warning line, grade-label line):

```tsx
{trustLine && (
  <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${trustLine.tone === 'risk' ? 'text-amber-800' : 'text-stone-500'}`}>
    <span aria-hidden="true">{trustLine.tone === 'risk' ? '⚠' : '~'}</span>{trustLine.text}
  </p>
)}
```

  with selection logic (in-file helper, no new module):

```tsx
function pickTrustLine(topAnnotation: Annotation | null, isEstimate: boolean): { text: string; tone: 'risk' | 'info' } | null {
  if (topAnnotation && topAnnotation.severity !== 'green') return { text: topAnnotation.text, tone: 'risk' }
  if (isEstimate) return { text: 'Estimate — check details before dosing', tone: 'risk' }
  if (topAnnotation) return { text: topAnnotation.text, tone: 'info' }
  return null
}
```

  - Actions row: primary button `Add` (`rounded-full px-5 h-10`, not flex-1) + Compare icon-only (`aria-label` kept) + right-aligned `Details ›` link (`relative z-10`).
  - DELETE: tags row (Vegetarian/Fried/Seasonal), `More details` link, grade-label line, quality-warnings rendering (`getNutritionQualityWarnings` import removed).
  - Card shell: `shadow-md` → `shadow-soft`, add `transition-transform duration-150 hover:-translate-y-0.5`, keep left theme border.
  - Favorite heart: apply the Task 1 `.heart-pop` animation class while `favoriteNotice` is active (`<svg className={... ${favoriteNotice ? 'heart-pop' : ''}}`) so favoriting gets its micro-interaction.
- [ ] Step 2: `npm test` — fix any failures asserting removed elements (update assertions to new structure; do NOT weaken trust-logic tests in `src/lib/__tests__/`).
- [ ] Step 3: `npm run build`; mobile Browse list screenshot — **≥3 cards visible at 390×844** (spec §8).
- [ ] Step 4: Commit: `feat(design): compact menu card with single trust line`

### Task 6: Browse banners + filter bar

**Files:**
- Modify: `src/pages/Browse.tsx`, `src/components/filters/FilterBar.tsx`

- [ ] Step 1: Browse: merge the amber "Educational tool" box and teal "3,000-item preview" box into one `text-xs text-stone-600` line under the h1: `Educational tool — not medical advice.` plus, only in All-Destinations mode, ` · Showing a 3,000-item preview — pick a destination for the full catalog.` Results-count box → plain text line.
- [ ] Step 2: FilterBar sticky container: `bg-white/80 backdrop-blur border-b border-stone-200/60 shadow-none`; search input + chips pick up new radii; grade filter buttons: circular ring style echoing GradeBadge colors (`GRADE_CONFIG` import for bg colors when active).
- [ ] Step 3: List/By-Destination toggle → segmented control: single `rounded-full bg-stone-200/70 p-1` container, active segment `bg-white shadow-sm rounded-full` (aria-pressed retained).
- [ ] Step 4: `npm test` + `npm run build` + screenshots (mobile: first card above the fold or ≤1.5 screens; desktop grid).
- [ ] Step 5: Commit: `feat(design): unified Browse notices + glassy filter bar`

### Task 7: Validation sweep + cleanup

- [ ] Step 1: Full gates: `npm test`, `npm run lint`, `npm run build`.
- [ ] Step 2: Playwright after-screenshots: Home + Browse-list at 390×844 and 1440×900; high-contrast mode spot check (toggle `.high-contrast`, screenshot Home) — text legible, no invisible elements.
- [ ] Step 3: Contrast spot checks (computed styles): hero subline on gradient ≥4.5:1 (white/90 on teal passes); amber trust line `text-amber-800` on white passes; chip text on hero `text-white` on `bg-white/15` over gradient — verify, darken to `bg-black/15` if needed.
- [ ] Step 4: Delete the scratch screenshots from repo root (`home-mobile.png`, `browse-mobile.png`, `browse-mobile-cards.png`, `browse-list-mobile.png`, `home-desktop.png`, `browse-desktop.png`, `.playwright-mcp/` artifacts) — keep them out of git.
- [ ] Step 5: Final commit if any stragglers; summary with before/after shots for Brad.
