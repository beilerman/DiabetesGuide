# Epic Universe Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import Universal's Epic Universe (24 restaurants, ~412 items) into DiabetesGuide with full nutrition data, allergens, and quality audit.

**Architecture:** Run the existing import script against Supabase, then run the standard enrichment pipeline (USDA → portions → allergens), fill remaining gaps with Claude Code AI estimation, and audit the results.

**Tech Stack:** TypeScript scripts via `npx tsx`, Supabase PostgreSQL, USDA FoodData Central API

---

### Task 1: Dry-Run Import to Verify Data

**Files:**
- Run: `scripts/import-epic-universe.ts`
- Input: `data/scraped/universal-2026-02-04.json`

**Step 1: Run the import in dry-run mode**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/import-epic-universe.ts --dry-run
```
Expected: Output listing ~24 restaurants and ~400+ items with estimated nutrition. No database changes.

**Step 2: Review the output**

Verify:
- All 5 worlds are represented (Celestial Park, Ministry of Magic, Isle of Berk, Super Nintendo World, Dark Universe)
- Item counts look reasonable per restaurant
- Category inference looks correct (beverages detected, desserts separated from entrees)
- No obvious errors or crash

---

### Task 2: Live Import to Supabase

**Files:**
- Run: `scripts/import-epic-universe.ts`
- Output: `audit/additions/universals_epic_universe_additions.csv`

**Step 1: Run the import live**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/import-epic-universe.ts
```
Expected: Creates park "Universal's Epic Universe", ~24 restaurants, ~400+ menu items with nutrition rows. Writes additions CSV to `audit/additions/`.

**Step 2: Verify with checker script**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/check-epic-universe.ts
```
Expected: Shows all restaurants with item counts, total ~400+ items.

---

### Task 3: USDA Nutrition Enrichment

**Files:**
- Run: `scripts/enrich-nutrition.ts`

**Step 1: Run USDA enrichment**

This processes ALL items in the database. Epic Universe items with generic food names (burger, pizza, salad) will get better USDA matches replacing the keyword estimates.

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) USDA_API_KEY=$(grep '^USDA_API_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/enrich-nutrition.ts
```
Expected: Enriches items with USDA data. Theme-park-specific names (Butterbeer, Pumpkin Juice) won't match — that's expected and will be handled in Task 6.

**Note:** USDA rate limit is 1000 req/hour. The script has built-in 200ms delays. If the full run is too long (processing all 9000+ items), you can skip this step since the import script already provided reasonable keyword-based estimates. The enrichment will process only items that don't already have USDA data.

---

### Task 4: Portion Size Adjustment

**Files:**
- Run: `scripts/adjust-portions.ts`

**Step 1: Run portion adjustment**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/adjust-portions.ts
```

**CAUTION:** This is the biggest data quality risk. The import script's keyword estimates are already roughly theme-park-sized. If USDA enrichment in Task 3 replaced them with standard-serving values, the multiplier is needed. If USDA didn't match (most themed items), the multiplier will OVER-inflate already-correct estimates. The audit in Task 7 will detect and correct over-multiplication.

Expected: Applies multipliers to items with USDA-sourced nutrition. Items that kept their keyword estimates should be minimally affected.

---

### Task 5: Allergen Inference

**Files:**
- Run: `scripts/enrich-allergens.ts`

**Step 1: Run allergen inference**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/enrich-allergens.ts
```
Expected: Adds allergen records based on keyword matching (gluten, dairy, nuts, shellfish, etc.) from item names and descriptions. All flagged as `may_contain` severity.

---

### Task 6: Claude Code AI Nutrition Gap-Fill

**Files:**
- Query: Supabase for Epic Universe items with low confidence or missing nutrition
- Create: `scripts/fix-epic-universe-nutrition.ts` (targeted fix script)

**Step 1: Query items needing estimation**

Query Supabase for Epic Universe items where:
- `confidence_score <= 30` (keyword-only estimates)
- OR `calories IS NULL`
- Items that USDA couldn't match (themed names like Butterbeer, Gigglewater, themed entrees)

**Step 2: Review items and estimate nutrition**

For each unmatched item, Claude Code will:
1. Look at the item name, description, and category
2. Research what the item actually is (e.g., "Le Gobelet Noir Cafe Au Lait" = cafe latte ~150 cal)
3. Estimate nutrition with theme-park portion awareness
4. Apply known values for Universal-specific items (Butterbeer is well-documented at ~350 cal)

**Step 3: Write targeted fix script**

Create `scripts/fix-epic-universe-nutrition.ts` that updates specific items with better estimates. Pattern:
```typescript
const fixes = [
  { name: 'Item Name', restaurant: 'Restaurant', calories: X, carbs: X, ... },
  // ...
]
```
Each fix updates `nutritional_data` with `confidence_score: 35` and `source: 'crowdsourced'`.

**Step 4: Run the fix script with --dry-run first**

Run with `--dry-run`, review output, then run live.

---

### Task 7: Audit

**Files:**
- Run: `scripts/audit-dump.ts` then `scripts/audit-nutrition.ts`

**Step 1: Export audit dump**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/audit-dump.ts
```
Expected: Creates/updates `audit-dump.json` with all items including new Epic Universe data.

**Step 2: Run audit analysis**

Run:
```bash
npx tsx scripts/audit-nutrition.ts
```
Expected: Creates `audit-report.json` with flagged items. Focus on Epic Universe flags — especially:
- Over-multiplied items (calories > food type max range)
- Sugar > carbs violations
- Missing micronutrients

**Step 3: Review Epic Universe flags**

Filter `audit-report.json` for Epic Universe items. Common expected flags:
- Alcoholic drinks showing caloric math gaps (expected — alcohol calories)
- Butterbeer showing high sugar (expected — 80g sugar is correct)
- Over-multiplied entrees if portion adjustment double-inflated keyword estimates

---

### Task 8: Fix Audit Findings

**Files:**
- Run: `scripts/fix-audit-findings.ts`

**Step 1: Run systemic fixes**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/fix-audit-findings.ts
```
Expected: Corrects over-multiplied items, fills missing micros, fixes fiber > carbs violations.

**Step 2: Re-run audit to confirm**

Re-run `audit-dump.ts` → `audit-nutrition.ts` and verify Epic Universe HIGH flags are resolved.

---

### Task 9: Final Verification

**Step 1: Run checker script**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/check-epic-universe.ts
```

**Step 2: Spot-check in the live app**

Open the app (`npm run dev`) and:
- Navigate to Browse → filter by Epic Universe
- Verify restaurants appear with correct world/land grouping
- Check a few items across categories (entree, beverage, dessert)
- Verify nutrition badges show reasonable values
- Check that Butterbeer shows high carbs/sugar (traffic light: red)

**Step 3: Run nutrition quality check**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/check-nutrition-quality.ts
```
Verify Epic Universe items have reasonable nutrition coverage (>90% with calories).

---

### Task 10: Commit and Deploy

**Step 1: Commit the additions CSV and any new fix scripts**

```bash
git add audit/additions/universals_epic_universe_additions.csv
git add scripts/fix-epic-universe-nutrition.ts  # if created in Task 6
git commit -m "feat: add Epic Universe (24 restaurants, ~400+ items) with nutrition data"
```

**Step 2: Deploy to Vercel**

The app reads from Supabase at runtime, so the data is already live once imported. But commit any script changes and push to trigger Vercel redeploy if needed.
