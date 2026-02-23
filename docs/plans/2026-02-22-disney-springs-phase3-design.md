# Disney Springs Phase 3: Chain-Official Priority Design

**Date:** 2026-02-22
**Goal:** Complete Disney Springs menu coverage with a focus on replacing USDA estimates with official chain nutrition data, then filling remaining sparse restaurants.

## Current State

- **54 restaurants**, **2,246 items** in Supabase
- 3 dedup/fix scripts prepared but not yet executed
- 2 JSON import files ready (~400 items for table-service restaurants)
- Most nutrition data is USDA estimates (confidence 50) or keyword-estimated (confidence 30)
- 9+ chain restaurants have official nutrition data available online

## Execution Order

### Step 1: Pre-Work (Dedup & Prepared Imports)

Run the 3 prepared scripts in order:
1. `fix-ds-dupes.ts` — Merge 43 restaurant name variants into 16 canonical names
2. `fix-ds-dupes2.ts` — Merge 2 remaining specific duplicates (B.B. Wolf's, Gideon's)
3. `fix-ds-wine-false-positives.ts` — Fix 6 items incorrectly given wine nutrition (120 cal, 4g carbs)

Then import prepared JSONs:
4. `disney-springs-missing.json` (93 items for Paddlefish, Planet Hollywood, Edison, Terralina, Wolfgang Puck, Enzo's)
5. `disney-springs-expansion.json` (310 items for T-REX, Morimoto Asia, Rainforest Cafe, Frontera Cocina, and expanded menus for 6 others)

### Step 2: Chain-Official Nutrition Data

For each chain at Disney Springs with official published nutrition:

| Chain | Source | Expected Items |
|-------|--------|---------------|
| Starbucks (2 locations) | starbucks.com/nutrition | 30-50 |
| Earl of Sandwich | Official PDF | 15-25 |
| Blaze Pizza | blazepizza.com/nutrition | 15-20 |
| Chicken Guy! | chickenguy.com | 10-15 |
| Wetzel's Pretzels | Official PDF | 8-12 |
| Jamba | jamba.com/nutrition | 15-20 |
| Sprinkles | sprinkles.com | 8-12 |
| Auntie Anne's | auntieannes.com/nutrition | 8-12 |
| Coca-Cola Rooftop | Standard Coca-Cola products | 10-15 |

**Process per chain:**
1. Web-search for official nutrition page/PDF
2. Extract nutrition data into `data/chains/<chain>.json`
3. Match to existing DB items by name
4. Replace estimates with official values (cal, carbs, fat, protein, sugar, sodium, fiber)
5. Add missing items not yet in DB
6. Update metadata: source='official', confidence_score=90, notes with source URL

**Script:** `scripts/fix-ds-chain-official.ts`
- Accepts chain name argument
- Reads from `data/chains/<chain>.json`
- Fetches current DB items for that restaurant
- Fuzzy-matches by item name
- Supports `--dry-run` flag
- Logs all changes to `audit/changes/disney-springs-chains.csv`

### Step 3: Remaining Sparse Restaurant Fill

After chains, research and fill table-service/specialty restaurants still sparse:
- Jaleo by Jose Andres
- Chef Art Smith's Homecomin'
- Raglan Road Irish Pub
- Paradiso 37
- City Works Eatery & Pour House
- Wine Bar George
- Pepe by Jose Andres
- Dockside Margaritas
- Quick-service carts (Sunshine Churros, Spring Roll Cart, etc.)

**Process:** Web research current 2026 menus via AllEars, DFB, TouringPlans, official Disney app. Create `data/parks/disney-springs-sparse-fill.json` with items + keyword-estimated nutrition.

### Step 4: Post-Import Quality Pass

- Run `estimate-nutrition-ai.ts` on new items with descriptions but no nutrition
- Run `enrich-allergens.ts` on new items
- Run math audit on Disney Springs subset to verify no new errors introduced
- Generate summary: items added, corrections made, confidence score distribution

## Safety Constraints

- All carbohydrate values rounded UP when estimating (insulin safety)
- `--dry-run` before every write operation
- Track all changes in audit CSV with before/after values
- Never delete items (mark discontinued as is_seasonal=true)

## Success Criteria

- All 9 chain restaurants have official nutrition data (confidence 90)
- All table-service restaurants have 15+ menu items each
- No restaurant has fewer than 5 items
- Math audit shows no new CRITICAL errors
- Audit CSV documents every change
