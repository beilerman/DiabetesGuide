# Patient Safety Guardrails Implementation Plan

**Goal:** Prevent unsafe insulin recommendations and make nutrition confidence risks visible before users rely on item data.

**Architecture:** Put all dose validation, hypoglycemia blocking, insulin-on-board subtraction, activity math, and dose caps in `src/lib/insulin.ts`, then render those states from both the standalone estimator and the meal page. Keep route/nav and content wording changes small and isolated.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Tailwind CSS.

## Task 1: Insulin Math Guardrails

**Files:**
- Modify: `src/lib/insulin.ts`
- Test: `src/lib/__tests__/insulin.test.ts`

- [x] Add failing tests for hypoglycemia blocking, range validation, dose warnings, hard dose blocking, IOB subtraction, and activity affecting only carb bolus.
- [x] Implement validation statuses, validation ranges, dose caps, and `activeInsulin`.
- [x] Verify `npm test -- --run src/lib/__tests__/insulin.test.ts`.

## Task 2: Estimator UI

**Files:**
- Modify: `src/pages/InsulinHelper.tsx`
- Modify: `src/pages/Meal.tsx`

- [x] Rename user-facing calculator heading to `Carb & Correction Estimator`.
- [x] Add bounded number fields for BG, target, carbs, ICR, CF, IOB, and max bolus.
- [x] Render hypoglycemia treatment panel instead of results for BG under 70.
- [x] Render warning/blocking states from the dose result with an `aria-live` results region.
- [x] Show that activity adjusts carb bolus only.

## Task 3: Content and Navigation

**Files:**
- Modify: `src/data/education.ts`
- Modify: `src/components/layout/Layout.tsx`

- [x] Rewrite Type 1 insulin guidance to distinguish basal/background insulin from meal/correction bolus insulin.
- [x] Make bottom navigation active state match `/browse`, `/search`, `/meal`, and `/insulin` without highlighting the wrong tab.

## Task 4: Nutrition Confidence Visibility

**Files:**
- Modify: `src/components/menu/MenuItemCard.tsx`
- Modify: `src/hooks/useMealCart.ts`
- Modify: `src/pages/Meal.tsx`
- Implement inline with the existing card and meal components.

- [x] Show low-confidence nutrition flags in card list views.
- [x] Preserve item confidence/source metadata when adding to meals.
- [x] Warn in the meal page when totals include low-confidence items.

## Task 5: Verification and Release

- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run browser smoke check for the insulin and meal estimator pages.
- [x] Attempt `npm run lint`; blocked by existing repository-wide script lint debt.
- [ ] Commit, push, open PR, and deploy a preview.
