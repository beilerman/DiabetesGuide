# Audit Session Log

## Session 1 — 2026-02-21

### What was done
1. Connected to Supabase and verified access (9,191 items fetched)
2. Generated full database inventory (`00_inventory.md`)
3. Ran Phase 1 math-based audit across all 9,191 items
4. Saved full results to `01_math_audit.csv` (7,233 rows)
5. Saved summary to `01_math_audit_summary.md`

### Summary Stats
- **Items audited:** 9,191
- **Items with nutrition data:** 9,184 (99.9%)
- **CRITICAL findings:** 1,734 (18.9%)
- **ERROR findings:** 592 (6.4%)
- **WARNING findings:** 3,292 (35.8%)
- **INFO findings:** 1,615 (17.6%)
- **Total actionable (CRITICAL+ERROR):** 2,326 (25.3%)

### Key Observations
1. **Alcoholic beverages dominate CRITICAL findings** — most Atwater >50% deviations are cocktails, beer, wine where alcohol calories (7 cal/g) aren't captured in P*4+C*4+F*9. These are EXPECTED deviations, not errors.
2. **Duplicate nutrition profiles** (2,112 findings) — many items at the same restaurant share identical cal/carbs/fat/protein. Likely template-based estimation, not measured.
3. **Miscategorized items** — 795 "entrees" flagged <100 cal. Most are actually beverages (Powerade, Freestyle Cup refills, Icee), fruit (Grapes, Watermelon), or add-ons.
4. **Coffee/tea zero-macro issue** — 223 items (mostly Starbucks brewed coffee sizes) have calories >0 but all macros at 0. Black coffee does have ~5 cal per cup from trace amounts.
5. **Round values / exact Atwater** — 1,460 items have suspiciously round or exactly calculated values, indicating estimated rather than measured data.
6. **Missing core fields** — 177 items missing carbs, protein, or fat entirely.

### Schema Notes
- Actual columns: calories, carbs, fat, sugar, protein, fiber, sodium, cholesterol (all INTEGER)
- NOT available: saturated_fat, trans_fat, added_sugars, serving_size, last_verified, notes, updated_at
- Checks 2d-2f from audit template (saturated/trans fat checks) cannot be performed

### What to do next session
- Phase 2 corrections complete (see Session 2 below)

## Session 2 — 2026-02-21 (continued)

### What was done
Phase 2 corrections applied across ALL parks using automated correction script.

### Correction Script (`scripts/audit-phase2-corrections.ts`)
Built comprehensive correction engine that handles:
1. **Category misclassifications** — Powerade/water/soda as "entree" → "beverage", Grapes/Fruit → "snack"
2. **Beer nutrition** — Matched 20+ beer brands to official published values (Bud Light, Corona, Yuengling, etc.)
3. **Wine nutrition** — Matched wine varietals to standard 5oz pour values (Cab Sav, Champagne, Prosecco, etc.)
4. **Cocktail nutrition** — Matched cocktails to standard recipes (Margarita, Sangria, Old Fashioned, etc.)
5. **Hard seltzer nutrition** — Matched to official brand values (100 cal, 2g carbs per 12oz)
6. **Sugar > carbs fixes** — Capped sugar at carbs value (mathematically impossible otherwise)
7. **Fiber > carbs fixes** — Set fiber to 10% of carbs
8. **Missing bakery macros** — Estimated protein/sugar/fiber/sodium for cupcakes, cinnamon rolls, bear claws, croissants

### False Positive Fixes Applied
- "Pizza Margarita" was matching cocktail regex → excluded pizza/flatbread/margherita
- "Enchanted Rose", "La Vie en Rose" were matching wine regex → excluded with negative lookahead
- Standalone "rose" removed from wine detection (too many false positives)

### Corrections by Park

| Park | Items | Corrections | Key Fixes |
|------|-------|-------------|-----------|
| Magic Kingdom | 30 | 3 | Missing bakery macros |
| EPCOT + F&G Festival | 1,398 | 73 | Beer/wine/cocktail nutrition, category fixes |
| Hollywood Studios | 582 | 5 | Sugar > carbs math fixes |
| Animal Kingdom | 915 | 42 | Beer/cocktail nutrition, category fixes |
| Disney Springs | 2,246 | 55 | Beer/wine/cocktail nutrition |
| Disney Resorts | 387 | 11 | Cocktail nutrition, wine values |
| Downtown Disney | 229 | 1 | 1 fix |
| Universal Studios | 462 | 32 | Beer/cocktail/seltzer nutrition, category fixes |
| Islands of Adventure | 665 | 78 | Beer/soda/cocktail nutrition, category fixes |
| CityWalk | 781 | 21 | Beer/wine/cocktail nutrition |
| Volcano Bay | 150 | 10 | Beer/cocktail nutrition, category fixes |
| Dollywood | 417 | 1 | 1 fix |
| Kings Island | 158 | 2 | 2 fixes |
| SeaWorld | 33 | 0 | No corrections needed |
| Busch Gardens | 26 | 1 | 1 fix |
| Disney Cruise | 161 | 0 | No corrections needed |
| Aulani | 41 | 1 | 1 cocktail fix |
| WDW Festivals | 184 | 1 | 1 fix |
| WDW Additional Dining | 112 | 0 | No corrections needed |
| WDW Parks | 15 | 0 | No corrections needed |
| Disneyland Hotels | 56 | 3 | Cocktail nutrition |
| Universal Hotels (8) | ~100 | 3 | Minor cocktail/seltzer fixes |
| **TOTAL** | **~9,200** | **~342** | |

### Key Stats
- **Total corrections applied:** ~342
- **0 failures** (all DB writes succeeded)
- **False positive rate:** Near 0 after regex fixes
- **Correction types:** ~55% beverage nutrition (beer/wine/cocktails), ~20% cocktails, ~15% category fixes, ~10% math fixes

