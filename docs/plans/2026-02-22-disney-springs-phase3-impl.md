# Disney Springs Phase 3: Chain-Official Priority Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete Disney Springs menu coverage by running prepared dedup scripts, importing prepared data, replacing USDA estimates with official chain nutrition data for 9 chains, and filling remaining sparse restaurants.

**Architecture:** Execute prepared TypeScript scripts against Supabase via `npx tsx`. For chain data, web-research official nutrition pages, create JSON data files, then run a reusable update script. All writes use `--dry-run` first. Audit trail via console + CSV.

**Tech Stack:** TypeScript, Supabase JS client, `npx tsx` runner, web research for chain nutrition data

---

### Task 1: Run Disney Springs Dedup Scripts

**Files:**
- Execute: `scripts/fix-ds-dupes.ts`
- Execute: `scripts/fix-ds-dupes2.ts`
- Execute: `scripts/fix-ds-wine-false-positives.ts`

**Step 1: Run fix-ds-dupes.ts in dry-run mode**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/fix-ds-dupes.ts --dry-run
```
Expected: Console output showing 16 merge groups with item counts. No DB changes.

**Step 2: Run fix-ds-dupes.ts live**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/fix-ds-dupes.ts
```
Expected: 16 merge groups processed, duplicate restaurants removed, items moved to keepers.

**Step 3: Run fix-ds-dupes2.ts live**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/fix-ds-dupes2.ts
```
Expected: 2 specific merges (B.B. Wolf's + Gideon's) completed.

**Step 4: Run fix-ds-wine-false-positives.ts live**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/fix-ds-wine-false-positives.ts
```
Expected: 6 items (PEI Mussels, Ribeye, Linguine and Clams, Seafood Fettuccini, Linguine Alla Burrata, Italian Sausage Pasta) corrected.

**Step 5: Verify with inventory check**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/phase3-inventory.ts "Disney Springs"
```
Expected: Restaurant count decreased (merged duplicates gone). No orphaned items.

---

### Task 2: Import Prepared Disney Springs Data

**Files:**
- Input: `data/parks/disney-springs-missing.json`
- Input: `data/parks/disney-springs-expansion.json`
- Execute: `scripts/phase3-import.ts`

**Step 1: Dry-run import disney-springs-missing.json**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/phase3-import.ts data/parks/disney-springs-missing.json --dry-run
```
Expected: ~93 new items listed across 6 restaurants (Paddlefish, Planet Hollywood, Edison, Terralina, Wolfgang Puck, Enzo's). Some skipped as duplicates of existing items.

**Step 2: Live import disney-springs-missing.json**

Run same command without `--dry-run`.
Expected: Items inserted, audit CSV written to `audit/additions/`.

**Step 3: Dry-run import disney-springs-expansion.json**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/phase3-import.ts data/parks/disney-springs-expansion.json --dry-run
```
Expected: ~310 new items across 10 restaurants. Many may be skipped as duplicates if they overlap with missing.json items.

**Step 4: Live import disney-springs-expansion.json**

Run same command without `--dry-run`.
Expected: New items inserted, duplicates skipped.

**Step 5: Post-import inventory**

Run inventory check to confirm new item counts.

---

### Task 3: Build Chain-Official Update Script

**Files:**
- Create: `scripts/fix-chain-official.ts`

**Step 1: Write the chain-official update script**

Create `scripts/fix-chain-official.ts` that:
- Accepts `<chain-json-path>` as positional arg and optional `--dry-run`
- Reads a chain data JSON file with format:
  ```json
  {
    "chain_name": "Earl of Sandwich",
    "restaurant_names": ["Earl of Sandwich"],
    "park_name": "Disney Springs",
    "source_url": "https://...",
    "items": [
      {
        "name": "Original 1762",
        "category": "entree",
        "calories": 570, "carbs": 50, "fat": 26, "protein": 30,
        "sugar": 6, "fiber": 3, "sodium": 1240,
        "price": 10.99
      }
    ]
  }
  ```
- Finds the park by `.ilike('name', '%Disney Springs%')`
- Finds restaurant(s) by `.in('name', restaurant_names).eq('park_id', parkId)`
- For each JSON item:
  - Tries exact match on `menu_items.name` (case-insensitive via `.ilike`)
  - If match: updates `nutritional_data` with official values, sets `source='official'`, `confidence_score=90`
  - If no match: inserts new `menu_item` + `nutritional_data` with `source='official'`, `confidence_score=90`
- Logs: `[UPDATE] Item Name: 350cal->570cal, 20g->50g carbs` or `[NEW] Item Name: 570cal, 50g carbs`
- Tracks totals: updated, added, skipped (already official)
- `--dry-run` flag skips all writes

Follows existing codebase patterns:
- Supabase client: `createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)`
- Env check with `process.exit(1)`
- Single `.eq('id', id)` updates
- Console logging: section header, per-item details, summary

**Step 2: Verify script compiles**

Run:
```bash
npx tsx --no-cache scripts/fix-chain-official.ts --help 2>&1 | head -5
```
Expected: Script runs without TypeScript errors (may show usage message or error about missing args).

---

### Task 4: Research & Create Earl of Sandwich Chain Data

**Files:**
- Create: `data/chains/earl-of-sandwich.json`
- Execute: `scripts/fix-chain-official.ts`

**Step 1: Web-search Earl of Sandwich nutrition data**

Search for "Earl of Sandwich nutrition information" and "Earl of Sandwich menu calories". Extract official nutrition values for their standard menu items (Original 1762, Holiday Turkey, Italian, Chipotle Chicken Avocado, Tuna Melt, etc.).

**Step 2: Create the chain data JSON**

Write `data/chains/earl-of-sandwich.json` with all menu items and official nutrition values.

**Step 3: Dry-run the update**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/fix-chain-official.ts data/chains/earl-of-sandwich.json --dry-run
```
Expected: Shows matched items with before/after values, new items to add.

