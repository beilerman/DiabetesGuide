# Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign DiabetesGuide into an immersive, park-themed PWA with A-F diabetes grades, integrated meal builder + insulin calculator, trip planner, comparison view, and full offline support.

**Architecture:** Extend existing React 19 + Vite + Tailwind SPA. Add Vitest for testing, Fuse.js for search, idb for IndexedDB, vite-plugin-pwa for service worker. All new features are client-side computed (grades, annotations). Data stays in Supabase with IndexedDB cache layer.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS v4, Vitest, Fuse.js, idb, vite-plugin-pwa, jsPDF

**Design doc:** `docs/plans/2026-02-20-frontend-redesign-design.md`

---

## Phase 1: Foundation (test setup, dependencies, grade system, themes)

### Task 1: Set Up Vitest + Testing Library

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test-utils.tsx`
- Modify: `package.json`
- Modify: `tsconfig.app.json`

**Step 1: Install test dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

**Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-utils.tsx'],
    css: false,
  },
})
```

**Step 3: Create src/test-utils.tsx**

```typescript
import '@testing-library/jest-dom'
```

**Step 4: Add test script to package.json**

Add to scripts: `"test": "vitest run"`, `"test:watch": "vitest"`

**Step 5: Update tsconfig.app.json**

Add `"vitest/globals"` to `compilerOptions.types` array.

**Step 6: Verify with `npm test`**

Expected: "No test files found" (no error).

**Step 7: Commit**

```bash
git add vitest.config.ts src/test-utils.tsx package.json package-lock.json tsconfig.app.json
git commit -m "chore: set up vitest + testing library"
```

---

### Task 2: Install New Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install production dependencies**

```bash
npm install fuse.js idb
```

**Step 2: Install dev dependencies**

```bash
npm install -D vite-plugin-pwa jspdf @types/jspdf
```

**Step 3: Verify build still works**

```bash
npm run build
```

Expected: Clean build, no errors.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add fuse.js, idb, vite-plugin-pwa, jspdf"
```

---

### Task 3: Implement Diabetes Grade Scoring System

**Files:**
- Create: `src/lib/grade.ts`
- Create: `src/lib/__tests__/grade.test.ts`

**Step 1: Write failing tests for grade calculation**

```typescript
// src/lib/__tests__/grade.test.ts
import { describe, it, expect } from 'vitest'
import { computeGrade, computeScore } from '../grade'

describe('computeScore', () => {
  it('scores a low-carb high-protein item as A', () => {
    const score = computeScore({ calories: 250, carbs: 12, fat: 14, protein: 28, sugar: 2, fiber: 3, sodium: 400 })
    expect(score).toBeGreaterThanOrEqual(85)
  })

  it('scores a high-sugar dessert as D or F', () => {
    const score = computeScore({ calories: 800, carbs: 95, fat: 38, protein: 6, sugar: 72, fiber: 1, sodium: 300 })
    expect(score).toBeLessThan(55)
  })

  it('scores a moderate item as C', () => {
    const score = computeScore({ calories: 550, carbs: 48, fat: 22, protein: 24, sugar: 12, fiber: 4, sodium: 800 })
    expect(score).toBeGreaterThanOrEqual(55)
    expect(score).toBeLessThan(70)
  })

  it('handles zero carbs gracefully', () => {
    const score = computeScore({ calories: 200, carbs: 0, fat: 14, protein: 22, sugar: 0, fiber: 0, sodium: 400 })
    expect(score).toBeGreaterThanOrEqual(85)
  })

  it('handles null/missing nutrition by returning null', () => {
    const score = computeScore({ calories: null, carbs: null, fat: null, protein: null, sugar: null, fiber: null, sodium: null })
    expect(score).toBeNull()
  })
})