### Important: What Was NOT Fixed
1. **Duplicate nutrition profiles** (2,112 items) — Same nutrition across different items at a restaurant. These need manual review per restaurant.
2. **Entrees with <100 cal** — Many are correctly low (salads, fruit bowls) or need category reclassification beyond simple regex.
3. **Starbucks zero-macro coffees** — These are correct (black coffee has ~5 cal from trace compounds, 0g macros).
4. **Meat entrees with low protein** — Need web research per item.
5. **Regular sodas with low carbs** — Many are small/kids size or incorrectly entered.
6. **Items with suspicious round values** — Indicates estimated data but not necessarily wrong.

### What to do next session
- Phase 3 for Magic Kingdom complete (see Session 3 below)

## Session 3 — 2026-02-21 (continued)

### What was done
Phase 3: Missing Items — Magic Kingdom Park

#### Pre-work: Duplicate Park Cleanup
1. Merged "Magic Kingdom" (3 items, 1 restaurant) → "Magic Kingdom Park" (27 items, 10 restaurants)
   - 3 duplicate Main Street Bakery items deleted
   - Duplicate park record deleted
2. Merged "Hollywood Studios" (6 items, 2 restaurants) → "Disney's Hollywood Studios" (576 items)
   - 1 unique item (Kyryll Pork Rinds) moved to existing Ronto Roasters
   - 5 duplicate items deleted, duplicate park record deleted

#### Phase 3: Missing Restaurant Discovery
Researched current menus via TouringPlans, WDWMagic, Disney Food Blog, AllEars.net, and official Disney sources.

**Before Phase 3:** 27 items across 10 restaurants
**After Phase 3:** 204 items across 31 restaurants

#### New Restaurants Added (21)

| Restaurant | Land | Type | Items |
|-----------|------|------|-------|
| Auntie Gravity's Galactic Goodies | Tomorrowland | Quick Service | 10 |
| Cheshire Cafe | Fantasyland | Quick Service | 6 |
| AstroFizz | Tomorrowland | Quick Service | 6 |
| The Friar's Nook | Fantasyland | Quick Service | 6 |
| Gaston's Tavern | Fantasyland | Quick Service | 6 |
| Golden Oak Outpost | Frontierland | Quick Service | 5 |
| Liberty Square Market | Liberty Square | Quick Service | 6 |
| Plaza Ice Cream Parlor | Main Street, U.S.A. | Quick Service | 8 |
| Storybook Treats | Fantasyland | Quick Service | 6 |
| Sunshine Tree Terrace | Adventureland | Quick Service | 8 |
| Tomorrowland Terrace Restaurant | Tomorrowland | QS (seasonal) | 5 |
| Westward Ho | Frontierland | Quick Service | 5 |
| Main Street Confectionery | Main Street, U.S.A. | Quick Service | 11 |
| Spring Roll Cart | Adventureland | Quick Service (cart) | 2 |
| Prince Eric's Village Market | Fantasyland | Quick Service | 6 |
| Energy Bytes | Tomorrowland | Quick Service | 4 |
| Be Our Guest Restaurant | Fantasyland | Table Service | 12 |
| Cinderella's Royal Table | Fantasyland | Table Service | 9 |
| The Crystal Palace | Main Street, U.S.A. | Table Service (buffet) | 8 |
| The Plaza Restaurant | Main Street, U.S.A. | Table Service | 14 |
| Jungle Navigation Co. Ltd. Skipper Canteen | Adventureland | Table Service | 14 |