**Step 4: Live run**

Run same command without `--dry-run`.

---

### Task 5: Research & Create Blaze Pizza Chain Data

**Files:**
- Create: `data/chains/blaze-pizza.json`

**Step 1: Web-search Blaze Pizza nutrition data**

Search for "Blaze Pizza nutrition information 2026". Blaze publishes full nutrition for all pizzas, dough options, and toppings.

**Step 2: Create chain data JSON and run**

Same pattern as Task 4.

---

### Task 6: Research & Create Chicken Guy! Chain Data

**Files:**
- Create: `data/chains/chicken-guy.json`

Same pattern as Task 4. Search for "Chicken Guy nutrition information".

---

### Task 7: Research & Create Jamba Chain Data

**Files:**
- Create: `data/chains/jamba.json`

Same pattern as Task 4. Search for "Jamba nutrition information 2026". Jamba publishes full smoothie/bowl nutrition.

---

### Task 8: Research & Create Wetzel's Pretzels Chain Data

**Files:**
- Create: `data/chains/wetzels-pretzels.json`

Same pattern. Search for "Wetzel's Pretzels nutrition PDF".

---

### Task 9: Research & Create Auntie Anne's Chain Data

**Files:**
- Create: `data/chains/auntie-annes.json`

Same pattern. Search for "Auntie Anne's nutrition information".

---

### Task 10: Research & Create Sprinkles Chain Data

**Files:**
- Create: `data/chains/sprinkles.json`

Same pattern. Search for "Sprinkles Cupcakes nutrition information".

---

### Task 11: Research & Create Starbucks Chain Data

**Files:**
- Create: `data/chains/starbucks.json`

Starbucks has full nutrition on starbucks.com/menu. Focus on the most popular items that would appear at a Disney Springs location (core drinks, Frappuccinos, food items). This is the largest chain dataset.

Same script execution pattern.

---

### Task 12: Research & Create Coca-Cola Rooftop Data

**Files:**
- Create: `data/chains/coca-cola-rooftop.json`

Standard Coca-Cola product nutrition (Coke, Diet Coke, Sprite, Fanta, etc.) plus any specialty items at the Disney Springs rooftop bar.

---

### Task 13: Post-Chain Inventory & Sparse Restaurant Identification

**Files:**
- Execute: `scripts/phase3-inventory.ts`

**Step 1: Run full Disney Springs inventory**

Run:
```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/phase3-inventory.ts "Disney Springs"
```

**Step 2: Identify sparse restaurants**

From inventory output, list restaurants with fewer than 10 items. These are candidates for Task 14.

---

### Task 14: Fill Remaining Sparse Restaurants

**Files:**
- Create: `data/parks/disney-springs-sparse-fill.json`
- Execute: `scripts/phase3-import.ts`

**Step 1: Research sparse restaurant menus**

For each restaurant identified in Task 13 with < 10 items, web-search current menus via AllEars, DFB, TouringPlans, and official Disney sources.

Priority restaurants:
- Jaleo by Jose Andres
- Chef Art Smith's Homecomin'
- Raglan Road Irish Pub
- Paradiso 37
- City Works Eatery & Pour House
- Wine Bar George
- Pepe by Jose Andres
- Dockside Margaritas
- Quick-service carts

**Step 2: Create sparse-fill JSON**

Write `data/parks/disney-springs-sparse-fill.json` with the same format as other import files.

**Step 3: Dry-run import**

```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/phase3-import.ts data/parks/disney-springs-sparse-fill.json --dry-run
```

**Step 4: Live import**

Run same command without `--dry-run`.

---

### Task 15: Post-Import Quality Verification

**Step 1: Run allergen enrichment on new items**

```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/enrich-allergens.ts
```

**Step 2: Run math audit on Disney Springs subset**

```bash
SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env.local | cut -d'=' -f2) SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2) npx tsx scripts/audit-phase1.ts
```

Review output for any new CRITICAL errors in Disney Springs items.

**Step 3: Generate final summary**

Run inventory one last time and compare before/after:
- Total restaurants (before vs after dedup)
- Total items (before vs after imports)
- Items with official chain data (confidence 90)
- Items with keyword estimates (confidence 30)
- Any restaurants still < 5 items

**Step 4: Update session log**

Append Disney Springs completion summary to `audit/session_log.md`.

---

## Execution Notes

- **Environment:** All scripts require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inline. Use the grep pattern from CLAUDE.md.
- **Safety:** Always `--dry-run` first for scripts that support it. The dedup scripts and wine false-positive script do NOT have dry-run — review their code before running.
- **Chain data research:** Web searches may not always yield complete nutrition. Document which items have official data vs estimates in the chain JSON `notes` field.
- **Carb safety:** When estimating carbs for any item, round UP per the design doc's insulin safety guidance.
- **Batch size:** Tasks 4-12 (chain research) can be done in parallel since they're independent. Tasks 1-2 must be sequential (dedup before import).
