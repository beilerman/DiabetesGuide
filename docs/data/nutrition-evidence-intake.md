# Nutrition Evidence Intake

The curated nutrition importers now have a review-first evidence path. This path records source observations but never creates a certification or changes which value the application treats as dosing-grade.

## Safe preview

Generate a deterministic, reviewable JSON artifact without database writes:

```powershell
npm run import:researched -- --review-out=audit/researched-evidence-review.json
npm run import:ai -- --review-out=audit/ai-evidence-review.json
```

Each candidate includes the proposed evidence tier, explicit review blockers, original and normalized carb values, serving fields, upstream-source key, and deterministic evidence key.

Existing research files usually lack explicit serving and exact-match fields. Those candidates intentionally remain Tier D/review-required until the input records:

- `servingQuantity`, `servingUnit`, and `servingDescription`;
- `exactItemMatch` and `exactServingMatch`;
- `retrievedAt` and preferably `publishedAt` or `contentHash`; and
- `upstreamSourceKey` when multiple URLs reproduce the same original document.

## Hermes official-source intake

The `disney-nutrition-research` Hermes skill is an official-evidence producer for queued Disney menu items. It reads the live catalog with an anon/publishable Supabase key, researches at most five items, and opens a pull request containing a deterministic artifact under `audit/nutrition-research/batches/`.

The artifact distinguishes four states:

- `accepted`: complete, exact, first-party evidence;
- `flagged`: evidence requiring human resolution;
- `skipped:no_first_party_source`: no qualifying owned source exists; and
- `failed`: research could not be completed without converting an outage into data.

Runtime findings are not database rows. A reviewed merged artifact may create an immutable `nutrition_sources` observation through the protected post-merge workflow. That observation is still not an active nutritional value or certification.

Install/check the skill and operate its six-hour job using `docs/runbooks/hermes-nutrition-research.md`.

## Store evidence only

After the fidelity migration is deployed and the review artifact is accepted:

```powershell
npm run import:researched -- --apply-evidence
npm run import:ai -- --apply-evidence
```

Evidence insertion is idempotent on `evidence_key`. It cannot write `nutrition_certifications` or set `nutritional_data.active_certification_id`.

Hermes batches use the narrower `npm run nutrition:research-apply` command only inside the protected post-merge GitHub Environment. The research agent never invokes it and never receives the service role.

Do not combine `--apply`, `--apply-evidence`, or `--publish-reviewed`. The importers fail when more than one write path is selected. `--publish-reviewed` is reserved for the dedicated certification workflow and is rejected by these candidate importers.

The legacy `--apply` path remains temporarily available during shadow mode because the current UI still uses confidence-based trust. It does not create Tier A/B certification and will be retired when certification-based UI gating is enabled.