#### Beverage Completeness Additions (20 items)
Added to existing restaurants:
- 4 fountain drinks (Coca-Cola at Casey's, Columbia Harbour House, Cosmic Ray's, Pecos Bill)
- 2 coffee/tea (Brewed Coffee, Hot Chocolate at Main Street Bakery)
- 1 water (Dasani at Cosmic Ray's)
- 10 alcoholic drinks across 5 table service restaurants
- 3 wines (Sauvignon Blanc, Cabernet, Sparkling Wine)
- 4 cocktails (Master's Cupcake, Sunset Margarita, Jungle Bird, Minuteman Margarita)
- 3 beers (Bud Light, Sam Adams, Draft Beer, Kungaloosh Ale)

#### Beverage Coverage Check — All 7 Categories Covered
| Category | Count |
|----------|-------|
| Fountain/Soda | 5 |
| Slushies/Frozen | 11 |
| Coffee/Tea | 2 |
| Milkshakes/Floats | 13 |
| Specialty Non-Alc | 2 |
| Alcoholic | 10 |
| Water/Juice | 2 |

#### Nutrition Estimation Method
All new items estimated via keyword-based pattern matching (157 food profiles covering entrees, desserts, snacks, beverages, sides). Confidence score: 30 (crowdsourced). Estimation prioritizes name-only matching first to avoid false positives from description keywords (lesson learned: "Choice of Two Spring Rolls" description mentioning "cheeseburger" filling was matching the wrong pattern).

Key estimation accuracy improvements:
- Name-first matching prevents description keyword false positives
- Specific patterns before generic (e.g., "mickey sink" before "sundae")
- Beverage-specific patterns for wine (120 cal, 4g carbs), beer, coffee, water
- Turkey leg correctly estimated at 1100 cal (official value: 1093)

#### Files Created
- `data/parks/magic-kingdom-missing.json` — 157 items across 21 restaurants
- `data/parks/magic-kingdom-beverages.json` — 20 additional beverages
- `scripts/phase3-import.ts` — Reusable Phase 3 import script with nutrition estimation
- `scripts/check-beverages.ts` — Beverage coverage checker
- `scripts/fix-duplicate-parks.ts` — Duplicate park merge utility
- `scripts/check-duplicate-parks.ts` — Duplicate park detector
- `audit/additions/magic_kingdom_park_additions.csv` — All additions logged

### What to do next session
- Phase 3 for EPCOT complete (see Session 4 below)

## Session 4 — 2026-02-21 (continued)

### What was done
Phase 3: Missing Items — EPCOT

#### Pre-work: Duplicate Restaurant Cleanup
Merged 5 duplicate restaurant groups at EPCOT:
1. "Regal Eagle Smokehouse" (4 items) → "Regal Eagle Smokehouse: Crafts Drafts & Barbecue" (36 items) — 4 dupes deleted
2. "Les Halles Boulangerie-Patisserie" (2 items) → "Boulangerie Patisserie les Halles" (52 items) — 2 dupes deleted
3. "Tangierine Cafe: Flavors of the Medina" (2 items) → "Tangierine Cafe" (6 items) — 2 unique items moved
4. "Sunshine Seasons" (4 items) → "Sunshine Seasons - All-Day Updated" (73 items) — 4 dupes deleted, renamed to "Sunshine Seasons"
5. "Connections Cafe & Eatery" (4) + "Connections Eatery - Lunch/Dinner Updated" (34) → "Connections Cafe" (46) — 37 unique items moved, 3 dupes deleted, renamed to "Connections Cafe & Eatery"

Also:
- Deleted "Restaurant Marrakesh" (permanently closed since 2020, 12 items removed)
- Deleted empty "Promenade Refreshments" (festival-only, 0 items)
- Deleted empty "Taste Track" (festival-only, 0 items)
- Renamed "Kringla Bakeri Og Kafe - Lunch/Dinner Updated" → "Kringla Bakeri Og Kafe"
- Renamed "Canada Joffrey's Coffee and Tea Company - All-Day Updated" → cleaned

**Total:** 6 restaurants deleted, 37 unique items moved, 13 dupes deleted

#### Phase 3: Sparse Restaurant Fills

| Restaurant | Before | Added | After | Key Items Added |
|-----------|--------|-------|-------|-----------------|
| Shiki-Sai: Sushi Izakaya | 2 | 27 | 29 | Sushi rolls, donburi, udon, tempura, gyoza, desserts |
| Nine Dragons Restaurant | 4 | 13 | 17 | Wontons, bao buns, stir fry, fried rice, ribs, desserts |
| Via Napoli Ristorante e Pizzeria | 6 | 13 | 19 | Pizzas, pasta, calamari, arancini, tiramisu, cannoli |
| Teppan Edo | 5 | 11 | 16 | Teppanyaki combos, steak, salmon, shrimp, volcano roll |
| Chefs de France | 9 | 7 | 16 | French onion soup, boeuf bourguignon, mac gratin, creme brulee |
| La Creperie de Paris | 6 | 8 | 14 | 5 savory galettes, 3 sweet crepes |
| Coral Reef Restaurant | 18 | 4 | 22 | Lobster bisque, coconut shrimp, seafood boil, short rib |
| Lotus Blossom Cafe | 22 | 2 | 24 | Vegetable noodle combo, taro bubble milk tea |
| Kringla Bakeri Og Kafe | 17 | 6 | 23 | School bread, rice cream, lefse, kringla, Viking coffee |

#### New Restaurants Added (2)

| Restaurant | Land | Type | Items |
|-----------|------|------|-------|
| Karamell-Kuche | Germany Pavilion | Quick Service (shop) | 15 |
| Club Cool | World Celebration | Quick Service (tasting) | 3 |

#### Nutrition Estimation Improvements
Added 100+ new food profile patterns for Phase 3 import:
- **Japanese:** edamame, miso soup, sushi rolls, donburi, udon, tempura, gyoza, okonomiyaki, mochi, ramune
- **Chinese:** wontons, bao buns, stir fry, fried rice, kung pao, sesame chicken, spare ribs, bubble tea
- **Italian:** calamari, arancini, caprese, pasta, pizza, tiramisu, cannoli, gelato
- **French:** galettes (savory crepes), sweet crepes, boeuf bourguignon, gratin, profiterole
- **Norwegian:** school bread, rice cream, lefse, kringla
- **German:** caramel squares, caramel bars, caramel pretzel, chocolate-dipped items

Key fixes:
- Fixed "Boeuf Bourguignon" (French spelling) not matching existing beef stew pattern
- Added negative lookbehind for "agedashi tofu" to prevent generic tofu pattern match
- Name-first matching continues to prevent description keyword false positives

#### Key Stats
- **Before Phase 3:** 1,281 items across 72 restaurants
- **After Phase 3:** 1,357 items across 67 restaurants (fewer restaurants due to merges, more items from fills)
- **All 7 beverage categories covered**
- **0 import failures**

#### Files Created/Modified
- `data/parks/epcot-missing.json` — 110 items across 11 restaurants
- `scripts/fix-epcot-dupes.ts` — EPCOT duplicate restaurant merger
- `scripts/phase3-import.ts` — Updated with 100+ cuisine-specific nutrition patterns
- `scripts/phase3-inventory.ts` — Fixed to accept command-line park name argument
- `audit/additions/epcot_additions.csv` — All additions logged

### What to do next session
- Phase 3 for Animal Kingdom, Disney Springs
- Phase 3 for other parks as needed
- Manual review of remaining CRITICAL items (meat entrees <100 cal, starch items with 0 carbs)
- Consider upgrading chain restaurant items to official published nutrition data

## Session 5 — 2026-02-21 (continued)

### What was done
Phase 3: Missing Items — Disney's Hollywood Studios

#### Pre-work: Massive Duplicate Restaurant Cleanup
The AllEars scraper had created one restaurant record per menu item, resulting in 463 restaurant records for ~47 unique names.

**Pass 1 (automated dedup):** Grouped by normalized name, kept record with most items as "keeper", moved unique items, deleted empty records.
- 400 items moved to keepers
- 16 duplicate items deleted
- 418 restaurant records deleted
- 3 restaurants renamed (Sci-Fi Dine-In Theater → Restaurant, 50's → '50s Prime Time Café, Trolley Car Café → with Starbucks)

**Pass 2 (name-variant dedup):** Fixed 6 more groups with similar but non-identical names:
- "Hollywood & Vine" → "Hollywood and Vine" (2 items moved)
- "The Hollywood Brown Derby" → merged with "Hollywood Brown Derby" (6 items moved)
- "The Hollywood Brown Derby Lounge" → merged (7 items moved)
- "Rosie's All-American" → "Rosie's All-American Café" (3 items moved)
- "The Trolley Car Café" → merged with Starbucks version (6 items moved)
- "Min and Bill's Dockside Diner" → merged into "Dockside Diner" (2 items moved, closed location)
- Total: 26 items moved, 0 dupes deleted, 6 restaurants removed

**Result:** 463 restaurants → 33 restaurants, 561 items (from 577 original, 16 dupes removed)

#### Closed Restaurant Handling
2 restaurants permanently closed in 2025 for Monsters, Inc. land expansion:
- **PizzeRizzo** — closed June 7, 2025 (32 items marked `is_seasonal = true`)
- **Mama Melrose's Ristorante Italiano** — closed May 10, 2025 (19 items marked `is_seasonal = true`)
- Total: 51 items preserved as seasonal

#### Phase 3: Sparse Restaurant Fills

| Restaurant | Before | Added | After | Key Items Added |
|-----------|--------|-------|-------|-----------------|
| Docking Bay 7 | 5 | 9 | 14 | Braised Shaak Roast, Fried Endorian Tip-Yip, Smoked Kaadu Ribs, desserts |
| Ronto Roasters | 5 | 7 | 12 | Ronto Wrap, Zucchi Wrap, breakfast wraps, Kyryll Pork Rinds |
| Kat Saka's Kettle | 1 | 2 | 3 | Buttered Blue Grains, Cold Brew Black Caf |
| Milk Stand | 2 | 2 | 4 | Polystarch Puffbread, Tenoo Swirl Crunchies |
| Fairfax Fare | 4 | 6 | 10 | Buffalo Chicken Bowl, Korean BBQ Pork Belly, Brisket Bowl, Mac & Cheese |
| Catalina Eddie's | 3 | 7 | 10 | Chicken Parm, Alfredo Pasta, Cheese/Pepperoni Pizza, Caesar Salad, Meatball Sub, Cannoli |
| Rosie's All-American Café | 5 | 4 | 9 | Chili-Cheese Foot-long, Salad, Plant-based Lobster Roll, PB Cookie Sandwich |
| Anaheim Produce | 1 | 4 | 5 | Fresh Fruit Cup, Hummus, Mickey Pretzel, Frozen Lemonade |
| Hollywood Scoops | 2 | 5 | 7 | Single/Double Scoops, Brownie Sundae, Cookie Sandwich, Float |
| Woody's Lunch Box | 11 | 6 | 17 | BBQ Brisket Melt, Totchos, Grilled Cheese, Lunch Box Tarts |
| Roundup Rodeo BBQ | 10 | 15 | 25 | All BBQ meats, sides (Mac & Cheese, Baked Beans, Corn, Slaw), 4 desserts |
| Tune-In Lounge | 2 | 8 | 10 | Indigo Hibiscus, Dad's Electric Lemonade, PBJ Cocktail, Espresso Martini |
| Sci-Fi Dine-In Theater | 24 | 8 | 32 | Onion Rings, Plant Nachos, Mini Corn Dogs, Cerulean Moon, Cookie Shake |
| '50s Prime Time Café | 23 | 7 | 30 | Cornbread, Onion Rings, Key Lime Bar, Milkshake, Bee Bop Drink |
| The Hollywood Brown Derby | 21 | 8 | 29 | Sake Pork Belly, Halibut, Short Rib, Pork Tenderloin, Crème Brûlée |
| BaseLine Tap House | 17 | 5 | 22 | Avenue Chips, California Sunset, Margarita, Hazy IPA, Mango Cart |
| Oga's Cantina | 17 | 2 | 19 | Bantha Flatbread, Umbaran Cheese Roll |
| Dockside Diner | 27 | 2 | 29 | Coca-Cola Freestyle, Dasani Water |
| Hollywood and Vine | 23 | 5 | 28 | Herbed Chicken, Flank Steak, Green Beans, Whipped Potato, Brussels Sprouts |

#### Key Stats
- **Before Phase 3:** 561 items across 33 restaurants
- **After Phase 3:** 657 items across 33 restaurants
- **New items added:** 96
- **Skipped (duplicates):** 16
- **Closed restaurant items preserved:** 51 (PizzeRizzo + Mama Melrose's)
- **All 7 beverage categories covered**
- **0 import failures**

#### Files Created
- `data/parks/hollywood-studios-missing.json` — 112 items (96 new, 16 existing)
- `scripts/fix-hs-dupes.ts` — Automated dedup by normalized name (pass 1)
- `scripts/fix-hs-dupes-pass2.ts` — Name-variant dedup (pass 2)
- `scripts/mark-hs-closed.ts` — Mark closed restaurant items as seasonal
- `audit/additions/hollywood_studios_additions.csv` — All additions logged
- `audit/changes/hollywood_studios_corrections.csv` — Previous Phase 2 corrections

### What to do next session
- Phase 3 for Disney Springs, Universal parks, Dollywood, Kings Island
- Manual review of remaining CRITICAL items
- Upgrade chain restaurant items to official published nutrition data

---

## Session 6 — Phase 3: Animal Kingdom (Feb 2026)

### Summary
| Metric | Count |
|--------|-------|
| Items before | 908 |
| Items after | 1,013 |
| New items added | 105 (72 + 33 supplement) |
| Category fixes | 116 |
| Restaurants renamed | 2 |
| Land names standardized | 4 |
| Closed restaurants marked | 4 |
| Old menu items marked seasonal | 8 (Terra Treats revamp) |

### Step 1: Duplicate Restaurant Cleanup
- Ran `scripts/fix-ak-dupes.ts --dry-run` — no duplicates found (AK not affected by AllEars scraper issue)
- AK already had clean restaurant records

### Step 2: Inventory
- 36 restaurants, 908 items
- Identified sparse restaurants: Dino-Bite Snacks (1), Trilo-Bites (1), Restaurantosaurus Lounge (1), Terra Treats (5), Mr. Kamal's (6)
- Found naming issues: "Caravan Road - All-Day Updated", "Isle of Java - All-Day Updated"
- Found land inconsistency: "Dinoland U.S.A." vs "Dinoland USA"
- Found 116 beverages miscategorized as "entree" or "dessert" (wines, beers, cocktails, cold brews, chai lattes)

### Step 3: Data Quality Fixes (`scripts/fix-ak-issues.ts`)
1. **Restaurant Renames (2):** Removed "- All-Day Updated" suffix from Caravan Road and Isle of Java
2. **Land Standardization (4):** All DinoLand restaurants → "DinoLand U.S.A." (official Disney spelling)
3. **Category Fixes (95):** Beverages miscategorized as "entree" → "beverage" (wines, beers, cocktails, cold brews, chai lattes, hot chocolate, etc.)
4. **Angry Orchard Fixes (6):** 4 items from "dessert" → "beverage", 2 from "entree" → "beverage"
5. **Additional Category Fixes (10):** Honey Bee, Safari Amber, Old Elephant Foot IPA, Lost on Safari, Tiger Eye Gold Ale → "beverage"
6. **No meat entrees <100 cal** found (good!)
7. **No starch items with 0 carbs** found (good!)

### Step 4: Closed Restaurant Marking (`scripts/fix-ak-closed.ts`)
DinoLand U.S.A. → Tropical Americas retheme:
- **Dino-Bite Snacks:** Permanently closed Oct 2025 (1 item marked seasonal)
- **Trilo-Bites:** Permanently closed Oct 2025 (1 item marked seasonal)
- **Restaurantosaurus:** Closed Feb 1, 2026, menu moved to Harambe Market (35 items marked seasonal)
- **Restaurantosaurus Lounge:** Closed with Restaurantosaurus (1 item marked seasonal)

### Step 5: Missing Items Import (`data/parks/animal-kingdom-missing.json`)
72 new items across 10 restaurants:

| Restaurant | New Items | Key Additions |
|-----------|-----------|---------------|
| Yak and Yeti Restaurant | 38 | Full menu: appetizers (Pot Stickers, Egg Rolls, Firecracker Shrimp, Korean Fried Chicken, Ahi Tuna Nachos), entrees (Hibachi Steak, Korean BBQ Ribs, Lo Mein, Thai Basil Chicken, Miso Salmon, Bhaktapur Duck), desserts (Fried Wontons, Cheesecake, Mango Pie), cocktails (Yak Attack, Tibetan Mule, Mumbai Margarita), sake, kids menu |
| Tiffins Restaurant | 14 | Signature dining: Bread Service, Charcuterie Board, Korean BBQ Bao, Oaxacan Pork Duo, Butter Chicken, Shrimp & Grits, Andean Short Rib, Surf & Turf, Signature Burger, desserts (Hazelnut Entremet, Creme Brulee, Sorbet Trio) |
| Nomad Lounge | 8 | Cocktails (Green Shimmering Margarita, Night Monkey, Tempting Tigress, Leaping Lizard, Annapurna Zing, Lamu Libation), small plates (Tuna Nomad Bowl, Chicken Manchurian Bowl, Impossible Sliders) |
| Warung Outpost | 4 | Maharaja Lime Margarita, Shangri-La Berry Freeze, DOLE Whip Pineapple (relocated from closed Dino-Bite Snacks), DOLE Whip Pineapple Float |
| Eight Spoon Café | 3 | S'mores Churro, Pulled Pork Sliders, Smoked Chicken Wings |
| Terra Treats | 3 | Colombian-style Hot Dog, Vegan Hot Dog, Kettle Chips |
| Mr. Kamal's | 1 | Loaded Fries |
| Tamu Tamu Refreshments | 2 | DOLE Whip Float, DOLE Whip with Rum |
| Pongu Pongu | 3 | Na'vi-sized Pretzel, Night Blossom, Mo'ara Margarita |
| Flame Tree Barbecue | 2 | Ribs/Chicken/Pork Sampler, Smokehouse Chicken Salad |

### Research Sources
- Official Yak & Yeti website (yakandyetirestaurant.com) — full menu with prices
- WDW Luxury Guide (wdwluxuryguide.com) — Tiffins full menu
- Enchanted Foodie Guides — Eight Spoon Café, Terra Treats
- Disney Food Blog, WDW News Today — DinoLand closures confirmed
- Official Disney World website — Pongu Pongu, Flame Tree Barbecue menus

### Step 6: Supplement Import (from deep web research)
After the research agent returned detailed findings from WDWMagic Feb 2026 menus, added 33 more items:
- **Terra Treats:** Complete menu revamp — old hot dog items marked seasonal (8 items), new ice cream menu added (8 items)
- **Eight Spoon Café:** Baked Mac with Buffalo Chicken, Family Churros, Simba Drink, Cub Soda
- **Warung Outpost:** Rafiki Wildberry DOLE Whip, DOLE Whip Cup, Churro, Rum Float
- **Tamu Tamu:** Pineapple Crisp Sundae, Coconut Rum DOLE Whip, Sangria DOLE Whip, African Coffee with Amarula, Mickey Cinnamon Roll, Pistachio Croissant
- **Pongu Pongu:** Nightwraith Blaze (Avatar 3-inspired), Nightwraith Blaze with Vodka
- **Nomad Lounge:** Bangkok Chicken Wings, Grilled Chicken Satay, Cuban Frita Sliders
- **Yak & Yeti:** House Fried Rice, Steamed Rice, Bok Choy, Garlic Noodles, Plant Burger, Korean Kimchi Burger, Roasted Vegetable Bowl, Coconut Shrimp, Berry Cherry Limeade, Shanghai Lemonade

#### Files Created
- `data/parks/animal-kingdom-missing.json` — 91 items (72 new, 19 existing)
- `data/parks/animal-kingdom-missing-supplement.json` — 38 items (33 new, 5 existing)
- `scripts/fix-ak-issues.ts` — Category fixes, renames, land standardization (116 fixes)
- `scripts/fix-ak-closed.ts` — Mark DinoLand closed restaurants as seasonal
- `scripts/fix-terra-treats.ts` — Mark old Terra Treats menu as seasonal
- `scripts/ak-check-issues.ts` — AK data quality issue detector
- `audit/additions/disney_s_animal_kingdom_additions.csv` — All additions logged

### What to do next session
- Phase 3 for Disney Springs (largest venue, 2,246 items, many chains with official data) ← DONE Feb 22
- Phase 3 for Universal parks (USF, IOA, CityWalk, Volcano Bay) ← DONE Feb 23
- Phase 3 for Dollywood, Kings Island
- Upgrade chain restaurant items to official nutrition data (Starbucks, Earl of Sandwich, etc.)
- Manual review of remaining CRITICAL audit findings

---

## Session 7 — Phase 3: Universal Parks + Epic Universe (Feb 23, 2026)

### Summary
| Metric | Count |
|--------|-------|
| Items before | ~10,174 (post-Disney Springs session) |
| Items after | ~11,628 |
| New items added | ~1,454 |
| New restaurants | 24 (23 Epic Universe + 0 others) |
| New parks | 1 (Universal's Epic Universe) |

### Step 1: Inventory
- Ran `scripts/universal-inventory.ts` with corrected park names
- Found actual DB park names: "Universal's Islands of Adventure", "Universal CityWalk", "Universal's Volcano Bay"
- Discovered Epic Universe NOT in DB (23 restaurants, 729 items in scraped data from Feb 4)

### Step 2: Epic Universe Import (`scripts/import-epic-universe.ts`)
**Brand new park** — Universal's Epic Universe opened May 22, 2025. Complete import from `data/scraped/universal-2026-02-04.json`.

| World/Land | Restaurants | Items |
|-----------|-------------|-------|
| Celestial Park | Atlantic, Bar Zenith, Celestiki, Comet Dogs, Frosty Moon, Meteor Astropub, Pizza Moon, Star Sui Bao | ~378 |
| Ministry of Magic | Cafe L'Air de la Sirene, Le Gobelet Noir, Bar Moonshine, The Plastered Owl | ~156 |
| Isle of Berk | Mead Hall, Spit Fyre Grill, Hooligan's Grog and Gruel | ~80 |
| Super Nintendo World | Toadstool Cafe, The Bubbly Barrel, Yoshi's Snack Island, Turbo Boost Treats | ~43 |
| Dark Universe | Das Stakehaus, The Burning Blade Tavern, The Oak and Star Tavern, De Lacey's | ~70 |
| **TOTAL** | **23** | **727** |

Key fixes in `inferCategory()`:
- Word boundaries: `/\bale\b/` (not `/ale/`) → prevents "galette" false positive
- Word boundaries: `/\btea\b/` (not `/tea/`) → prevents "steak" false positive
- `\bcola\b` → prevents "chocolat" false positive
- Added bièraubeurre/Butterbeer, Monster Energy, Powerade, Perrier, Glühwein, fine wine varietals, brand beers (Modelo, Stella, Guinness, etc.)
- Deduplication: tracks `addedThisBatch` Set to handle scraper duplicates within restaurant
- Category distribution: 410 beverage / 236 entree / 31 side / 30 dessert / 20 snack

### Step 3: USF Sparse Fill
Imported `data/parks/universal-studios-missing.json` (prepared in earlier session):
- 20 new items across 4 sparse Springfield restaurants (Cafe La Bamba +4, Cletus' Chicken Shack +5, Lisa's Teahouse of Horror +4, Luigi's Pizza +6) + San Francisco Pastry Company (+1)

### Step 4: Volcano Bay Sparse (in progress)
3 sparse restaurants to fill:
- Dancing Dragons Boat Bar (1 item → needs ~8-10)
- Kohola Reef Restaurant & Social Club (7 items → needs ~15-20)
- The Feasting Frog (3 items → needs ~8-10)

### Step 5: Minion Cafe (in progress)
USF missing restaurant discovered: **Minion Cafe** (Minion Land, opened 2023) — not in DB or scraped data.

### State of Universal Parks After This Session
| Park | Restaurants | Items | Status |
|------|-------------|-------|--------|
| Universal Studios Florida | 20 | 482 | Phase 3 done (Minion Cafe pending) |
| Universal's Islands of Adventure | 20 | 665 | ✅ Already complete |
| Universal CityWalk | 19 | 780 | ✅ Already complete |
| Universal's Volcano Bay | 6 | 139 | Sparse fill pending |
| Universal's Epic Universe | 23 | 727 | ✅ New park fully imported |

### Files Created
- `scripts/import-epic-universe.ts` — Epic Universe importer (scraped format → DB)
- `scripts/universal-inventory.ts` — Universal parks inventory tool
- `scripts/check-scraped-universal.ts` — Scraped data analyzer
- `scripts/check-epic-universe.ts` — Epic Universe post-import verifier
- `scripts/list-parks.ts` — List all parks
- `scripts/list-usf-restaurants.ts` — List USF restaurants
- `scripts/check-eu-structure.ts` — EU scraped data structure check
- `audit/additions/universals_epic_universe_additions.csv` — 727 additions logged
- `audit/additions/universal_studios_florida_additions.csv` — 20 USF additions logged

### What to do next session
- Add Minion Cafe to USF (research in progress)
- Fill Volcano Bay sparse restaurants (Dancing Dragons, Kohola Reef, The Feasting Frog)
- Phase 3 for Dollywood (32 restaurants, 417 items — mostly complete from scraper)
- Phase 3 for Kings Island (40 restaurants, 158 items — thin coverage)
- Phase 3 for SeaWorld Orlando (33 items — very sparse) ← DONE Feb 23
- Phase 3 for Busch Gardens Tampa (26 items — very sparse) ← DONE Feb 23

---

## Session 8 — Phase 3: SeaWorld Orlando + Busch Gardens Tampa Bay (Feb 23, 2026)

### Summary
| Metric | SeaWorld Orlando | Busch Gardens Tampa |
|--------|-----------------|---------------------|
| Items before | 33 (25 active) | 26 |
| Items after | 165 (157 active, 8 seasonal) | 119 |
| New items added | 132 | 93 |
| New restaurants | 12 | 9 |
| Total restaurants | 21 | 16 |
| Data quality fixes | 33 (24 cat + 9 cal) | 31 (20 cat + 11 cal) |

### Step 1: Data Quality Fixes (`scripts/fix-sw-bg-issues.ts`)

**72 total fixes applied across both parks:**

1. **SeaWorld Orlando catch-all restaurant** — 8 duplicate items in a "SeaWorld Orlando" restaurant (likely a different import source) marked as `is_seasonal = true`
2. **Category fixes (44):** Burgers, sandwiches, platters, and Asian entrees incorrectly categorized as "snack" → "entree". Salads miscategorized as "side" → "entree". Pretzel items reclassified ("Cinnamon Sugar Pretzel" → dessert)
3. **Calorie corrections (20):** Over-multiplied values brought to realistic theme park ranges:
   - Hot dogs: 1,300-1,600 → 575 cal
   - Asian entrees: 1,400-1,700 → 800 cal
   - Grilled chicken sandwich: 850 → 625 cal
   - Smoked chicken: 1,200 → 775 cal
   - GF pizza: 1,190 → 750 cal
   - Pretzel dog: 1,099 → 575 cal

### Step 2: Research

Used official park websites (seaworld.com, buschgardens.com), ThemeParkHipster, ThemeParkBites (detailed menu + prices), and web search to identify all dining locations.

**SeaWorld Orlando dining locations identified: 25**
(21 in DB after Phase 3, excluding very small/duplicate venues like Dippin' Dots, ABC Eats, Yummy Yummy Nom Noms, Bubble's Boba Bar)

**Busch Gardens Tampa Bay dining locations identified: 15+**
(16 in DB after Phase 3, including new venues TOMA, Tot Topia, CasBar, SheiKra Eats, Giraffe Bar, Moroccan Delights, Pantopia Drinks and Snacks, Coaster Coffee)

### Step 3: SeaWorld Orlando Import (132 new items)

| Restaurant | Status | New Items | Key Additions |
|-----------|--------|-----------|---------------|
| Sharks Underwater Grill | NEW | 21 | Full fine dining menu: Filet Mignon, Scallops, Salmon, Kobe Sliders, desserts, cocktails |
| Waterway Grill | NEW | 17 | Amazon-inspired: Churrasco Steak, Chicken Sofrito, Smoked Pork, sides, cocktails |
| Chick-fil-A | NEW | 7 | Standard CFA menu (sandwich, spicy, nuggets, fries, lemonade, milkshake) |
| Captain Pete's Island Hot Dogs | NEW | 6 | Nathan's Famous Hot Dogs, chili cheese dog, waffle fries |
| Coaster Coffee Company | NEW | 7 | Starbucks beverages, pastries |
| Dockside Pizza Co. | NEW | 6 | Cheese/pepperoni pizza, breadsticks, salad |
| Panini Shore Cafe | NEW | 6 | Cuban Panini, Chicken Pesto Panini, Caprese Panini |
| Edy's Ice Cream Parlor | NEW | 5 | Ice cream, sundaes, milkshakes, floats |
| Rita's Italian Ice | NEW | 3 | Italian ice, gelati, frozen custard |
| South Pole Sips | NEW | 4 | Frozen margarita, piña colada, craft beer, seltzer |
| Sweet Sailin' Candy Shop | NEW | 5 | Caramel apple, fudge, funnel cake, cotton candy |
| Glacier Bar | EXISTING | 5 | Alcoholic ICEE, nachos, pretzel |
| Flamecraft Bar | EXISTING | 6 | Craft beers, nachos, quesadilla, pretzel |
| Mama's Pretzel Kitchen | EXISTING | 5 | Meatball twist, jalapeño cheese, classic pretzel, drinks |
| Seafire Grill | EXISTING | 5 | Grilled chicken platter, tender basket, kids meals |
| Voyager's Smokehouse | EXISTING | 7 | Pulled pork, smoked chicken, BBQ sampler, sides |
| Altitude Burgers | EXISTING | 4 | Chicken tenders, kids burger, fries, drink |
| Expedition Cafe | EXISTING | 4 | Teriyaki chicken, kids meals |
| Lakeside Grill | EXISTING | 4 | Chicken quesadilla, kids tacos, drinks |
| Sesame Street Food Trucks | EXISTING | 4 | Kids meals, smoothie, juice box |

### Step 4: Busch Gardens Tampa Import (93 new items)

| Restaurant | Status | New Items | Key Additions |
|-----------|--------|-----------|---------------|
| Chick-fil-A | NEW | 8 | Standard CFA menu |
| TOMA at Orang Cafe | NEW | 8 | Latin-American: empanadas, rice bowls, plantain chips |
| Tot Topia | NEW | 6 | Gourmet loaded tater tots (BBQ pork, buffalo chicken, chili cheese) |
| SheiKra Eats | NEW | 6 | Chicken tenders, funnel cake, ice cream |
| Moroccan Delights | NEW | 5 | Ice cream, milkshakes, sundaes |
| Giraffe Bar | NEW | 6 | Cocktails, craft beer, wine, flatbread, charcuterie |
| CasBar | NEW | 3 | Self-serve beer, cocktail, wine |
| Coaster Coffee Company | NEW | 7 | Starbucks beverages, pastries, soft serve, funnel cake |
| Pantopia Drinks and Snacks | NEW | 5 | Turkey leg, chicken tenders, lemonade |
| Dragon Fire Grill | EXISTING | 6 | Kids meals, draft beer, pizza, fountain drink |
| Zagora Cafe | EXISTING | 6 | Kids meals, garden salad, fries, drinks |
| Zambia Smokehouse | EXISTING | 10 | Ribs, brisket, BBQ chicken, sides (mac & cheese, slaw, cornbread) |
| Oasis Pizza | EXISTING | 4 | Kids pizza, salad, breadsticks, drink |
| Dragon Dog | EXISTING | 4 | Pepper Jack Dog, kids dog, chips, drink |
| Twisted Tails Pretzels | EXISTING | 4 | Classic pretzel, bacon fury, beer, seltzer |
| Springs Taproom | EXISTING | 5 | Craft beer, cocktails, wine, mocktail, pretzel |

### Step 5: Allergen Enrichment
Ran `enrich-allergens.ts` — added 97 allergen records for 64 items.

### Files Created
- `data/parks/seaworld-orlando-missing.json` — 132 items across 19 restaurants
- `data/parks/busch-gardens-missing.json` — 93 items across 16 restaurants
- `scripts/fix-sw-bg-issues.ts` — Data quality fix script (categories, calories, duplicates)
- `scripts/sw-bg-inventory.ts` — Inventory tool
- `scripts/count-parks.ts` — Quick park count tool
- `audit/additions/seaworld_orlando_additions.csv` — All additions logged
- `audit/additions/busch_gardens_tampa_bay_additions.csv` — All additions logged

### Key Data Sources
- seaworld.com/orlando/dining/ — Official SeaWorld dining listings (24 venues)
- buschgardens.com/tampa/dining/ — Official BG dining listings (15 venues)
- themeparkbites.com — Detailed menus with prices (Sharks Underwater Grill, Waterway Grill)
- themeparkhipster.com — Restaurant overviews and recommendations

### What to do next session
- Tackle 273 MEDIUM findings (75 caloric-math, 192 plausibility, 6 category-ranking)
- Add Minion Cafe to USF (research in progress)
- Fill Volcano Bay sparse restaurants (Dancing Dragons, Kohola Reef, The Feasting Frog)
- Phase 3 for Dollywood (32 restaurants, 417 items — review for sparse spots)
- Phase 3 for Kings Island (40 restaurants, 158 items — very thin coverage)
- Upgrade chain restaurant items to official nutrition data (Chick-fil-A at SeaWorld/BG)

---

## Session 9 — Audit Round 10: Eliminate all HIGH findings (Feb 24, 2026)

### Summary
| Metric | Before | After |
|--------|--------|-------|
| HIGH findings | 35 | 0 |
| MEDIUM findings | 273 | 273 |
| LOW findings | 5,713 | 5,704 |
| Total findings | 6,021 | 5,977 |
| Items fixed in Supabase | — | 35 |
| Audit profile changes | — | 7 |

### Data Fixes Applied (35 items via `scripts/fix-round10.ts`)

#### Caloric math errors (2 items)
- **High Noon** hard seltzer: P=10g, F=18g → P=0g, F=0g (bad USDA match)
- **Honey Pilsner** (3 records): F=44g → F=0g (beer has zero fat)

#### Kids meals too high (8 items)
All had over-estimated nutrition from USDA matches that returned adult-portion values:
- Satu'li Canteen Kids Bowl: 946→400 cal
- Black Tap Kids Tenders: 765→420, Kids Grilled Cheese: 1131→480, Kids Hot Dog: 680→400
- Yak & Yeti Kids Cheeseburger: 900→480
- Dockside Pizza Kids Cheese Pizza: 850→380
- Altitude Burgers (SeaWorld) Kids Cheeseburger: 900→480
- Zagora Cafe (BG Tampa) Kids Cheeseburger: 900→480
- Oasis Pizza (BG Tampa) Kids Cheese Pizza: 850→380

#### Platters/combos too low (8 items)
All had nutrition for just the main item, not the full combo/platter with fries and sides:
- Gyro Platter: 184→750, Antipasto Platter: 291→650
- Wilson's Reuben Platter: 282→950
- Chicken Parm Combo: 204→1000
- Chili Cheese Dog Combo: 202→800, Platter: 202→700
- Veggie Slice Combo: 224→650, Platter: 116→500

#### Samplers (2 items)
- Supersaurus Sampler (T-REX): 250→1800 cal (shareable appetizer platter)
- Imperial Sampler (Rose & Crown): 240→320 cal (beer flight, not food sampler)

#### Fish entrees (3 items)
- Pan-seared Sustainable Fish: 187→450 (was just the fillet, not full entree)
- Blackened Catfish: 152→500 (cruise dinner entree with sides)
- Fish & Chips (1140 cal.): 1388→1140 (name contains official calorie count)
- Irish Fish & Chips: 301→950 (was just the fish, not full plate)

#### Churros (2 items)
- Bouncin' Mini Churros: 1000→500
- Mini Churros: 800→420

#### Frozen treats (3 items)
- Pomegranate Dole Whip: 102→220 (theme park 8-10oz vs USDA 5oz)
- Dole Whip Pineapple Sorbet: 102→220
- Chocolate Ice Cream Crepe: 170→520

#### Other (2 items)
- Soft Churned Ice Cream: 180→300
- Mac & Cheese with Pulled Pork: 1400→1050
- AMC Chicken Tenders Platter: 1400→1100

### Audit Profile Changes (7 false positives eliminated)

| Profile | Change | Why |
|---------|--------|-----|
| fish entree | Added `fish & chips` profile (700-1400 cal) before generic fish (300-900) | Fish & chips are calorie-dense from deep frying + large portions |
| funnel cake | Added exclude for `/topping/i` | "Funnel Cake Toppings" is just toppings, not a full funnel cake |
| churro | Added exclude for `/family/i` | "Family Churros" (21 pieces, serves 4) at 1200 cal is correct |
| pretzel | Added exclude for `/loaded/i` | Loaded pretzels with charcuterie are more like appetizer platters |
| kids meal (generic) | Added exclude for `/fruit\s*cup/i` | Kid's Fruit Cup (70 cal) is correct — should match fruit plate profile instead |
| platter/sampler | Added exclude for `imperial sampler|beer sampler|wine sampler|flight` | Beer flights aren't food platters |

### Files Created/Modified
- `scripts/fix-round10.ts` — Fix script for 35 items
- `scripts/audit-nutrition.ts` — 7 profile adjustments
- `audit-report.json` — Updated (0 HIGH, 273 MEDIUM, 5704 LOW)
- `audit-dump.json` — Updated with latest Supabase data

### What to do next session
- Tackle 273 MEDIUM findings (75 caloric-math, 192 plausibility, 6 category-ranking)
- Add Minion Cafe to USF
- Fill Volcano Bay sparse restaurants
- Phase 3 for Dollywood, Kings Island
- Upgrade chain restaurant items to official nutrition data