describe('computeGrade', () => {
  it('maps scores to correct letter grades', () => {
    expect(computeGrade(92)).toBe('A')
    expect(computeGrade(75)).toBe('B')
    expect(computeGrade(60)).toBe('C')
    expect(computeGrade(45)).toBe('D')
    expect(computeGrade(30)).toBe('F')
  })

  it('returns null for null score', () => {
    expect(computeGrade(null)).toBeNull()
  })

  it('applies alcohol penalty', () => {
    const withoutAlcohol = computeScore({ calories: 200, carbs: 20, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 10 })
    const withAlcohol = computeScore({ calories: 200, carbs: 20, fat: 0, protein: 0, sugar: 18, fiber: 0, sodium: 10, alcoholGrams: 14 })
    expect(withAlcohol!).toBeLessThan(withoutAlcohol!)
  })

  it('gives zero-calorie items automatic A', () => {
    const score = computeScore({ calories: 0, carbs: 0, fat: 0, protein: 0, sugar: 0, fiber: 0, sodium: 0 })
    expect(score).toBe(100)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/grade.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement grade.ts**

```typescript
// src/lib/grade.ts

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface GradeColors {
  bg: string
  text: string
  label: string
}

export const GRADE_CONFIG: Record<Grade, GradeColors> = {
  A: { bg: '#16a34a', text: '#ffffff', label: 'Diabetes-friendly' },
  B: { bg: '#65a30d', text: '#ffffff', label: 'Good choice' },
  C: { bg: '#ca8a04', text: '#ffffff', label: 'Plan your bolus' },
  D: { bg: '#ea580c', text: '#ffffff', label: 'Caution — high carb impact' },
  F: { bg: '#dc2626', text: '#ffffff', label: 'Consider alternatives' },
}

interface NutritionInput {
  calories: number | null
  carbs: number | null
  fat: number | null
  protein: number | null
  sugar: number | null
  fiber: number | null
  sodium: number | null
  alcoholGrams?: number | null
}

function scoreNetCarbs(netCarbs: number): number {
  if (netCarbs <= 15) return 100
  if (netCarbs <= 30) return 80
  if (netCarbs <= 45) return 60
  if (netCarbs <= 60) return 40
  if (netCarbs <= 80) return 20
  return 0
}

function scoreSugarRatio(sugar: number, carbs: number): number {
  if (carbs === 0) return 100
  const ratio = sugar / carbs
  if (ratio < 0.2) return 100
  if (ratio < 0.4) return 70
  if (ratio < 0.6) return 40
  return 10
}

function scoreProteinRatio(protein: number, carbs: number): number {
  if (carbs === 0) return 100
  const ratio = protein / carbs
  if (ratio > 1.0) return 100
  if (ratio > 0.5) return 75
  if (ratio > 0.25) return 50
  return 20
}

function scoreFiber(fiber: number): number {
  if (fiber >= 8) return 100
  if (fiber >= 5) return 75
  if (fiber >= 2) return 50
  return 20
}

function scoreCalories(calories: number): number {
  if (calories < 300) return 100
  if (calories < 500) return 75
  if (calories < 700) return 50
  return 25
}

export function computeScore(n: NutritionInput): number | null {
  if (n.calories == null || n.carbs == null) return null

  // Zero-calorie items are automatic 100
  if (n.calories === 0 && n.carbs === 0) return 100

  const carbs = n.carbs ?? 0
  const sugar = n.sugar ?? 0
  const fiber = n.fiber ?? 0
  const protein = n.protein ?? 0
  const calories = n.calories ?? 0
  const netCarbs = Math.max(0, carbs - fiber)

  const weighted =
    scoreNetCarbs(netCarbs) * 0.4 +
    scoreSugarRatio(sugar, carbs) * 0.2 +
    scoreProteinRatio(protein, carbs) * 0.15 +
    scoreFiber(fiber) * 0.15 +
    scoreCalories(calories) * 0.1

  // Alcohol penalty
  const alcoholPenalty = (n.alcoholGrams ?? 0) > 0 ? 15 : 0

  return Math.max(0, Math.round(weighted - alcoholPenalty))
}

export function computeGrade(score: number | null): Grade | null {
  if (score == null) return null
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export function getGradeForItem(n: NutritionInput): { score: number | null; grade: Grade | null; colors: GradeColors | null } {
  const score = computeScore(n)
  const grade = computeGrade(score)
  const colors = grade ? GRADE_CONFIG[grade] : null
  return { score, grade, colors }
}
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/__tests__/grade.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/grade.ts src/lib/__tests__/grade.test.ts
git commit -m "feat: implement A-F diabetes grade scoring system"
```

---

### Task 4: Implement Diabetes Annotations Engine

**Files:**
- Create: `src/lib/annotations.ts`
- Create: `src/lib/__tests__/annotations.test.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/__tests__/annotations.test.ts
import { describe, it, expect } from 'vitest'
import { getDiabetesAnnotations, type Annotation } from '../annotations'

describe('getDiabetesAnnotations', () => {
  it('flags high simple sugar', () => {
    const annotations = getDiabetesAnnotations({ calories: 400, carbs: 50, sugar: 35, fat: 10, protein: 5, fiber: 1, sodium: 200, alcoholGrams: 0, category: 'dessert', isFried: false })
    expect(annotations[0].text).toContain('rapid glucose spike')
    expect(annotations[0].severity).toBe('red')
  })

  it('praises high protein ratio', () => {
    const annotations = getDiabetesAnnotations({ calories: 350, carbs: 15, sugar: 2, fat: 18, protein: 30, fiber: 2, sodium: 600, alcoholGrams: 0, category: 'entree', isFried: false })
    expect(annotations.some(a => a.text.includes('protein'))).toBe(true)
  })

  it('warns about alcohol', () => {
    const annotations = getDiabetesAnnotations({ calories: 200, carbs: 20, sugar: 18, fat: 0, protein: 0, fiber: 0, sodium: 10, alcoholGrams: 14, category: 'beverage', isFried: false })
    expect(annotations.some(a => a.text.includes('alcohol'))).toBe(true)
    expect(annotations.some(a => a.severity === 'red')).toBe(true)
  })

  it('flags liquid sugar in beverages', () => {
    const annotations = getDiabetesAnnotations({ calories: 300, carbs: 72, sugar: 68, fat: 0, protein: 0, fiber: 0, sodium: 20, alcoholGrams: 0, category: 'beverage', isFried: false })
    expect(annotations[0].text).toContain('Liquid sugar')
  })

  it('notes minimal glucose impact for low carb items', () => {
    const annotations = getDiabetesAnnotations({ calories: 120, carbs: 8, sugar: 2, fat: 6, protein: 10, fiber: 1, sodium: 300, alcoholGrams: 0, category: 'snack', isFried: false })
    expect(annotations.some(a => a.text.includes('Minimal glucose impact'))).toBe(true)
  })

  it('returns empty for null nutrition', () => {
    const annotations = getDiabetesAnnotations({ calories: null, carbs: null, sugar: null, fat: null, protein: null, fiber: null, sodium: null, alcoholGrams: null, category: 'entree', isFried: false })
    expect(annotations).toEqual([])
  })
})
```

**Step 2: Run tests to verify failure**

```bash
npx vitest run src/lib/__tests__/annotations.test.ts
```

**Step 3: Implement annotations.ts**

```typescript
// src/lib/annotations.ts

export type AnnotationSeverity = 'green' | 'amber' | 'red' | 'teal'

export interface Annotation {
  text: string
  severity: AnnotationSeverity
}

interface AnnotationInput {
  calories: number | null
  carbs: number | null
  sugar: number | null
  fat: number | null
  protein: number | null
  fiber: number | null
  sodium: number | null
  alcoholGrams: number | null
  category: string
  isFried: boolean
}

export function getDiabetesAnnotations(item: AnnotationInput): Annotation[] {
  const { calories, carbs, sugar, fat, protein, fiber, alcoholGrams, category, isFried } = item
  if (calories == null || carbs == null) return []

  const annotations: Annotation[] = []
  const s = sugar ?? 0
  const f = fiber ?? 0
  const p = protein ?? 0
  const fa = fat ?? 0
  const alc = alcoholGrams ?? 0
  const sugarRatio = carbs > 0 ? s / carbs : 0
  const proteinRatio = carbs > 0 ? p / carbs : (p > 0 ? 10 : 0)

  // Zero carb beverage — no impact
  if (carbs === 0 && category === 'beverage') {
    annotations.push({ text: 'Zero carb — no glucose impact', severity: 'green' })
    return annotations
  }

  // Liquid sugar (beverages with high sugar)
  if (category === 'beverage' && s > 25) {
    annotations.push({ text: 'Liquid sugar — fastest possible glucose spike', severity: 'red' })
  }

  // Alcohol warnings
  if (alc > 0 && carbs > 30) {
    annotations.push({ text: 'High carbs + alcohol — initial spike then delayed drop. Complex dosing.', severity: 'red' })
  } else if (alc > 0) {
    annotations.push({ text: 'Contains alcohol — may cause delayed hypoglycemia. Monitor BG for 12+ hours', severity: 'red' })
  }

  // High simple sugar
  if (sugarRatio > 0.6 && category !== 'beverage') {
    annotations.push({ text: 'High simple sugar — expect rapid glucose spike', severity: 'red' })
  } else if (sugarRatio > 0.4 && carbs > 40) {
    annotations.push({ text: 'Moderate sugar with high carbs — bolus early', severity: 'amber' })
  }

  // High fat + high carb (delayed absorption)
  if (fa > 40 && carbs > 40) {
    annotations.push({ text: 'High fat may delay carb absorption — consider extended bolus', severity: 'amber' })
  }

  // Fried + high carb
  if (isFried && carbs > 40 && fa <= 40) {
    annotations.push({ text: 'Fried + high carb — fat delays peak but doesn\'t reduce it', severity: 'amber' })
  }

  // Positive: high protein
  if (proteinRatio > 0.8) {
    annotations.push({ text: 'Strong protein — may blunt postprandial rise', severity: 'green' })
  }

  // Positive: good fiber
  if (f > 6 && carbs > 50) {
    annotations.push({ text: 'High fiber offsets some carb impact — watch net carbs', severity: 'teal' })
  } else if (f > 6) {
    annotations.push({ text: 'Good fiber content — slower carb absorption', severity: 'green' })
  }

  // Minimal impact
  if (carbs < 15 && calories < 200 && annotations.length === 0) {
    annotations.push({ text: 'Minimal glucose impact — may not need bolus', severity: 'green' })
  }

  return annotations
}
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/__tests__/annotations.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/annotations.ts src/lib/__tests__/annotations.test.ts
git commit -m "feat: implement diabetes annotation engine"
```

---

### Task 5: Extend Park Theme System

**Files:**
- Modify: `src/lib/resort-config.ts`
- Create: `src/lib/park-themes.ts`
- Create: `src/hooks/useCurrentTheme.ts`

**Step 1: Create park-themes.ts with extended theme config**

Define the full `ParkTheme` interface with pattern overlays and all resort themes per the design doc:
- Walt Disney World: indigo, castle pattern
- Disneyland Resort: rose, castle pattern
- Universal Orlando: amber on black, globe pattern
- SeaWorld/Busch Gardens: cyan, nature pattern
- Dollywood: amber-dark, mountains pattern
- Kings Island: red, coaster pattern
- Disney Cruise Line: blue, none
- EPCOT Festivals: teal, globe pattern
- Default: current teal/stone (fallback)

Each theme includes: `gradient`, `primary`, `secondary`, `surface` (subtle card tint), `icon`, `pattern`.

**Step 2: Create useCurrentTheme hook**

Reads current route params to determine the active park, resolves to the matching resort theme, and sets CSS custom properties on the nearest park-scoped container. Returns the theme object for component use.

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/lib/park-themes.ts src/hooks/useCurrentTheme.ts src/lib/resort-config.ts
git commit -m "feat: add park theming system with per-resort visual identity"
```

---

### Task 6: Extend Filter Types for New Features

**Files:**
- Modify: `src/lib/filters.ts`
- Modify: `src/lib/types.ts`
- Create: `src/lib/__tests__/filters.test.ts`

**Step 1: Write tests for new filter capabilities**

Test: grade filter (A-B only), allergen-free filters (no dairy, no gluten), alcohol-free toggle, new sort options (grade, name).

**Step 2: Extend Filters interface**

Add to `Filters`: `gradeFilter: Grade[] | null`, `allergenFree: string[]`, `hideAlcohol: boolean`. Add `'grade'` to sort options.

**Step 3: Update applyFilters to support new fields**

Grade filtering uses `computeScore` + `computeGrade` on each item's nutrition data. Allergen filtering checks item's allergens array against exclusion list. Grade sort uses computed score descending.

**Step 4: Run tests**

```bash
npx vitest run src/lib/__tests__/filters.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/filters.ts src/lib/types.ts src/lib/__tests__/filters.test.ts
git commit -m "feat: extend filters with grade, allergen-free, and alcohol-free support"
```

---

## Phase 2: Core UI Components

### Task 7: Grade Badge Component

**Files:**
- Create: `src/components/menu/GradeBadge.tsx`
- Create: `src/components/menu/__tests__/GradeBadge.test.tsx`

Circular badge (40px), colored background from GRADE_CONFIG, white bold letter. Optional outer ring in park theme color. Handles null grade with "?" in gray. Passes grade, size (sm/md/lg), optional themeColor props.

---

### Task 8: Dot Meter Component

**Files:**
- Create: `src/components/menu/DotMeter.tsx`
- Create: `src/components/menu/__tests__/DotMeter.test.tsx`

5-dot visual scale. Props: `value`, `max`, `colorFn`. Renders filled/empty dots with ARIA label for accessibility ("3 of 5, moderate"). Used below each macro on food cards.

---

### Task 9: Annotation Badge Component

**Files:**
- Create: `src/components/menu/AnnotationBadge.tsx`

Single-line annotation with severity-colored left border and tinted background. Props: `annotation: Annotation`. Green/amber/red/teal tints.

---

### Task 10: Redesigned MenuItemCard

**Files:**
- Modify: `src/components/menu/MenuItemCard.tsx`
- Modify: `src/components/menu/NutritionBadge.tsx`

Major rewrite of the food card per design doc Section 2:
- Grade badge (top-left, 40px)
- Carbs as hero number (32px bold, leftmost)
- Dot meters below each macro
- Net carbs + fiber line
- Top annotation (from annotations engine)
- "Add to Meal" + "Compare" buttons
- Park-themed left border (3px)
- Expanded state: full nutrition grid, allergens, confidence, photo (lazy), inline "lower carb" suggestions
- Remove placeholder gradient backgrounds (use clean white cards)

---

### Task 11: Compact Search Result Row

**Files:**
- Create: `src/components/search/SearchResultRow.tsx`

Minimal row for search results: grade badge (24px), item name, carbs (bold), restaurant + park (muted). Tap to expand to full card. Used in search overlay for density.

---

## Phase 3: Navigation Restructure

### Task 12: New Route Structure

**Files:**
- Modify: `src/App.tsx`
- Create: `src/pages/ParkDetail.tsx`
- Create: `src/pages/Search.tsx`
- Create: `src/pages/Meal.tsx`
- Create: `src/pages/Plan.tsx`
- Modify: `src/components/layout/Layout.tsx`
- Modify: `src/components/layout/Header.tsx`

Replace current routing with flattened structure:
- `/` — Home (park picker grid, remove resort/category intermediary)
- `/park/:parkId` — Park landing (replaces old resort→category→park chain)
- `/search` — Global search (new dedicated page)
- `/meal` — Meal builder + insulin calc (replaces standalone `/insulin`)
- `/plan` — Trip planner + favorites (replaces `/favorites`)
- `/more` — Unchanged
- Keep `/insulin` as redirect to `/meal`
- Keep `/packing`, `/guide`, `/advice` under `/more`

Update bottom nav: Parks, Search, Meal, Plan, More.

---

### Task 13: Park Landing Page

**Files:**
- Create: `src/pages/ParkDetail.tsx`
- Create: `src/components/park/DiabetesFriendlyPicks.tsx`
- Create: `src/components/park/LandSection.tsx`

Park header with themed gradient + pattern overlay. "Diabetes-Friendly Picks" horizontal carousel (top 10 by grade). Land sections (expandable) with restaurant groups inside. Sticky filter bar scoped to park. Uses `useCurrentTheme` hook for park-specific colors.

---

### Task 14: Home Page Redesign

**Files:**
- Modify: `src/pages/Home.tsx`

Direct park picker grid (no resort intermediary). Each park card shows: themed gradient, park name, item count, top grade distribution ("42 A-rated items"). Quick action buttons remain: "Low Carb Picks", "Search All", "Plan Trip".

---

## Phase 4: Search

### Task 15: Fuse.js Search Index

**Files:**
- Create: `src/lib/search-index.ts`
- Create: `src/lib/__tests__/search-index.test.ts`

Build Fuse.js index from all menu items on first load. Index fields: name (weight 2), description (weight 1), restaurant name (weight 1.5). Configure threshold for fuzzy tolerance (0.4). Export `buildSearchIndex(items)` and `searchItems(index, query, limit)` functions.

Test: "turky leg" matches "Turkey Leg", "dole wip" matches "DOLE Whip".

---

### Task 16: Search Overlay Component

**Files:**
- Create: `src/components/search/SearchOverlay.tsx`
- Create: `src/components/search/RecentSearches.tsx`

Full-screen modal overlay. Autofocus input. Compact result rows (SearchResultRow). Filter chips below input. Recent searches (last 5, localStorage key `dg_recent_searches`). Results from Fuse.js index. Park scoping via dropdown.

---

### Task 17: Enhanced FilterBar

**Files:**
- Modify: `src/components/filters/FilterBar.tsx`

Add: grade multi-toggle pills (A-F), allergen-free toggles, alcohol-free toggle, park dropdown (replaces horizontal pill bar). Active filter count badge. Maintain backward compatibility with existing pages during transition.

---

## Phase 5: Meal Builder

### Task 18: Unified Meal Tab

**Files:**
- Create: `src/pages/Meal.tsx`
- Modify: `src/hooks/useMealCart.ts`

Three-section page: item list, meal totals (with net carbs + composite meal grade + carb goal progress bar), inline insulin calculator. Carbs auto-populate from meal total. ICR/CF/target persist in localStorage key `dg_insulin_settings`.

---

### Task 19: Multiple Named Meals

**Files:**
- Modify: `src/hooks/useMealCart.ts`

Upgrade `useMealCart` to support multiple named meals. Data structure: `{ activeMealId, meals: Record<string, { name, parkId, items }> }`. localStorage key stays `dg_meal_cart`. Add: `createMeal(name, parkId)`, `switchMeal(id)`, `deleteMeal(id)`, `renameMeal(id, name)`.

---

### Task 20: Remove Floating Meal Cart Widget

**Files:**
- Modify: `src/components/layout/Layout.tsx`
- Delete (or empty): `src/components/meal-tracker/MealCart.tsx`

Remove the fixed-position floating cart from Layout. All meal functionality now lives in the Meal tab. Add a small badge on the Meal bottom-nav icon showing item count.

---

## Phase 6: Comparison & Better Choices

### Task 21: Comparison Tray (Bottom Bar)

**Files:**
- Create: `src/components/compare/ComparisonTray.tsx`
- Create: `src/hooks/useCompare.ts`

Persistent bottom bar (above bottom nav). Shows when 1+ items added to compare. Displays item names, count (max 3), "Compare" button. `useCompare` hook: `addToCompare(item)`, `removeFromCompare(id)`, `clearCompare()`, `compareItems`. localStorage key `dg_compare`.

---

### Task 22: Comparison Modal

**Files:**
- Create: `src/components/compare/ComparisonModal.tsx`

Full-screen modal. Column layout per item. Three sections: Diabetes Impact (carbs, net carbs, sugar, fiber), Macros (cal, protein, fat), Other (sodium, allergens, price). Best-in-category dot markers. Grade badges at top. "Add to Meal" per item.

---

### Task 23: Better Choice Suggestions

**Files:**
- Create: `src/components/menu/BetterChoices.tsx`
- Modify: `src/components/menu/MenuItemCard.tsx` (expanded state)

`BetterChoices` component: given a restaurant's items and the current item, finds 1-2 items with better grades from the same restaurant. Rendered inline in expanded card state as "Lower carb at this restaurant:" rows.

---

### Task 24: Diabetes-Friendly Picks Carousel

**Files:**
- Create: `src/components/park/DiabetesFriendlyPicks.tsx`

Horizontal scrollable carousel of top 10 items by grade within a park. Compact cards: grade, name, carbs, restaurant. "See all A & B rated items" link opens search pre-filtered.

---

## Phase 7: Trip Planning

### Task 25: Trip Plan Data Model & Hook

**Files:**
- Create: `src/hooks/useTripPlan.ts`
- Create: `src/lib/__tests__/trip-plan.test.ts`

`useTripPlan` hook managing `dg_trip_plan` in localStorage. Structure: `{ resort, days: [{ park, meals: [{ name, items }] }], carbGoalPerMeal, mealsPerDay }`. Methods: `createPlan(resort, days)`, `assignPark(dayIndex, parkId)`, `addItemToSlot(dayIndex, mealIndex, item)`, `removeItemFromSlot(...)`, `clearPlan()`.

---

### Task 26: Plan Page with Favorites + Trip Tabs

**Files:**
- Create: `src/pages/Plan.tsx`

Two tabs: Favorites (existing hearted items grid, add sort options) and Trip Plan (setup form → day-by-day meal slots → trip summary). "Add all to Day X" bridges favorites into trip plan. Day totals with carb goal progress bars.

---

### Task 27: PDF Export

**Files:**
- Create: `src/lib/export-pdf.ts`

`exportTripPlanPdf(plan)` using jsPDF. Generates printable document: day-by-day meals with carb totals, item grades, restaurant names. Header with trip dates and resort name. Footer with medical disclaimer.

---

## Phase 8: Offline / PWA

### Task 28: IndexedDB Cache Layer

**Files:**
- Create: `src/lib/offline-db.ts`
- Create: `src/lib/__tests__/offline-db.test.ts`

Using `idb` library. Stores: `items` (key: id, indexes: parkId, category), `parks` (key: id), `restaurants` (key: id, index: parkId), `metadata` (lastSync timestamp). Functions: `writeAllItems(items)`, `readAllItems()`, `readItemsByPark(parkId)`, `getLastSync()`, `setLastSync(ts)`.

---

### Task 29: Offline-Aware Query Layer

**Files:**
- Create: `src/lib/offline-queries.ts`
- Modify: `src/lib/queries.ts`

Wrap existing React Query `queryFn` functions with offline fallback:
1. Try Supabase fetch
2. On success: write to IndexedDB (non-blocking)
3. On failure: read from IndexedDB
4. If no cache: throw (first-ever visit with no connection)

Add `useOfflineStatus()` hook that tracks online/offline state and last sync timestamp.

---

### Task 30: Service Worker + PWA Manifest

**Files:**
- Modify: `vite.config.ts`
- Create: `public/manifest.json`
- Modify: `index.html`
- Modify: `src/main.tsx`

Add `vite-plugin-pwa` to vite config with:
- `registerType: 'autoUpdate'`
- Precache app shell (HTML/JS/CSS)
- Runtime caching for Supabase API calls (NetworkFirst strategy)

Create manifest.json with app name, icons, display: standalone, theme_color.

Add PWA meta tags to index.html. Register service worker in main.tsx.

---

### Task 31: Offline Status Banner

**Files:**
- Create: `src/components/layout/OfflineBanner.tsx`
- Modify: `src/components/layout/Layout.tsx`

Thin banner below header when offline: "Offline mode — using cached data from [date]". Auto-hides on reconnect. Uses `useOfflineStatus()` hook.

---

### Task 32: Add updated_at Column for Delta Sync

**Files:**
- Create: `scripts/add-updated-at.ts`

SQL migration script (run via Supabase service role): add `updated_at TIMESTAMPTZ DEFAULT now()` to `menu_items`, `nutritional_data`, `restaurants`. Create trigger function to auto-update on row change. This enables the delta sync — fetch only items changed since last sync.

---

## Phase 9: Polish & Accessibility

### Task 33: WCAG AA Audit & Fixes

**Files:**
- Modify: `src/index.css`
- Various component files

Verify all grade colors pass WCAG AA contrast on white. Verify all touch targets are 48px+. Add ARIA labels to grade badges, dot meters, comparison tray. Verify focus-visible outlines work with new themed colors. Test high-contrast mode with new components.

---

### Task 34: Settings Page

**Files:**
- Create: `src/pages/Settings.tsx`
- Modify: `src/pages/More.tsx`

Add settings link to More page. Settings page includes:
- Show diabetes tips toggle (controls annotation visibility)
- Carb goal per meal (number input)
- Font scale slider
- High contrast toggle
- Data management: export/import JSON, clear all data
- About section with data freshness timestamp

---

### Task 35: Performance Optimization

**Files:**
- Various

Verify initial bundle < 200KB gzipped. Lazy-load: comparison modal, trip plan page, PDF export, settings page. Virtualize long food lists (react-window or CSS content-visibility). Verify search index build < 500ms on low-end device.

---

## Execution Order & Dependencies

```
Phase 1 (Foundation):     Tasks 1-6   — no dependencies
Phase 2 (Components):     Tasks 7-11  — depends on Phase 1
Phase 3 (Navigation):     Tasks 12-14 — depends on Phase 2
Phase 4 (Search):         Tasks 15-17 — depends on Phase 2
Phase 5 (Meal Builder):   Tasks 18-20 — depends on Phase 3
Phase 6 (Compare/Better): Tasks 21-24 — depends on Phase 2
Phase 7 (Trip Planning):  Tasks 25-27 — depends on Phase 5
Phase 8 (Offline/PWA):    Tasks 28-32 — depends on Phase 3
Phase 9 (Polish):         Tasks 33-35 — depends on all above
```

Phases 3, 4, and 6 can run in parallel after Phase 2 completes.

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `npm run build` succeeds with no errors
- [ ] `npm test` passes all tests
- [ ] Grade system produces correct A-F for known items
- [ ] Search finds "turkey leg" in <1 second
- [ ] Meal builder auto-populates insulin calculator
- [ ] Comparison view works with 2 and 3 items
- [ ] Trip plan saves/loads from localStorage
- [ ] App works fully offline after first visit
- [ ] All grade colors pass WCAG AA contrast
- [ ] All touch targets are 48px minimum
- [ ] Initial bundle < 200KB gzipped
- [ ] PDF export generates readable trip plan
