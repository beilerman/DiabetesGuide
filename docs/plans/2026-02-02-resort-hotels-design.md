# Resort Hotels Expansion Design

## Scope

Add every Disney and Universal resort hotel dining location to DiabetesGuide, covering:

- **Walt Disney World Resorts** (expand existing 29 restaurants)
- **Disneyland Resort Hotels** (Grand Californian, Disneyland Hotel, Pixar Place)
- **Aulani, A Disney Resort & Spa** (Ko Olina, Hawaii)
- **Disney Cruise Line** (Magic, Wonder, Dream, Fantasy, Wish, Treasure — each a separate park-level entry)
- **Universal Orlando Hotels** (Portofino Bay, Hard Rock, Royal Pacific, Cabana Bay, Aventura, Sapphire Falls, Endless Summer Surfside/Dockside, Stella Nova, Terra Luna — each a separate park-level entry)
- **Universal Studios Hollywood Hotels**
- **Epic Universe Hotels** (flag as coming soon if not yet open)

## 1. Database Changes

### New column

```sql
ALTER TABLE nutritional_data ADD COLUMN source_detail TEXT;
NOTIFY pgrst, 'reload schema';
```

### TypeScript type update

Add `source_detail: string | null` to `NutritionalData` in `src/lib/types.ts`.

### Source mapping

Existing `nutrition_source` enum values map to the provenance tags:
- `official` → VERIFIED and CHAIN-MATCHED
- `api_lookup` → RECONSTRUCTED and COMPARABLE
- `crowdsourced` → UNKNOWN (nutrition fields left null)

`source_detail` stores the free-text provenance notes.

## 2. New Park-Level Entries

| Entry | Location | Timezone |
|-------|----------|----------|
| Disneyland Resort Hotels | Disneyland Resort | America/Los_Angeles |
| Aulani, A Disney Resort & Spa | Aulani Resort | Pacific/Honolulu |
| Disney Magic | Disney Cruise Line | America/New_York |
| Disney Wonder | Disney Cruise Line | America/New_York |
| Disney Dream | Disney Cruise Line | America/New_York |
| Disney Fantasy | Disney Cruise Line | America/New_York |
| Disney Wish | Disney Cruise Line | America/New_York |
| Disney Treasure | Disney Cruise Line | America/New_York |
| Universal Portofino Bay Hotel | Universal Orlando Resort | America/New_York |
| Universal Hard Rock Hotel | Universal Orlando Resort | America/New_York |
| Universal Royal Pacific Resort | Universal Orlando Resort | America/New_York |
| Universal Cabana Bay Beach Resort | Universal Orlando Resort | America/New_York |
| Universal Aventura Hotel | Universal Orlando Resort | America/New_York |
| Universal Sapphire Falls Resort | Universal Orlando Resort | America/New_York |
| Universal Endless Summer - Surfside | Universal Orlando Resort | America/New_York |
| Universal Endless Summer - Dockside | Universal Orlando Resort | America/New_York |
| Universal Stella Nova Resort | Universal Orlando Resort | America/New_York |
| Universal Terra Luna Resort | Universal Orlando Resort | America/New_York |
| Universal Studios Hollywood Hotels | Universal Hollywood | America/Los_Angeles |
| Epic Universe Hotels | Universal Orlando Resort | America/New_York |

Existing "Walt Disney World Resorts" entry stays and gets expanded.

Restaurants use `land` to group by hotel name within each park-level entry.

## 3. Data Files

New JSON files in `data/parks/`:

```
disney-resorts-expand.json
disneyland-resort-hotels.json
aulani.json
disney-magic.json
disney-wonder.json
disney-dream.json
disney-fantasy.json
disney-wish.json
disney-treasure.json
universal-portofino-bay.json
universal-hard-rock.json
universal-royal-pacific.json
universal-cabana-bay.json
universal-aventura.json
universal-sapphire-falls.json
universal-endless-summer-surfside.json
universal-endless-summer-dockside.json
universal-stella-nova.json
universal-terra-luna.json
universal-hollywood-hotels.json
epic-universe-hotels.json
```

Each follows the existing format. Nutrition fields are null for non-chain items, enriched via USDA pipeline.

## 4. Import Script Updates

Update `inferLocation()` in `import-all.ts`:

```typescript
function inferLocation(parkName: string): string {
  const n = parkName.toLowerCase()
  if (/aulani/.test(n)) return 'Aulani Resort'
  if (/disney (magic|wonder|dream|fantasy|wish|treasure)/.test(n)) return 'Disney Cruise Line'
  if (/downtown disney|disneyland/.test(n)) return 'Disneyland Resort'
  if (/disney|magic kingdom|epcot|hollywood studios|animal kingdom/.test(n)) return 'Walt Disney World'
  if (/epic universe/.test(n)) return 'Universal Orlando Resort'
  if (/universal.*(hollywood|studios hollywood)/.test(n)) return 'Universal Hollywood'
  if (/universal|islands of adventure|volcano bay/.test(n)) return 'Universal Orlando Resort'
  if (/seaworld/.test(n)) return 'SeaWorld Parks'
  if (/busch gardens/.test(n)) return 'SeaWorld Parks'
  return 'Other'
}
```

Specific patterns before general ones.

## 5. Frontend Changes

### Home page grouping

Add collapsible section headers to the park grid:

- **Walt Disney World** — theme parks + WDW Resorts
- **Disneyland Resort** — theme parks + Downtown Disney + Resort Hotels
- **Universal Orlando** — theme parks + individual hotel entries + Epic Universe
- **Universal Hollywood** — Hollywood Hotels
- **Disney Cruise Line** — 6 ships
- **Other Destinations** — Aulani, SeaWorld, Busch Gardens

New `ParkGroup` component wraps section header + park card grid. Expand/collapse state in localStorage.

### Other pages

- **Browse:** No changes — park filter dropdown gets more entries automatically
- **Park detail:** No changes — already groups by `land`
- **No new routes needed**

## 6. Data Population Strategy

### Prioritization

1. Chain restaurants (published nutrition)
2. WDW resort restaurants (expand existing)
3. Disneyland Resort hotels
4. Universal Orlando hotels
5. Disney Cruise Line (6 ships, menus rotate — flag seasonal)
6. Aulani
7. Epic Universe / Hollywood hotels (coming soon flags)

### Pipeline execution after data files created

```bash
# 1. Supabase migration
# Run ALTER TABLE in SQL editor

# 2. Import
npx tsx scripts/import-all.ts

# 3. USDA enrichment
npx tsx scripts/enrich-nutrition.ts
npx tsx scripts/enrich-from-descriptions.ts

# 4. Allergens
npx tsx scripts/enrich-allergens.ts

# 5. Portion adjustment
npx tsx scripts/adjust-portions.ts

# 6. Audit
npx tsx scripts/audit-dump.ts
npx tsx scripts/audit-nutrition.ts
npx tsx scripts/fix-audit-findings.ts
```

### Data accuracy

Non-chain nutrition fields are left null and enriched through the USDA pipeline. No nutritional values are fabricated from memory. Chain restaurant data uses published sources noted in `source_detail`.

## 7. Estimated Scale

~50-70 new restaurants, ~500-800 menu items across all files.
