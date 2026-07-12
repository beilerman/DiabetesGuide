# Nutrition Fidelity Incident Runbook

Use this runbook when a certified carbohydrate value, serving basis, source document, or certification decision becomes suspect.

## Immediate containment

1. Identify the active certification and every linked `nutrition_sources` row.
2. Use the latest evidence-monitor report to find the upstream-source blast radius.
3. Disable the active certification pointer for affected items or create the reviewed quarantine decision through the certification workflow.
4. Confirm the affected values no longer qualify as dosing-grade in the fidelity audit and UI trust predicate.
5. Do not delete or edit the original evidence, decision, or check records.

If the feature flag itself is producing incorrect trust classifications, set `VITE_NUTRITION_CERTIFICATION_TRUST=false` and redeploy while the underlying data is investigated.

## Investigation

For every affected item, compare:

- source-reported item name against the live menu item;
- source-reported serving, size, and preparation against the canonical serving;
- original and normalized carbohydrate values and normalization inputs;
- source content hash and resolved URL against prior checks;
- upstream-source keys to distinguish independent corroboration from copies; and
- the active certification's review and expiry timestamps.

Classify the cause as source change, serving/configuration change, incorrect item match, dependent-source mistake, normalization error, transcription error, stale approval, or application-policy defect.

## Correction

1. Capture a new immutable source observation. Never rewrite the old observation.
2. Add a new reviewed certification decision that cites the corrected evidence and supersedes the prior decision.
3. Update canonical carbs and serving only in the same reviewed publication operation.
4. Re-run accuracy, fidelity, source monitoring, and certified-value regression checks.
5. Verify browser → API → database → UI behavior for the corrected item and a sample of the blast radius.

## Restoration criteria

Restore Tier A/B status only when:

- the exact item and serving match is documented;
- evidence is current and addressable;
- linked values pass the agreement and independence policy;
- canonical carbs/serving exactly match the new decision;
- no HIGH fidelity findings remain; and
- the feature-flag rollback path has been tested.

## Post-incident record

Record the affected items and destinations, discovery time, containment time, root cause, evidence and decisions created, user-visible impact, regression test added, and prevention work. Update the monitoring or certification policy when the failure mode could recur.
