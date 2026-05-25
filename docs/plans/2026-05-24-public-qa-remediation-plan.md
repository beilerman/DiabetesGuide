# Public QA Remediation Plan

Date: 2026-05-24

## Goals

Fix the public walkthrough failures that block trust or navigation, then reduce visible data noise while preserving the existing offline-first architecture.

Visual thesis: keep the app utilitarian and calm, with food cards and planning tools optimized for fast scanning rather than decorative surfaces.

Content plan: destination selection, browse/search, item detail, planning, and medical education should each have clear status, fallback states, and a consistent safety disclaimer.

Interaction thesis: card primary content should navigate predictably, floating tools should stay scoped to the workflow that owns them, and successful actions should provide brief visible feedback.

## Immediate Code Remediation

1. Item drill-down
   - Add an item detail route at `/item/:itemId`.
   - Link "More details" to the detail route instead of toggling hidden inline state.
   - Make the card's primary body navigate to details while preserving separate buttons for favorite, add to meal, and compare.
   - Reuse the existing offline item-by-id query path so detail works with cached data.

2. Route clarity
   - Add `/more/settings` as an alias to `/settings`.
   - Add `/tips` as an alias to `/advice`.
   - Replace the catch-all home redirect with a visible 404 page that gives routes back to Parks, Browse, and More.

3. Compare tray scope
   - Show the floating compare tray only while browsing or viewing an item detail.
   - Keep compare data persistent, but prevent the bar from covering unrelated tabs.
   - Increase bottom spacing only on pages where the tray can appear.

4. Insulin safety
   - Extract dose validation/calculation into a pure helper.
   - Require valid carbs, blood glucose, target, insulin-to-carb ratio, and correction factor before showing a suggested dose.
   - Add inline warnings for missing or unsafe values.
   - Normalize number inputs with explicit min/step attributes to avoid browser step rounding quirks.

5. Visible data cleanup
   - Add display-name sanitation for leading scraper punctuation, section number prefixes, XML/HTML tags, and common HTML entities.
   - Apply sanitation in cards, search/filter comparisons, meal/compare storage, and item detail.
   - Treat missing or all-zero nutrition with low confidence as "Nutrition unavailable" rather than awarding a real-looking grade.
   - Keep raw database names unchanged in this pass to avoid destructive data edits.

6. UX and accessibility polish
   - Add a browse/item safety disclaimer.
   - Make bottom-nav active state visible beyond color by adding a stable indicator and stronger text weight.
   - Add a public footer with About, contact, version, and safety context.
   - Align "Park Day Tips" naming across menu and page heading.
   - Add favorite action feedback.
   - Ensure the Max Carbs slider exposes its current value with visible and aria text.
   - Add Open Graph and Twitter meta tags.

## Data Remediation Follow-Up

These are data-layer tasks and should be handled with scripts plus review before applying to Supabase:

1. Canonicalize duplicate parks:
   - Universal Volcano Bay vs. Universal's Volcano Bay.
   - Universal Epic Universe vs. Universal's Epic Universe.

2. Canonicalize duplicate restaurants:
   - Napolini vs. Napolini Pizzeria.
   - Any same-place restaurants split by scraped source.

3. Normalize item records:
   - Remove scraper artifacts from stored names.
   - Drop section headers such as "2. CHOOSE MIX-INS".
   - Merge duplicate menu items inside the same canonical restaurant.
   - Resolve conflicting nutrition values by confidence score and source.

4. Category audit:
   - Reclassify cocktails, wines, beer, soda, coffee, and tea as `beverage`.
   - Reclassify obvious sides and entrees using tested regex with false-positive fixtures.

5. Nutrition completeness:
   - Fill missing sugar/protein/fiber/sodium where there is enough source confidence.
   - Otherwise leave nulls and display "Not available".

## External Launch Follow-Up

These cannot be fully completed from code alone:

1. Configure a stable production domain in Vercel.
2. Provide a final production social image once the domain and brand asset are confirmed.
3. Promote a Vercel preview to production only after manual approval.

## Verification

1. Unit tests:
   - Display sanitation.
   - Insulin validation and calculation.
   - Routing aliases/404 where practical.

2. Build:
   - `npm run build`

3. Browser smoke:
   - `/browse` item card body and "More details" navigate to `/item/:id`.
   - `/more/settings` reaches Settings.
   - `/tips` reaches Park Day Tips.
   - Unknown routes show 404.
   - Compare tray appears on Browse and not on Home/Plan/More.
   - Insulin results stay hidden until required inputs are valid.
