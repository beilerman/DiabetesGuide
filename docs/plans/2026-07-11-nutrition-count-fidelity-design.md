# Dosing-Critical Nutrition Fidelity Design

## Goal

Make a carbohydrate value dosing-grade only when the application can show what portion it describes, where the number came from, why the source applies to the exact menu item, and when that evidence was last verified.

This process improves confidence in menu planning; it does not promise that a restaurant-prepared serving will exactly match a published value or replace a user's clinician-approved dosing method.

## Current State

The catalog has nutrition rows for 99.4% of 17,306 menu items and a carbohydrate value for 98.1%, but only 17.9% currently meet the application's confidence-based dosing-grade threshold. The existing audit system catches impossible values, caloric inconsistencies, copied templates, low confidence, and multi-serving estimation hazards. Curated importers preserve citations and avoid downgrading stronger data.

The remaining fidelity gaps are structural:

- confidence is a conclusion, but the database does not require the evidence needed to justify it;
- serving basis is not represented as a first-class contract;
- original source observations and normalized canonical values are not kept separately;
- the UI generally treats `confidence_score >= 70` as sufficient, even if serving or source evidence is incomplete;
- freshness, source conflicts, reviewer decisions, and certification expiry are not lifecycle states; and
- internal plausibility checks can detect suspicious values but cannot prove that a plausible value belongs to the exact item and portion.

FDA guidance ties nutrient information to a declared serving and requires covered restaurant declarations to have a documented reasonable basis. USDA FoodData Central also contains distinct evidence types, including analytical, calculated, survey-derived, and manufacturer-provided data. A generic USDA match can improve an estimate but does not establish the carbohydrate count for a specific theme-park portion.

## Safety Boundary

The system will use two separate concepts:

- **Plausible:** the number passes mathematical and category checks.
- **Certified:** the number also has item-specific, serving-specific, current, reviewable evidence.

Plausibility never promotes a value to dosing-grade. AI, keyword similarity, recipe decomposition, generic USDA matches, and portion multipliers remain estimates even when multiple estimators agree.

The app must continue to describe certified counts as published or verified values, not guaranteed measurements. Restaurant preparation, substitutions, and portion variation remain possible.

## Certification Model

### Evidence tiers

| Tier | Minimum evidence | Treatment |
|---|---|---|
| A | Exact item, size/preparation, and serving from the restaurant, manufacturer, or an official nutrition document | Dosing-grade |
| B | Exact branded or restaurant value with a second genuinely independent source agreeing within the review tolerance | Dosing-grade |
| C | Strong recipe calculation, close-item mapping, or non-exact published comparison | Estimate shown as a range |
| D | AI, keyword, generic database, or unverified inherited value | Discovery estimate only |
| Quarantined | Source conflict, unclear serving, stale evidence, configuration ambiguity, or failed validation | Excluded from dosing totals |

The agreement tolerance is an internal review trigger, not a claim about FDA compliance or biological precision. The initial rule is the greater of 2 grams or 10% of the higher carbohydrate value. Agreement cannot create Tier B when both sources derive from the same upstream document.

### Required evidence

Every candidate observation records:

- menu item and source-reported item name;
- source owner and source type;
- URL or document identifier plus a page/section locator when applicable;
- retrieval date and, when known, publication/effective date;
- exact source-reported carbohydrate value;
- source-reported serving quantity, unit, and description;
- size, preparation, and customization assumptions;
- whether the observation is original or normalized;
- content hash or archived excerpt metadata for change detection; and
- reviewer decision, reason, and timestamp.

The source observation is immutable. Corrections create a new observation and supersede the old one. The canonical value in `nutritional_data` points to the evidence and certification decision that produced it.

### Serving contract

A value cannot be certified without one unambiguous basis:

- per item as sold;
- per container/package;
- per measured serving with quantity and unit;
- per slice/scoop/piece with the count specified; or
- per explicitly named standard configuration and size.

Whole pizzas, flights, family platters, dozens, refillable containers, build-your-own foods, and other multi-serving or highly customizable items are blocked from a single certified point value unless the certified configuration is explicit. Where useful, the UI may show component counts or a range, but those values do not silently enter dosing totals.

Normalization preserves both values: the source observation and the canonical per-item or per-serving value. Scaling must record the formula and inputs. No hidden portion multiplier can produce Tier A or B.

## Lifecycle

```text
Discover -> Capture evidence -> Normalize serving -> Automated validation
         -> Corroborate -> Human review -> Certify -> Publish
         -> Monitor -> Renew / Expire / Quarantine
```

### 1. Discover and capture

Research is prioritized by dosing impact: top destinations first, then entrees and desserts, then snacks, sides, and beverages. Import is dry-run by default. It creates evidence candidates and never directly certifies or overwrites a stronger canonical value.

### 2. Normalize serving

The reviewer matches restaurant, item name, size, preparation, and serving. Any unresolved mismatch routes the item to manual review. The system stores normalization math rather than replacing the original observation.

### 3. Validate

Automated gates reject or flag:

