# Comprehensive Database Audit — 2026-05-06

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
| source: api_lookup | 4437 (25.6%) |  |
| source: crowdsourced | 11876 (68.5%) |  |
| source: other | 0 (0.0%) |  |

## Confidence distribution

| Item | Value | |
|------|-------|--|
| high (≥80) | 871 (5.0%) |  |
| medium (50–79) | 1752 (10.1%) |  |
| low (<50) | 9119 (52.6%) |  |
| null (no confidence recorded) | 5583 (32.2%) |  |

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
| calories > 0 | 11557 (66.7%) |  |
| carbs not null | 11741 (67.8%) |  |
| protein not null | 11742 (67.8%) |  |
| fat not null | 11737 (67.7%) |  |
| sodium not null | 11738 (67.8%) |  |
| sugar not null | 11728 (67.7%) |  |
| fiber not null | 11728 (67.7%) |  |
| all macros null (empty shells) | 5583 (32.2%) | 🟡 |
| all macros = 0 | 185 (1.1%) |  |

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
| Disney Springs | 3560 items, 78% w/ cal, 79% w/ carbs, 15% conf≥50 |  |
| Disneyland Park | 2359 items, 0% w/ cal, 0% w/ carbs, 0% conf≥50 |  |
| EPCOT | 1659 items, 81% w/ cal, 82% w/ carbs, 14% conf≥50 |  |
| Disney's Animal Kingdom | 1309 items, 77% w/ cal, 77% w/ carbs, 9% conf≥50 |  |
| Disney's Hollywood Studios | 1169 items, 58% w/ cal, 58% w/ carbs, 13% conf≥50 |  |
| Universal CityWalk | 983 items, 98% w/ cal, 100% w/ carbs, 25% conf≥50 |  |
| Universal's Epic Universe | 842 items, 84% w/ cal, 90% w/ carbs, 8% conf≥50 |  |
| Universal's Islands of Adventure | 806 items, 97% w/ cal, 100% w/ carbs, 27% conf≥50 |  |
| Universal Studios Florida | 581 items, 94% w/ cal, 97% w/ carbs, 26% conf≥50 |  |
| Magic Kingdom Park | 559 items, 43% w/ cal, 44% w/ carbs, 7% conf≥50 |  |

## Per-park coverage (full)

| Park | Items | Cal % | Carbs % | Conf ≥50 % |
|------|------:|------:|--------:|----------:|
| Disney Springs | 3560 | 78% | 79% | 15% |
| Disneyland Park | 2359 | 0% | 0% | 0% |
| EPCOT | 1659 | 81% | 82% | 14% |
| Disney's Animal Kingdom | 1309 | 77% | 77% | 9% |
| Disney's Hollywood Studios | 1169 | 58% | 58% | 13% |
| Universal CityWalk | 983 | 98% | 100% | 25% |
| Universal's Epic Universe | 842 | 84% | 90% | 8% |
| Universal's Islands of Adventure | 806 | 97% | 100% | 27% |
| Universal Studios Florida | 581 | 94% | 97% | 26% |
| Magic Kingdom Park | 559 | 43% | 44% | 7% |
| Downtown Disney District | 444 | 58% | 59% | 15% |
| Dollywood | 417 | 100% | 100% | 28% |
| Walt Disney World Resorts | 373 | 100% | 100% | 55% |
| Disneyland Resort Hotels | 323 | 17% | 17% | 6% |
| Disney's Typhoon Lagoon Water Park | 242 | 17% | 19% | 5% |
| EPCOT Flower & Garden Festival 2026 | 218 | 54% | 54% | 0% |
| Walt Disney World Festivals & Events | 217 | 85% | 85% | 55% |
| Disney's Blizzard Beach Water Park | 196 | 0% | 0% | 0% |
| SeaWorld Orlando | 165 | 99% | 100% | 15% |
| Kings Island | 158 | 99% | 100% | 29% |
| Universal's Volcano Bay | 146 | 95% | 97% | 28% |
| Busch Gardens Tampa Bay | 119 | 98% | 100% | 21% |
| Walt Disney World & Universal Orlando - Additional Dining | 108 | 100% | 100% | 59% |
| Aulani, A Disney Resort & Spa | 41 | 100% | 100% | 54% |
| Disney Treasure | 29 | 100% | 100% | 10% |
| Disney Magic | 28 | 100% | 100% | 21% |
| Disney Wish | 28 | 100% | 100% | 11% |
| Disney Dream | 26 | 100% | 100% | 15% |
| Disney Fantasy | 26 | 100% | 100% | 15% |
| Disney Wonder | 24 | 100% | 100% | 17% |
| Universal Cabana Bay Beach Resort | 19 | 100% | 100% | 74% |
| Universal Royal Pacific Resort | 18 | 100% | 100% | 11% |
| Walt Disney World Parks | 15 | 100% | 100% | 0% |
| Universal Portofino Bay Hotel | 15 | 100% | 100% | 40% |
| Epic Universe Hotels | 14 | 100% | 100% | 86% |
| Universal Hard Rock Hotel | 14 | 100% | 100% | 64% |
| Universal Sapphire Falls Resort | 13 | 100% | 100% | 23% |
| Universal Aventura Hotel | 11 | 100% | 100% | 73% |
| Universal Endless Summer Resort - Dockside Inn | 10 | 100% | 100% | 30% |
| Universal Stella Nova Resort | 10 | 100% | 100% | 20% |
| Universal Terra Luna Resort | 10 | 100% | 100% | 10% |
| Disney's BoardWalk | 7 | 100% | 100% | 29% |
| Universal Endless Summer Resort - Surfside Inn | 7 | 100% | 100% | 29% |
| Disney's Grand Floridian Resort | 4 | 100% | 100% | 0% |
| Disney's Contemporary Resort | 3 | 100% | 100% | 100% |

