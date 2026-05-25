# Geographic Browse Implementation Plan

**Goal:** Add an optional Browse mode that organizes menu items by resort or destination, destination category, park/hotel, land or area, restaurant, and menu items.

**Architecture:** Keep the existing flat Browse mode intact. Add a pure grouping helper that transforms the filtered menu-item list into nested location groups, then render that grouped tree from `Browse.tsx` using the same `MenuItemCard` actions and existing filters.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tailwind CSS, existing Supabase query hooks.

---

### Task 1: Location Grouping Helper

**Files:**
- Create: `src/lib/menu-location-groups.ts`
- Test: `src/lib/__tests__/menu-location-groups.test.ts`

**Steps:**
1. Write tests for grouping by resort, category, park/hotel, land, restaurant, and preserving item order.
2. Verify the tests fail because `groupMenuItemsByLocation` does not exist.
3. Implement `groupMenuItemsByLocation(items, parks)` using `findResortForPark`.
4. Sort top-level groups by configured resort order, categories by configured resort category order, then venues/lands/restaurants alphabetically.
5. Verify the tests pass.

### Task 2: Browse Mode UI

**Files:**
- Modify: `src/pages/Browse.tsx`

**Steps:**
1. Add a `viewMode` state with `list` and `location`.
2. Add a compact segmented control near the result count.
3. Keep the existing visible-item paging only for list mode.
4. Render the grouped hierarchy in location mode with semantic headings and expandable restaurant sections.
5. Reuse `MenuItemCard` for menu rows and existing meal/favorite/compare handlers.

### Task 3: Verification

**Commands:**
- `npx vitest run src/lib/__tests__/menu-location-groups.test.ts`
- `npm test`
- `npm run build`
- `npx eslint src/lib/menu-location-groups.ts src/lib/__tests__/menu-location-groups.test.ts src/pages/Browse.tsx`
- Browser smoke for `/browse`: switch to By Location, verify grouped headings and cards render on mobile and desktop.

### Task 4: Publish

**Steps:**
1. Stage only the geographic browse files.
2. Commit with `add geographic browse mode`.
3. Push `codex/ux-performance`.
4. Deploy a Vercel preview.
