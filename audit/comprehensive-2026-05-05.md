# Comprehensive Database Audit — 2026-05-05

## Overall: 🟢 PASS

## Row counts

| Item | Value | |
|------|-------|--|
| parks | 44 |  |
| restaurants | 780 |  |
| menu_items | 11867 |  |
| nutritional_data | 11867 |  |
| allergens | 14269 |  |
| 1:1 menu_items ↔ nutritional_data invariant | PASS |  |

## FK orphans

| Item | Value | |
|------|-------|--|
| restaurants without park | 0 |  |
| menu_items without restaurant | 0 |  |
| nutritional_data without item | 0 |  |
| allergens without item | 0 |  |

## Duplicates by normalized name

| Item | Value | |
|------|-------|--|
| duplicate (park, name) restaurant groups | 0 |  |
| duplicate (restaurant, name) item groups | 0 |  |

## Impossible values

| Item | Value | |
|------|-------|--|
| negative macros | 0 |  |
| calories > 5000 | 0 |  |
| sodium > 10000mg | 0 |  |
| sugar > carbs | 0 |  |
| fiber > carbs | 0 |  |

## Source distribution

| Item | Value | |
|------|-------|--|
| source: official | 996 (8.4%) |  |
| source: api_lookup | 5393 (45.4%) |  |
| source: crowdsourced | 5478 (46.2%) |  |
| source: other | 0 (0.0%) |  |

## Confidence distribution

| Item | Value | |
|------|-------|--|
| high (≥80) | 846 (7.1%) |  |
| medium (50–79) | 875 (7.4%) |  |
| low (<50) | 10015 (84.4%) |  |
| null (no confidence recorded) | 131 (1.1%) |  |

## Freshness distribution

| Item | Value | |
|------|-------|--|
| fresh (<12 months) | 11867 (100.0%) |  |
| 12–24 months stale | 0 (0.0%) |  |
| > 2 years stale | 0 (0.0%) |  |
| never verified (null updated_at) | 0 (0.0%) |  |

## Nutrition field coverage

| Item | Value | |
|------|-------|--|
| calories > 0 | 11553 (97.4%) |  |
| carbs not null | 11735 (98.9%) |  |
| protein not null | 11736 (98.9%) |  |
| fat not null | 11719 (98.8%) |  |
| sodium not null | 11732 (98.9%) |  |
| sugar not null | 11722 (98.8%) |  |
| fiber not null | 11722 (98.8%) |  |
| all macros null (empty shells) | 131 (1.1%) |  |
| all macros = 0 | 183 (1.5%) |  |

## Dosing-grade items

| Item | Value | |
|------|-------|--|
| items meeting dosing bar (source=official, conf≥80, carbs not null, fresh) | 812 (6.8%) | 🟡 |

## Category distribution

| Item | Value | |
|------|-------|--|
| entree | 5770 (48.6%) |  |
| beverage | 3037 (25.6%) |  |
| snack | 1362 (11.5%) |  |
| dessert | 1109 (9.3%) |  |
| side | 589 (5.0%) |  |

## Allergen coverage

| Item | Value | |
|------|-------|--|
| menu_items with ≥1 allergen record | 6129 (51.6%) |  |
| avg allergen records per covered item | 2.33 |  |

## Per-park coverage (top 10 by item count)

| Item | Value | |
|------|-------|--|
| Disney Springs | 2816 items, 99% w/ cal, 100% w/ carbs, 14% conf≥50 |  |
| EPCOT | 1356 items, 99% w/ cal, 100% w/ carbs, 16% conf≥50 |  |
| Disney's Animal Kingdom | 1012 items, 99% w/ cal, 100% w/ carbs, 9% conf≥50 |  |
| Universal CityWalk | 983 items, 98% w/ cal, 100% w/ carbs, 23% conf≥50 |  |
| Universal's Epic Universe | 842 items, 84% w/ cal, 90% w/ carbs, 8% conf≥50 |  |
| Universal's Islands of Adventure | 806 items, 97% w/ cal, 100% w/ carbs, 23% conf≥50 |  |
| Disney's Hollywood Studios | 683 items, 99% w/ cal, 99% w/ carbs, 9% conf≥50 |  |
| Universal Studios Florida | 581 items, 94% w/ cal, 97% w/ carbs, 19% conf≥50 |  |
| Dollywood | 417 items, 100% w/ cal, 100% w/ carbs, 28% conf≥50 |  |
| Walt Disney World Resorts | 373 items, 100% w/ cal, 100% w/ carbs, 7% conf≥50 |  |

