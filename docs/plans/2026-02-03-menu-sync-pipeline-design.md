# Menu Sync Pipeline Design

## Problem

Restaurant entries exist in the database but have sparse menu item coverage. Many popular dining locations only have a handful of items listed, making the app less useful for meal planning.

## Solution

A weekly automated pipeline that scrapes menu data from multiple sources, cross-references for accuracy, estimates nutrition for new items, and generates a diff report for manual approval before publishing.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  SOURCES                                                │
│  ├── Official: disneyworld.com, universalorlando.com   │
│  ├── Fan sites: AllEars.net, DisneyFoodBlog            │
│  └── Aggregators: Yelp menus, Google Maps              │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│  SCRAPER MODULES (per source)                          │
│  - Extract restaurant names, menu items, prices        │
│  - Normalize to common schema                          │
│  - Tag with source + confidence                        │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│  CROSS-REFERENCE & MERGE                               │
│  - Match items across sources by fuzzy name matching   │
│  - Prefer official data, supplement with fan sites     │
│  - Flag conflicts for manual review                    │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│  NUTRITION ESTIMATOR                                   │
│  - Match new items to existing DB items by similarity  │
│  - Apply Applebee's-scale portion assumptions          │
│  - Confidence score based on match quality             │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│  DIFF REPORT (email)                                   │
│  - New items, updated items, removed items             │
│  - One-click approve/reject links                      │
│  - Summary stats per park                              │
└─────────────────────────────────────────────────────────┘
```

## Scraper Modules

Each source gets its own scraper module since they have different HTML structures.

### Priority Sources

| Source | Data Quality | Update Frequency | Scraping Difficulty |
|--------|-------------|------------------|---------------------|
| AllEars.net/dining | High (fan-curated) | Weekly | Easy (static HTML) |
| disneyworld.com/dining | High (official) | Slow | Medium (JavaScript-heavy) |
| universalorlando.com | High (official) | Slow | Medium |
| TouringPlans | High (data-focused) | Weekly | Easy |
| DisneyFoodBlog | Medium (reviews) | Daily | Medium (article parsing) |
| Yelp menus | Variable | Real-time | Hard (anti-scraping) |

**Recommended rollout:** Start with AllEars.net — most complete structured data, scraping-friendly.

### Scraper Output Schema

```typescript
interface ScrapedItem {
  source: 'allears' | 'dfb' | 'official' | 'touringplans' | 'yelp'
  parkName: string
  restaurantName: string
  itemName: string
  description?: string
  price?: number
  category?: 'entree' | 'appetizer' | 'dessert' | 'beverage' | 'side' | 'snack'
  scrapedAt: Date
  confidence: number  // 0-100 based on source reliability
}
```

## Cross-Reference & Merge Logic

### Matching Strategy

1. **Restaurant matching** — Fuzzy match on name (e.g., "Cosmic Ray's Starlight Café" = "Cosmic Ray's")
2. **Item matching** — Normalize names, strip sizes/modifiers, fuzzy match
3. **Conflict resolution priority:**
   - Official park site > AllEars > TouringPlans > DisneyFoodBlog > Yelp
   - More recent scrape wins for prices
   - Keep all unique items even if only one source has them

### Handling Discrepancies

| Scenario | Action |
|----------|--------|
| Item in AllEars but not official site | Add it (official sites are often incomplete) |
| Price differs by <15% | Use official site price |
| Price differs by >15% | Flag for review in diff report |
| Item in DB but not in any source | Mark as "possibly discontinued", keep 4 weeks, then flag |

### Deduplication Example

```
AllEars:  "Angus Bacon Cheeseburger - $14.99"
Official: "1/3 lb Angus Bacon Cheeseburger"  (no price)
DFB:      "Bacon Cheeseburger at Cosmic Ray's - around $15"

