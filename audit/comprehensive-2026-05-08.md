# Comprehensive Database Audit — 2026-05-08

## Overall: 🟢 PASS

## Row counts

| Item | Value | |
|------|-------|--|
| parks | 46 |  |
| restaurants | 963 |  |
| menu_items | 17325 |  |
| nutritional_data | 17325 |  |
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
| source: official | 1012 (5.8%) |  |
| source: api_lookup | 2244 (13.0%) |  |
| source: crowdsourced | 14069 (81.2%) |  |
| source: other | 0 (0.0%) |  |

## Confidence distribution

| Item | Value | |
|------|-------|--|
| high (≥80) | 999 (5.8%) |  |
| medium (50–79) | 3848 (22.2%) |  |
| low (<50) | 6928 (40.0%) |  |
| null (no confidence recorded) | 5550 (32.0%) |  |

## Freshness distribution

| Item | Value | |
|------|-------|--|
| fresh (<12 months) | 17325 (100.0%) |  |
| 12–24 months stale | 0 (0.0%) |  |
| > 2 years stale | 0 (0.0%) |  |
| never verified (null updated_at) | 0 (0.0%) |  |

## Nutrition field coverage

| Item | Value | |
|------|-------|--|
| calories > 0 | 11579 (66.8%) |  |
| carbs not null | 11774 (68.0%) |  |
| protein not null | 11775 (68.0%) |  |
| fat not null | 11771 (67.9%) |  |
| sodium not null | 11771 (67.9%) |  |
| sugar not null | 11761 (67.9%) |  |
| fiber not null | 11761 (67.9%) |  |
| all macros null (empty shells) | 5550 (32.0%) | 🟡 |
| all macros = 0 | 196 (1.1%) |  |

## Dosing-grade items

| Item | Value | |
|------|-------|--|
| items meeting dosing bar (source=official, conf≥80, carbs not null, fresh) | 828 (4.8%) | 🟡 |

## Category distribution

| Item | Value | |
|------|-------|--|
| entree | 8217 (47.4%) |  |
| beverage | 4935 (28.5%) |  |
| dessert | 1621 (9.4%) |  |
| snack | 1457 (8.4%) |  |
| side | 1095 (6.3%) |  |

## Allergen coverage

| Item | Value | |
|------|-------|--|
| menu_items with ≥1 allergen record | 6129 (35.4%) |  |
| avg allergen records per covered item | 2.33 |  |

## Per-park coverage (top 10 by item count)

| Item | Value | |
|------|-------|--|
| Disney Springs | 3560 items, 78% w/ cal, 79% w/ carbs, 24% conf≥50 |  |
| Disneyland Park | 2359 items, 1% w/ cal, 1% w/ carbs, 1% conf≥50 |  |
| EPCOT | 1659 items, 81% w/ cal, 82% w/ carbs, 21% conf≥50 |  |
| Disney's Animal Kingdom | 1309 items, 77% w/ cal, 77% w/ carbs, 10% conf≥50 |  |
| Disney's Hollywood Studios | 1169 items, 58% w/ cal, 58% w/ carbs, 18% conf≥50 |  |
| Universal CityWalk | 983 items, 97% w/ cal, 100% w/ carbs, 62% conf≥50 |  |
| Universal's Epic Universe | 842 items, 84% w/ cal, 90% w/ carbs, 11% conf≥50 |  |
| Universal's Islands of Adventure | 806 items, 96% w/ cal, 100% w/ carbs, 61% conf≥50 |  |
| Universal Studios Florida | 581 items, 93% w/ cal, 97% w/ carbs, 61% conf≥50 |  |
| Magic Kingdom Park | 559 items, 46% w/ cal, 46% w/ carbs, 28% conf≥50 |  |

## Per-park coverage (full)

| Park | Items | Cal % | Carbs % | Conf ≥50 % |
|------|------:|------:|--------:|----------:|
| Disney Springs | 3560 | 78% | 79% | 24% |
| Disneyland Park | 2359 | 1% | 1% | 1% |
| EPCOT | 1659 | 81% | 82% | 21% |
| Disney's Animal Kingdom | 1309 | 77% | 77% | 10% |
| Disney's Hollywood Studios | 1169 | 58% | 58% | 18% |
| Universal CityWalk | 983 | 97% | 100% | 62% |
| Universal's Epic Universe | 842 | 84% | 90% | 11% |
| Universal's Islands of Adventure | 806 | 96% | 100% | 61% |
| Universal Studios Florida | 581 | 93% | 97% | 61% |
| Magic Kingdom Park | 559 | 46% | 46% | 28% |
| Downtown Disney District | 444 | 58% | 59% | 37% |
| Dollywood | 417 | 100% | 100% | 64% |
| Walt Disney World Resorts | 373 | 100% | 100% | 78% |
| Disneyland Resort Hotels | 323 | 18% | 18% | 15% |
| Disney's Typhoon Lagoon Water Park | 242 | 17% | 19% | 5% |
| EPCOT Flower & Garden Festival 2026 | 218 | 54% | 54% | 0% |
| Walt Disney World Festivals & Events | 217 | 85% | 85% | 78% |
| Disney's Blizzard Beach Water Park | 196 | 0% | 0% | 0% |
| SeaWorld Orlando | 165 | 99% | 100% | 16% |
| Kings Island | 158 | 99% | 100% | 42% |
| Universal's Volcano Bay | 146 | 94% | 97% | 77% |
| Busch Gardens Tampa Bay | 119 | 98% | 100% | 22% |
| Walt Disney World & Universal Orlando - Additional Dining | 108 | 100% | 100% | 82% |
| Aulani, A Disney Resort & Spa | 41 | 100% | 100% | 98% |
| Disney Treasure | 29 | 100% | 100% | 90% |
| Disney Magic | 28 | 100% | 100% | 71% |
| Disney Wish | 28 | 100% | 100% | 89% |
| Disney Dream | 26 | 100% | 100% | 69% |
| Disney Fantasy | 26 | 100% | 100% | 77% |
| Disney Wonder | 24 | 100% | 100% | 83% |
| Universal Cabana Bay Beach Resort | 19 | 100% | 100% | 100% |
| Universal Royal Pacific Resort | 18 | 100% | 100% | 94% |
| Walt Disney World Parks | 15 | 100% | 100% | 0% |
| Universal Portofino Bay Hotel | 15 | 100% | 100% | 93% |
| Epic Universe Hotels | 14 | 100% | 100% | 86% |
| Universal Hard Rock Hotel | 14 | 100% | 100% | 100% |
| Universal Sapphire Falls Resort | 13 | 100% | 100% | 100% |
| Universal Aventura Hotel | 11 | 100% | 100% | 100% |
| Universal Endless Summer Resort - Dockside Inn | 10 | 100% | 100% | 100% |
| Universal Stella Nova Resort | 10 | 100% | 100% | 100% |
| Universal Terra Luna Resort | 10 | 100% | 100% | 100% |
| Disney's BoardWalk | 7 | 100% | 100% | 86% |
| Universal Endless Summer Resort - Surfside Inn | 7 | 100% | 100% | 100% |
| Disney's Grand Floridian Resort | 4 | 100% | 100% | 25% |
| Disney's Contemporary Resort | 3 | 100% | 100% | 100% |