## Per-park coverage (full)

| Park | Items | Cal % | Carbs % | Conf ≥50 % |
|------|------:|------:|--------:|----------:|
| Disney Springs | 2816 | 99% | 100% | 14% |
| EPCOT | 1356 | 99% | 100% | 16% |
| Disney's Animal Kingdom | 1012 | 99% | 100% | 9% |
| Universal CityWalk | 983 | 98% | 100% | 23% |
| Universal's Epic Universe | 842 | 84% | 90% | 8% |
| Universal's Islands of Adventure | 806 | 97% | 100% | 23% |
| Disney's Hollywood Studios | 683 | 99% | 99% | 9% |
| Universal Studios Florida | 581 | 94% | 97% | 19% |
| Dollywood | 417 | 100% | 100% | 28% |
| Walt Disney World Resorts | 373 | 100% | 100% | 7% |
| Downtown Disney District | 267 | 97% | 98% | 16% |
| Magic Kingdom Park | 254 | 94% | 96% | 7% |
| Walt Disney World Festivals & Events | 184 | 100% | 100% | 2% |
| SeaWorld Orlando | 165 | 99% | 100% | 1% |
| Kings Island | 158 | 99% | 100% | 28% |
| Universal's Volcano Bay | 146 | 95% | 97% | 18% |
| Busch Gardens Tampa Bay | 119 | 98% | 100% | 4% |
| EPCOT Flower & Garden Festival 2026 | 117 | 100% | 100% | 0% |
| Walt Disney World & Universal Orlando - Additional Dining | 108 | 100% | 100% | 5% |
| Disneyland Resort Hotels | 56 | 100% | 100% | 11% |
| Disney's Typhoon Lagoon Water Park | 52 | 81% | 87% | 19% |
| Aulani, A Disney Resort & Spa | 41 | 100% | 100% | 17% |
| Disney Treasure | 29 | 100% | 100% | 7% |
| Disney Magic | 28 | 100% | 100% | 21% |
| Disney Wish | 28 | 100% | 100% | 11% |
| Disney Dream | 26 | 100% | 100% | 12% |
| Disney Fantasy | 26 | 100% | 100% | 12% |
| Disney Wonder | 24 | 100% | 100% | 13% |
| Universal Cabana Bay Beach Resort | 19 | 100% | 100% | 21% |
| Universal Royal Pacific Resort | 18 | 100% | 100% | 6% |
| Walt Disney World Parks | 15 | 100% | 100% | 0% |
| Universal Portofino Bay Hotel | 15 | 100% | 100% | 7% |
| Epic Universe Hotels | 14 | 100% | 100% | 7% |
| Universal Hard Rock Hotel | 14 | 100% | 100% | 7% |
| Universal Sapphire Falls Resort | 13 | 100% | 100% | 23% |
| Universal Aventura Hotel | 11 | 100% | 100% | 18% |
| Universal Endless Summer Resort - Dockside Inn | 10 | 100% | 100% | 0% |
| Universal Stella Nova Resort | 10 | 100% | 100% | 20% |
| Universal Terra Luna Resort | 10 | 100% | 100% | 10% |
| Disney's BoardWalk | 7 | 100% | 100% | 0% |
| Universal Endless Summer Resort - Surfside Inn | 7 | 100% | 100% | 0% |
| Disney's Grand Floridian Resort | 4 | 100% | 100% | 25% |
| Disney's Contemporary Resort | 3 | 100% | 100% | 0% |