Result:   "Angus Bacon Cheeseburger" @ $14.99 (confidence: 85)
```

## Nutrition Estimation

For new items without nutrition data, match to similar existing items in the database.

### Matching Algorithm

1. **Category match** — Must be same type (entree, dessert, beverage, etc.)
2. **Keyword extraction** — Pull key ingredients: "bacon cheeseburger" → [bacon, cheese, burger, beef]
3. **Similarity score** — Compare keywords against existing items, find best matches
4. **Weighted average** — If multiple matches, average nutrition weighted by similarity

### Example

```
New item: "BBQ Bacon Burger" at Restaurantosaurus

Top matches from DB:
  1. "Angus Bacon Cheeseburger" (Cosmic Ray's) — 87% match
  2. "BBQ Burger" (Backlot Express) — 82% match
  3. "Bacon Cheeseburger" (Pecos Bill's) — 79% match

Estimated nutrition (weighted avg):
  Calories: 890  |  Carbs: 58g  |  Fat: 48g  |  Protein: 42g

Confidence: 65 (decent match, flagged for review)
```

### Portion Calibration

Existing DB items already have Applebee's-scale portions from USDA enrichment + multipliers. Matching to existing items automatically inherits correct portion scale — no additional multiplier needed.

### Confidence Thresholds

- **80%+ match** → Auto-approve nutrition estimate
- **50-79%** → Include in diff report with "estimated" flag
- **<50%** → Flag as "needs manual nutrition entry"

## Weekly Diff Report

Email sent every Monday morning summarizing pipeline results.

### Report Format

```
Subject: DiabetesGuide Menu Sync — Week of Feb 3

SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
+47 new items  |  12 price updates  |  3 flagged removals
Coverage: 2,195 → 2,242 items (89% of known restaurants)

NEW ITEMS (47)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Magic Kingdom (8 items)
  ✓ Cosmic Ray's: Plant-based Burger — $15.49
    Est. nutrition: 680 cal, 52g carbs (78% confidence)
  ✓ Pecos Bill's: Churro Sundae — $8.99
    Est. nutrition: 520 cal, 68g carbs (85% confidence)
  ...

EPCOT (12 items)
  ...

NEEDS REVIEW (5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ Price conflict: Turkey Leg — $15.99 (AllEars) vs $13.99 (Official)
⚠ Low confidence: "Galactic Twist" — no similar items found
⚠ Possibly discontinued: Flame Tree BBQ Platter (missing 4 weeks)

ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Approve All New Items]  [Review Individually]  [Skip This Week]
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Scrapers | Node.js + Puppeteer (JS-heavy sites) + Cheerio (static HTML) |
| Scheduler | GitHub Actions (free weekly cron) |
| Data storage | JSON files in repo → script pushes to Supabase on approval |
| Diff report | Email via SendGrid or Resend (free tier) |
| Similarity matching | Keyword overlap algorithm (no ML needed) |

## File Structure

```
scripts/
├── scrapers/
│   ├── allears.ts           # AllEars.net scraper
│   ├── official-wdw.ts      # Disney World official
│   ├── official-uni.ts      # Universal official
│   └── dfb.ts               # Disney Food Blog
├── sync/
│   ├── merge.ts             # Cross-reference logic
│   ├── estimate-nutrition.ts
│   └── generate-diff.ts
├── approve.ts               # One-click approval script
data/
├── scraped/                 # Raw scraper output (gitignored)
├── pending/                 # Merged items awaiting approval
└── approved/                # Approved items ready for DB push
.github/workflows/
└── weekly-menu-sync.yml     # Sunday night cron job
```

## Rollout Plan

1. **Phase 1:** Build AllEars scraper only (biggest coverage gain, easiest to scrape)
2. **Phase 2:** Run manually for 2-3 weeks to tune matching and estimation
3. **Phase 3:** Add weekly GitHub Actions automation once stable
4. **Phase 4:** Layer in additional sources (official sites, TouringPlans, DFB) over time

## Success Metrics

- Menu item coverage: Target 95%+ of known restaurants having 5+ items
- Nutrition coverage: Target 90%+ of items having nutrition data
- Accuracy: <5% of approved items flagged as incorrect by users
- Freshness: Average item age <30 days from last verification
