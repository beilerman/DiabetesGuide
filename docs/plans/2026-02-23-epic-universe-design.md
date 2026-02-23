# Epic Universe Integration Design

**Date:** 2026-02-23
**Status:** Approved

## Goal

Add Universal's Epic Universe theme park to DiabetesGuide with full nutrition data, allergens, and quality audit.

## Data Source

- Existing scraped data: `data/scraped/universal-2026-02-04.json`
- 24 restaurants across 5 themed worlds + Celestial Park hub
- ~412 menu items
- Scraped from universalorlando.com via GDS CMS format

## Worlds & Restaurants

| World | Restaurants |
|-------|-----------|
| Celestial Park (hub) | Atlantic, Bar Zenith, Celestiki, Comet Dogs, Frosty Moon, Meteor Astropub, Pizza Moon, Star Sui Bao |
| Ministry of Magic | Cafe L'Air de la Sirene, Le Gobelet Noir, Bar Moonshine, The Plastered Owl |
| Isle of Berk | Mead Hall, Spit Fyre Grill, Hooligan's Grog and Gruel |
| Super Nintendo World | Toadstool Cafe, The Bubbly Barrel, Yoshi's Snack Island, Turbo Boost Treats |
| Dark Universe | Das Stakehaus, The Burning Blade Tavern, The Oak and Star Tavern, De Lacey's |

## Pipeline

1. **Dry-run import** — `import-epic-universe.ts --dry-run` to verify counts and data
2. **Live import** — Creates park record, restaurants, menu items, and initial nutrition estimates (191 food type patterns)
3. **USDA enrichment** — `enrich-nutrition.ts` for better matches on common foods
4. **Portion adjustment** — `adjust-portions.ts` for theme park sizing
5. **Allergen inference** — `enrich-allergens.ts` for keyword-based allergen detection
6. **Claude Code AI estimation** — Manual review + script for items USDA can't match (Butterbeer, themed items). No external API needed.
7. **Audit** — `audit-dump.ts` → `audit-nutrition.ts` to flag systemic issues
8. **Fix findings** — `fix-audit-findings.ts` for over-multiplication, missing micros, etc.
9. **Verify** — `check-epic-universe.ts` to confirm final inventory

## What Changes

- **Frontend:** Nothing — app already recognizes "Epic Universe" in `resort-config.ts`
- **Database:** New park row + ~24 restaurants + ~412 menu items + nutrition + allergens
- **Scripts:** No changes to existing scripts

## AI Estimation Approach

Instead of Groq API, Claude Code will:
1. Query items still missing nutrition after USDA enrichment
2. Review names, descriptions, categories with food knowledge
3. Apply theme-park portion awareness (Universal portions are oversized)
4. Write targeted fix script with estimates (confidence_score: 35, source: 'crowdsourced')

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Over-multiplication from adjust-portions.ts | Audit pipeline detects and corrects |
| Theme-park names don't match USDA | Claude Code fills gaps with food knowledge |
| Import script bugs | Dry-run first, verify audit CSV |
| Duplicate items if re-run | Import script deduplicates by restaurant + item name |
