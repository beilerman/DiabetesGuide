# Nutrition Evidence Mapping

## Decision

Reuse `public.nutrition_sources` as the immutable source-observation table and extend it additively. Keep every one of the 105 legacy records. Add separate certification and certification-evidence tables so an observation never doubles as an approval decision.

## Evidence found

The read-only production inventory found:

- 105 source rows covering 89 menu items;
- 13 menu items with more than one source row and a maximum of four sources for one item;
- no null values in the seven exposed legacy columns;
- confidence values from 5 through 70; and
- an existing public-read/no-public-write RLS contract in committed migrations.

This is already a one-to-many evidence shape. Creating a parallel `nutrition_evidence` table would split provenance and force an unnecessary migration of useful citations.

## Additive field mapping

| Fidelity concept | `nutrition_sources` field | Legacy handling |
|---|---|---|
| Source-reported item | `reported_item_name` | Null until reviewed |
| Source owner/type | existing `source_name`, new `source_type` | Preserve existing name; classify later |
| Source location | existing `source_url`, new `source_locator` | Preserve URL exactly |
| Original carb observation | `reported_carbs` | Null until the cited source is re-read |
| Serving basis | `serving_quantity`, `serving_unit`, `serving_description` | Null means not certifiable |
| Configuration assumptions | `size_name`, `preparation_notes` | Null means no explicit assumption |
| Publication/retrieval | `published_at`, `retrieved_at` | `retrieved_at` is not inferred from `created_at` |
| Change detection | `content_hash` | Null until a monitor captures content |
| Normalization | `normalized_carbs`, `normalization_formula`, `normalization_inputs` | Null unless explicit math was performed |
| Source independence | `upstream_source_key` | Equal non-null keys are dependent |
| Supersession | `supersedes_id` | Corrections insert a new row |

Legacy rows remain readable and valid after migration, but they do not qualify as Tier A or B merely because they have a citation or confidence of 70. A reviewer must capture the reported carbs and serving basis.

## Certification mapping

Create `nutrition_certifications` for immutable reviewer decisions and `nutrition_certification_evidence` as its evidence join table. A decision records menu item, tier, status, reviewer, reason, review time, expiry, and the approved canonical serving/carbs.

`nutritional_data.active_certification_id` points to the current decision. Its existing `confidence_score` remains available for estimate quality and historical compatibility, but dosing-grade UI logic moves to an active, unexpired Tier A/B decision.

Only one active certification may exist per menu item. A replacement decision supersedes rather than edits the previous decision.

## Privileged preflight still required

Before applying a migration, use a privileged read-only session to confirm:

- exact primary and foreign keys on `nutrition_sources`;
- whether any triggers already update the table;
- current owner, policies, and grants;
- whether `id` and `created_at` have defaults; and
- whether any service outside this repository writes legacy rows.

The migration must abort without changes if those findings conflict with this mapping.