- missing carbohydrate or serving fields;
- negative or category-impossible values;
- sugar or fiber greater than total carbohydrate;
- material Atwater inconsistency when all required fields are present;
- likely copied nutrition templates;
- multi-serving or customizable formats without a fixed configuration;
- source/item/restaurant/size mismatch; and
- duplicate evidence masquerading as independent corroboration.

Automated checks may quarantine a carb value, but they never auto-repair or auto-certify it.

### 4. Review and certify

A reviewer sees the original source, normalized result, validation findings, any conflicting evidence, and the previous canonical value. Approval records the tier and reason. A never-downgrade rule prevents weaker or older evidence from replacing stronger current evidence.

Tier A and B values become dosing-grade. Tier C and D values remain visibly estimated and are excluded from any UI path that presents a precise dosing total without a warning.

### 5. Monitor and renew

The system checks evidence links and content hashes daily. High-impact certified items are sampled monthly; the rest are revalidated at least quarterly. Successful retrieval with unchanged item, serving, and value renews the evidence. A changed or unavailable source creates a review task rather than silently accepting the old count.

Certification expires when its review deadline passes. Expired, conflicting, or invalidated values immediately stop qualifying as dosing-grade until reviewed. Source removals, menu-size changes, and carbohydrate changes are treated as data incidents.

## Data Model

Implementation begins with a read-only inventory of the existing production `nutrition_sources` table and its 105 rows.

- If it already supports immutable observations, it will be extended additively and reused.
- If it represents a different legacy concept, it remains untouched and a new `nutrition_evidence` table is introduced.

The evidence store needs stable identifiers, source and serving fields, original values, normalization metadata, retrieval/version metadata, and supersession links. A separate certification decision record preserves review history and points to one or more evidence records.

`nutritional_data` receives only the minimal canonical fields needed by the app: serving description, certification status/tier, certification and expiry timestamps, and a reference to the active decision. Database constraints prevent a dosing-grade status without carbohydrate, serving basis, active evidence, and an unexpired approval.

Public clients receive read-only access to published evidence metadata needed for transparency. Only service-role maintenance commands can create evidence or certification decisions. RLS, explicit grants, constrained `search_path`, and advisor checks are required for every migration.

## Metrics and Release Gates

The fidelity report separates coverage from trust and reports both catalog-wide and dosing-impact-weighted values:

- dosing-grade carbohydrate coverage;
- explicit-serving-basis coverage;
- retrievable-provenance coverage;
- Tier A/B/C/D and quarantine counts;
- evidence age and upcoming expirations;
- source conflict rate;
- manual sample agreement rate;
- median absolute difference between independent sources; and
- certified-value regressions.

A release or data import fails when it would:

- reduce dosing-grade coverage without an acknowledged quarantine reason;
- publish a certified row without complete serving and evidence fields;
- leave a HIGH audit finding on a certified row;
- overwrite a stronger, newer certification;
- certify two dependent sources as independent; or
- change a certified carb value without a new review decision and audit trail.

The target for unreviewed certified-value changes is zero.

## Rollout

The new classifier runs in shadow mode first. Existing `confidence_score >= 70` behavior remains visible while the report calculates how many rows would qualify under the evidence-backed rules. Existing rows are not automatically certified merely because they have a high confidence score.

Rollout proceeds in four gates:

1. inventory legacy evidence and add schema without changing UI behavior;
2. backfill source observations conservatively and review the highest-impact catalog slice;
3. compare old and new trust classifications, resolve unexpected demotions, and establish a safe coverage floor; and
4. switch UI dosing-grade logic to active Tier A/B certification, with rollback available through a feature flag.

No production write occurs without a dry-run artifact, row counts, an undo manifest where updates are involved, and post-write verification.

## Incident Response

When a certified value becomes suspect:

1. quarantine it so it leaves dosing totals;
2. preserve the prior value and evidence rather than deleting history;
3. identify every menu item derived from the same source or normalization rule;
4. notify the audit report and open a prioritized review queue;
5. correct through a new evidence observation and certification decision; and
6. document scope, cause, and prevention before restoring certification.

## Non-Goals

- claiming laboratory precision for restaurant-prepared food;
- deriving insulin doses or changing the user's clinical settings;
- promoting estimates by confidence relabeling;
- auto-correcting dosing-critical carbohydrate values;
- requiring equal verification of every non-carbohydrate nutrient; and
- deleting legacy provenance during migration.

## Authoritative References

- FDA, [Serving Size on the Nutrition Facts Label](https://www.fda.gov/food/nutrition-facts-label/serving-size-nutrition-facts-label)
- FDA, [Menu Labeling Requirements](https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/menu-labeling-requirements)
- FDA, [Restaurant and Retail Menu Labeling Guidance](https://www.fda.gov/files/food/published/Guidance-for-Industry--A-Labeling-Guide-for-Restaurants-and-Retail-Establishments-Selling-Away-From-Home-Foods-%E2%80%93-Part-II-%28Menu-Labeling-Requirements-in-Accordance-with-21-CFR-101.11%29-PDF.pdf)
- USDA, [FoodData Central Data Documentation](https://fdc.nal.usda.gov/data-documentation/)
