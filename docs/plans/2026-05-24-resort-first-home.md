# Resort-First Home Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the initial page organize destinations by resort instead of listing all parks in one flat grid.

**Architecture:** Add a pure Home grouping helper that transforms parks and menu item counts into resort/category groups. Update `Home.tsx` to render those groups with the existing resort routes. Keep search, top-rated, and insulin quick actions intact.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Query, React Router, Vitest, Tailwind CSS.

---

### Task 1: Resort Grouping Helper

**Files:**
- Create: `src/lib/home-resort-groups.ts`
- Test: `src/lib/__tests__/home-resort-groups.test.ts`

**Steps:**
1. Write a failing test that expects parks to group by configured resort and category order.
2. Include a WDW hotel, WDW water park, Disneyland park, Universal hotel, and unknown park in the fixture.
3. Assert item counts are summed from `Map<parkId, count>`.
4. Assert categories with zero counted items are hidden when count data is available.
5. Implement the helper using `findResortForPark`, `findCategoryForPark`, and `RESORT_CONFIG`.
6. Run the helper test and keep it green.

### Task 2: Home UI

**Files:**
- Modify: `src/pages/Home.tsx`

**Steps:**
1. Replace the flat sorted park grid with resort sections from `buildHomeResortGroups`.
2. Keep the compact hero and quick actions.
3. Rename the section heading to "Choose a Destination".
4. Add category links to `/resort/:resortId/:categoryId`.
5. Add resort "Browse all" links to `/resort/:resortId`.
6. Keep loading and error states readable on mobile.

### Task 3: Verification

**Commands:**
- `npx vitest run src/lib/__tests__/home-resort-groups.test.ts`
- `npm test`
- `npm run build`
- `npx eslint src/pages/Home.tsx src/lib/home-resort-groups.ts src/lib/__tests__/home-resort-groups.test.ts`
- `git diff --check`
- Browser smoke for `/` on mobile and desktop.

### Task 4: Publish

**Steps:**
1. Stage only the Home resort files and plan docs.
2. Commit with `organize home by resort`.
3. Push `codex/ux-performance`.
4. Deploy a Vercel preview.
