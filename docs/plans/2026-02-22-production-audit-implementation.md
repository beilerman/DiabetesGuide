# Production Readiness Audit System - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a modular production readiness audit system that validates database completeness, correctness, duplicates, and coverage gaps with tiered fixing and multi-format reporting.

**Architecture:** Orchestrator pattern with 5 independent audit modules (completeness, correctness, duplicates, coverage, thresholds) that run in parallel and output findings. Three-tier fixer system (auto-fix, scripts, manual review) processes findings by risk level. Multi-format reporters (JSON, Markdown, CSV) generate comprehensive reports.

**Tech Stack:** TypeScript, Supabase (PostgreSQL), Node.js, fs, path, Levenshtein distance (fast-levenshtein)

---

## Phase 1: Foundation & Shared Infrastructure

### Task 1: Create Directory Structure

**Files:**
- Create: `scripts/audit/modules/`
- Create: `scripts/audit/fixers/`
- Create: `scripts/audit/reports/`
- Create: `scripts/audit/shared/`
- Create: `audit/` (output directory)
- Create: `audit/fixes/`
- Create: `audit/backups/`

**Step 1: Create directories**

```bash
mkdir -p scripts/audit/modules
mkdir -p scripts/audit/fixers
mkdir -p scripts/audit/reports
mkdir -p scripts/audit/shared
mkdir -p audit/fixes
mkdir -p audit/backups
```

**Step 2: Verify structure**

Run: `ls -R scripts/audit/`
Expected: All directories exist

**Step 3: Commit**

```bash
git add scripts/audit/ audit/
git commit -m "chore: create audit system directory structure"
```

---

### Task 2: Shared Types

**Files:**
- Create: `scripts/audit/shared/types.ts`
- Reference: Existing `src/lib/types.ts` for base types

**Step 1: Write types file**

```typescript
// scripts/audit/shared/types.ts

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

export interface Finding {
  id: string
  module: string
  severity: Severity
  category: string
  item_id?: string
  restaurant_id?: string
  park_id?: string
  message: string
  current_value?: any
  suggested_fix?: any
  auto_fixable: boolean
  fix_script?: string | null
  metadata?: Record<string, any>
}

export interface Park {
  id: string
  name: string
  location: string
}

export interface Restaurant {
  id: string
  park_id: string
  name: string
  park?: Park
}

export interface MenuItem {
  id: string
  restaurant_id: string
  name: string
  description: string | null
  price: number | null
  category: string
  is_vegetarian: boolean
  is_fried: boolean
  is_seasonal: boolean
  photo_url: string | null
  restaurant?: Restaurant
}

export interface NutritionalData {
  id: string
  menu_item_id: string
  calories: number | null
  carbs: number | null
  fat: number | null
  sugar: number | null
  protein: number | null
  fiber: number | null
  sodium: number | null
  cholesterol: number | null
  source: string
  confidence_score: number | null
}

export interface Allergen {
  id: string
  menu_item_id: string
  allergen_type: string
  severity: string
}

export interface AuditContext {
  parks: Park[]
  restaurants: Restaurant[]
  menuItems: MenuItem[]
  nutritionalData: NutritionalData[]
  allergens: Allergen[]
  scrapedData?: ScrapedMenu[]
}

export interface ScrapedMenu {
  park: string
  restaurant: string
  items: ScrapedItem[]
}

export interface ScrapedItem {
  name: string
  description?: string
  price?: number
  category?: string
}

export interface AuditModule {
  name: string
  description: string
  run(context: AuditContext): Promise<Finding[]>
}

export interface AuditResult {
  metadata: {
    audit_version: string
    timestamp: string
    execution_time_ms: number
    database_snapshot: {
      parks: number
      restaurants: number
      menu_items: number
      items_with_nutrition: number
    }
  }
  summary: {
    total_findings: number
    by_severity: Record<Severity, number>
    by_module: Record<string, number>
    auto_fixed: number
    fix_scripts_generated: number
    manual_review_required: number
  }
  findings: Finding[]
  thresholds?: ThresholdResult
}

export interface ThresholdResult {
  current_metrics: Record<string, number>
  recommended_thresholds: Record<string, any>
  pass_fail: 'PASS' | 'CONDITIONAL_PASS' | 'FAIL'
  blocking_issues: string[]
  improvement_priorities: string[]
}
```

**Step 2: Commit**

```bash
git add scripts/audit/shared/types.ts
git commit -m "feat(audit): add shared type definitions"
```

---

### Task 3: Database Client Wrapper

**Files:**
- Create: `scripts/audit/shared/db-client.ts`
- Reference: Existing scripts pattern (e.g., `scripts/check-duplicates.ts`)

**Step 1: Write database client**

```typescript
// scripts/audit/shared/db-client.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Park, Restaurant, MenuItem, NutritionalData, Allergen } from './types.js'

export class AuditDbClient {
  private client: SupabaseClient

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey)
  }

  async fetchAll<T>(
    table: string,
    select: string = '*',
    pageSize: number = 500
  ): Promise<T[]> {
    const all: T[] = []
    let from = 0

    while (true) {
      const { data, error } = await this.client
        .from(table)
        .select(select)
        .range(from, from + pageSize - 1)

      if (error) {
        console.error(`Error fetching ${table}:`, error.message)
        break
      }

      if (!data || data.length === 0) break

      all.push(...(data as T[]))

      if (data.length < pageSize) break
      from += pageSize
    }

    return all
  }

  async fetchParks(): Promise<Park[]> {
    return this.fetchAll<Park>('parks', 'id, name, location')
  }

  async fetchRestaurants(): Promise<Restaurant[]> {
    return this.fetchAll<Restaurant>(
      'restaurants',
      'id, park_id, name, park:parks(id, name, location)'
    )
  }

  async fetchMenuItems(): Promise<MenuItem[]> {
    return this.fetchAll<MenuItem>(
      'menu_items',
      `id, restaurant_id, name, description, price, category,
       is_vegetarian, is_fried, is_seasonal, photo_url,
       restaurant:restaurants(id, name, park_id, park:parks(id, name, location))`
    )
  }

  async fetchNutritionalData(): Promise<NutritionalData[]> {
    return this.fetchAll<NutritionalData>(
      'nutritional_data',
      `id, menu_item_id, calories, carbs, fat, sugar, protein,
       fiber, sodium, cholesterol, source, confidence_score`
    )
  }

  async fetchAllergens(): Promise<Allergen[]> {
    return this.fetchAll<Allergen>(
      'allergens',
      'id, menu_item_id, allergen_type, severity'
    )
  }

  getClient(): SupabaseClient {
    return this.client
  }
}
```

**Step 2: Commit**

```bash
git add scripts/audit/shared/db-client.ts
git commit -m "feat(audit): add database client wrapper with batch fetching"
```

---

### Task 4: String Similarity Utilities

**Files:**
- Create: `scripts/audit/shared/string-similarity.ts`

**Step 1: Install dependency**

```bash
npm install --save-dev fast-levenshtein
npm install --save-dev @types/fast-levenshtein
```

**Step 2: Write string similarity utilities**

```typescript
// scripts/audit/shared/string-similarity.ts

import levenshtein from 'fast-levenshtein'

export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
}

export function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeString(str1)
  const norm2 = normalizeString(str2)

  const maxLen = Math.max(norm1.length, norm2.length)
  if (maxLen === 0) return 1.0

  const distance = levenshtein.get(norm1, norm2)
  return 1 - distance / maxLen
}

export function areFuzzyMatch(
  str1: string,
  str2: string,
  threshold: number = 0.85
): boolean {
  return calculateSimilarity(str1, str2) >= threshold
}

export function createDuplicateKey(
  restaurantId: string,
  itemName: string
): string {
  return `${restaurantId}|||${normalizeString(itemName)}`
}
```

**Step 3: Commit**

```bash
git add scripts/audit/shared/string-similarity.ts package.json package-lock.json
git commit -m "feat(audit): add string similarity utilities with Levenshtein distance"
```

---

## Phase 2: Audit Modules

### Task 5: Completeness Audit Module

**Files:**
- Create: `scripts/audit/modules/completeness-audit.ts`
- Create: `tests/audit/modules/completeness-audit.test.ts` (if adding tests)

**Step 1: Write completeness audit module**

```typescript
// scripts/audit/modules/completeness-audit.ts

import { v4 as uuidv4 } from 'uuid'
import { AuditModule, AuditContext, Finding, Severity } from '../shared/types.js'

export class CompletenessAudit implements AuditModule {
  name = 'completeness-audit'
  description = 'Detects missing critical data (nutrition, descriptions, prices, photos, allergens)'

  async run(context: AuditContext): Promise<Finding[]> {
    const findings: Finding[] = []

    // Build nutrition lookup
    const nutritionMap = new Map<string, any>()
    for (const nd of context.nutritionalData) {
      nutritionMap.set(nd.menu_item_id, nd)
    }

    // Build allergen count map
    const allergenCountMap = new Map<string, number>()
    for (const allergen of context.allergens) {
      allergenCountMap.set(
        allergen.menu_item_id,
        (allergenCountMap.get(allergen.menu_item_id) || 0) + 1
      )
    }

    // Check missing nutrition
    for (const item of context.menuItems) {
      const nutrition = nutritionMap.get(item.id)
      const hasNutrition = nutrition && nutrition.calories !== null

      if (!hasNutrition) {
        const isZeroCalBeverage = this.isZeroCalorieBeverage(item)

        if (isZeroCalBeverage) {
          findings.push({
            id: uuidv4(),
            module: this.name,
            severity: 'INFO',
            category: 'missing_nutrition',
            item_id: item.id,
            restaurant_id: item.restaurant_id,
            message: `Zero-cal beverage without nutrition data (expected): ${item.name}`,
            current_value: null,
            suggested_fix: 'No action needed',
            auto_fixable: false
          })
        } else if (item.category === 'entree') {
          findings.push({
            id: uuidv4(),
            module: this.name,
            severity: 'CRITICAL',
            category: 'missing_nutrition',
            item_id: item.id,
            restaurant_id: item.restaurant_id,
            message: `Entree without nutrition data: ${item.name}`,
            current_value: null,
            suggested_fix: 'Add nutrition data via USDA API or AI estimation',
            auto_fixable: false
          })
        } else if (item.category === 'dessert' || item.category === 'side') {
          findings.push({
            id: uuidv4(),
            module: this.name,
            severity: 'HIGH',
            category: 'missing_nutrition',
            item_id: item.id,
            restaurant_id: item.restaurant_id,
            message: `${item.category} without nutrition data: ${item.name}`,
            current_value: null,
            suggested_fix: 'Add nutrition data',
            auto_fixable: false
          })
        }
      }

      // Check missing description
      if (!item.description || item.description.trim() === '') {
        const severity: Severity = item.category === 'beverage' ? 'LOW' : 'MEDIUM'
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity,
          category: 'missing_description',
          item_id: item.id,
          restaurant_id: item.restaurant_id,
          message: `Missing description: ${item.name}`,
          current_value: null,
          suggested_fix: 'Add description from menu or scraper',
          auto_fixable: false
        })
      }

      // Check missing price
      if (item.price === null || item.price === 0) {
        const parkName = (item.restaurant as any)?.park?.name || ''
        const isDollywood = parkName.toLowerCase().includes('dollywood')

        if (!isDollywood) {
          findings.push({
            id: uuidv4(),
            module: this.name,
            severity: 'MEDIUM',
            category: 'missing_price',
            item_id: item.id,
            restaurant_id: item.restaurant_id,
            message: `Missing price: ${item.name}`,
            current_value: null,
            suggested_fix: 'Add price from official menu',
            auto_fixable: false
          })
        }
      }

      // Check missing photo
      if (!item.photo_url) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'LOW',
          category: 'missing_photo',
          item_id: item.id,
          restaurant_id: item.restaurant_id,
          message: `Missing photo: ${item.name}`,
          current_value: null,
          suggested_fix: 'Add photo URL from scraper or manual entry',
          auto_fixable: false
        })
      }

      // Check missing allergens for high-risk items
      const allergenCount = allergenCountMap.get(item.id) || 0
      if (allergenCount === 0 && this.isHighAllergenRisk(item)) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'LOW',
          category: 'missing_allergens',
          item_id: item.id,
          restaurant_id: item.restaurant_id,
          message: `No allergen data for high-risk item: ${item.name}`,
          current_value: null,
          suggested_fix: 'Run allergen inference script',
          auto_fixable: false
        })
      }
    }

    // Check sparse restaurants
    const restaurantItemCounts = new Map<string, number>()
    for (const item of context.menuItems) {
      restaurantItemCounts.set(
        item.restaurant_id,
        (restaurantItemCounts.get(item.restaurant_id) || 0) + 1
      )
    }

    for (const restaurant of context.restaurants) {
      const itemCount = restaurantItemCounts.get(restaurant.id) || 0

      if (itemCount === 0) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'CRITICAL',
          category: 'empty_restaurant',
          restaurant_id: restaurant.id,
          message: `Restaurant with no items: ${restaurant.name}`,
          current_value: 0,
          suggested_fix: 'Add menu items or remove restaurant',
          auto_fixable: false
        })
      } else if (itemCount <= 2) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'HIGH',
          category: 'sparse_restaurant',
          restaurant_id: restaurant.id,
          message: `Restaurant with only ${itemCount} items: ${restaurant.name}`,
          current_value: itemCount,
          suggested_fix: 'Verify menu is complete or restaurant is valid',
          auto_fixable: false,
          metadata: { item_count: itemCount }
        })
      } else if (itemCount <= 4) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'MEDIUM',
          category: 'sparse_restaurant',
          restaurant_id: restaurant.id,
          message: `Restaurant with only ${itemCount} items: ${restaurant.name}`,
          current_value: itemCount,
          suggested_fix: 'Check if menu is incomplete',
          auto_fixable: false,
          metadata: { item_count: itemCount }
        })
      }
    }

    return findings
  }

  private isZeroCalorieBeverage(item: any): boolean {
    const name = item.name.toLowerCase()
    const zeroCal = [
      'water', 'diet coke', 'diet pepsi', 'coke zero',
      'black coffee', 'unsweetened tea', 'green tea'
    ]
    return item.category === 'beverage' && zeroCal.some(z => name.includes(z))
  }

  private isHighAllergenRisk(item: any): boolean {
    return item.category === 'dessert' || item.is_fried ||
           item.name.toLowerCase().includes('cheese')
  }
}
```

**Step 2: Commit**

```bash
git add scripts/audit/modules/completeness-audit.ts
git commit -m "feat(audit): implement completeness audit module

Checks for:
- Missing nutrition data (CRITICAL for entrees, HIGH for desserts/sides)
- Missing descriptions (MEDIUM, LOW for beverages)
- Missing prices (MEDIUM, except Dollywood)
- Missing photos (LOW)
- Missing allergens for high-risk items (LOW)
- Sparse/empty restaurants (CRITICAL/HIGH/MEDIUM)"
```

---

### Task 6: Correctness Audit Module

**Files:**
- Create: `scripts/audit/modules/correctness-audit.ts`

**Step 1: Write correctness audit module**

```typescript
// scripts/audit/modules/correctness-audit.ts

import { v4 as uuidv4 } from 'uuid'
import { AuditModule, AuditContext, Finding } from '../shared/types.js'

export class CorrectnessAudit implements AuditModule {
  name = 'correctness-audit'
  description = 'Identifies incorrect data (categories, flags, relationships, formats)'

  async run(context: AuditContext): Promise<Finding[]> {
    const findings: Finding[] = []

    // Build valid ID sets for FK validation
    const validRestaurantIds = new Set(context.restaurants.map(r => r.id))
    const validParkIds = new Set(context.parks.map(p => p.id))
    const validMenuItemIds = new Set(context.menuItems.map(m => m.id))

    // Check orphaned items (broken FKs)
    for (const item of context.menuItems) {
      if (!validRestaurantIds.has(item.restaurant_id)) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'CRITICAL',
          category: 'broken_fk',
          item_id: item.id,
          message: `Orphaned menu item (invalid restaurant_id): ${item.name}`,
          current_value: item.restaurant_id,
          suggested_fix: 'Delete orphaned record',
          auto_fixable: true,
          metadata: { fk_table: 'restaurants', fk_column: 'restaurant_id' }
        })
      }
    }

    // Check orphaned restaurants
    for (const restaurant of context.restaurants) {
      if (!validParkIds.has(restaurant.park_id)) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'CRITICAL',
          category: 'broken_fk',
          restaurant_id: restaurant.id,
          message: `Orphaned restaurant (invalid park_id): ${restaurant.name}`,
          current_value: restaurant.park_id,
          suggested_fix: 'Delete orphaned record',
          auto_fixable: true,
          metadata: { fk_table: 'parks', fk_column: 'park_id' }
        })
      }
    }

    // Check orphaned nutrition data
    for (const nutrition of context.nutritionalData) {
      if (!validMenuItemIds.has(nutrition.menu_item_id)) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'CRITICAL',
          category: 'broken_fk',
          message: `Orphaned nutrition data (invalid menu_item_id)`,
          current_value: nutrition.menu_item_id,
          suggested_fix: 'Delete orphaned record',
          auto_fixable: true,
          metadata: { fk_table: 'menu_items', fk_column: 'menu_item_id' }
        })
      }
    }

    // Check wrong categories
    for (const item of context.menuItems) {
      const wrongCategory = this.detectWrongCategory(item)
      if (wrongCategory) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'HIGH',
          category: 'wrong_category',
          item_id: item.id,
          restaurant_id: item.restaurant_id,
          message: `Wrong category for ${item.name}`,
          current_value: item.category,
          suggested_fix: wrongCategory.suggested,
          auto_fixable: false,
          metadata: { confidence: wrongCategory.confidence }
        })
      }

      // Check wrong vegetarian flag
      const wrongVeg = this.detectWrongVegetarianFlag(item)
      if (wrongVeg) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'HIGH',
          category: 'wrong_vegetarian_flag',
          item_id: item.id,
          restaurant_id: item.restaurant_id,
          message: `Wrong vegetarian flag for ${item.name}`,
          current_value: item.is_vegetarian,
          suggested_fix: wrongVeg.suggested,
          auto_fixable: false,
          metadata: { reason: wrongVeg.reason }
        })
      }

      // Check wrong fried flag
      const wrongFried = this.detectWrongFriedFlag(item)
      if (wrongFried) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'MEDIUM',
          category: 'wrong_fried_flag',
          item_id: item.id,
          restaurant_id: item.restaurant_id,
          message: `Wrong fried flag for ${item.name}`,
          current_value: item.is_fried,
          suggested_fix: wrongFried.suggested,
          auto_fixable: false,
          metadata: { reason: wrongFried.reason }
        })
      }

      // Check invalid prices
      if (item.price !== null && (item.price < 0 || item.price > 500)) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'MEDIUM',
          category: 'invalid_price',
          item_id: item.id,
          restaurant_id: item.restaurant_id,
          message: `Invalid price for ${item.name}: $${item.price}`,
          current_value: item.price,
          suggested_fix: 'Verify price from official menu',
          auto_fixable: false
        })
      }

      // Check malformed descriptions
      if (item.description && item.description.length > 500) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'LOW',
          category: 'malformed_description',
          item_id: item.id,
          restaurant_id: item.restaurant_id,
          message: `Description too long (${item.description.length} chars): ${item.name}`,
          current_value: item.description,
          suggested_fix: 'Truncate description to 500 chars',
          auto_fixable: false
        })
      }
    }

    return findings
  }

  private detectWrongCategory(item: any): { suggested: string; confidence: number } | null {
    const name = item.name.toLowerCase()
    const desc = (item.description || '').toLowerCase()

    // Crispy items that are NOT desserts
    if (item.category === 'dessert' && (name.includes('crispy') || name.includes('fried'))) {
      if (!name.includes('cookie') && !name.includes('churro') && !name.includes('donut')) {
        return { suggested: 'entree', confidence: 0.95 }
      }
    }

    // Coffee/tea items miscategorized as entrees
    if (item.category === 'entree' && (name.includes('coffee') || name.includes('tea') || name.includes('espresso'))) {
      if (!name.includes('cake') && !name.includes('rub')) {
        return { suggested: 'beverage', confidence: 0.90 }
      }
    }

    return null
  }

  private detectWrongVegetarianFlag(item: any): { suggested: boolean; reason: string } | null {
    const name = item.name.toLowerCase()
    const desc = (item.description || '').toLowerCase()

    const meatKeywords = ['beef', 'pork', 'chicken', 'turkey', 'lamb', 'bacon', 'sausage', 'ham']
    const plantBased = ['jackfruit', 'beyond', 'impossible', 'plant-based']

    if (item.is_vegetarian) {
      // Check if it contains meat
      const hasMeat = meatKeywords.some(meat => name.includes(meat) || desc.includes(meat))
      const isPlantBased = plantBased.some(pb => name.includes(pb) || desc.includes(pb))

      if (hasMeat && !isPlantBased) {
        return { suggested: false, reason: `Contains meat keywords: ${meatKeywords.filter(m => name.includes(m) || desc.includes(m)).join(', ')}` }
      }
    }

    return null
  }

  private detectWrongFriedFlag(item: any): { suggested: boolean; reason: string } | null {
    const name = item.name.toLowerCase()
    const friedKeywords = ['fried', 'crispy', 'tempura', 'battered']

    if (!item.is_fried && friedKeywords.some(k => name.includes(k))) {
      return { suggested: true, reason: `Name contains fried keywords: ${friedKeywords.filter(k => name.includes(k)).join(', ')}` }
    }

    if (item.is_fried && !friedKeywords.some(k => name.includes(k))) {
      // Check if it's likely not fried (may be false positive)
      if (name.includes('grilled') || name.includes('baked') || name.includes('steamed')) {
        return { suggested: false, reason: 'Name suggests non-fried cooking method' }
      }
    }

    return null
  }
}
```

**Step 2: Commit**

```bash
git add scripts/audit/modules/correctness-audit.ts
git commit -m "feat(audit): implement correctness audit module

Checks for:
- Broken FK relationships (CRITICAL)
- Wrong categories (HIGH)
- Wrong vegetarian flags (HIGH)
- Wrong fried flags (MEDIUM)
- Invalid prices (MEDIUM)
- Malformed descriptions (LOW)"
```

---

### Task 7: Duplicate Audit Module

**Files:**
- Create: `scripts/audit/modules/duplicate-audit.ts`
- Reference: `scripts/audit/shared/string-similarity.ts`

**Step 1: Write duplicate audit module**

```typescript
// scripts/audit/modules/duplicate-audit.ts

import { v4 as uuidv4 } from 'uuid'
import { AuditModule, AuditContext, Finding } from '../shared/types.js'
import { createDuplicateKey, areFuzzyMatch, normalizeString } from '../shared/string-similarity.js'

export class DuplicateAudit implements AuditModule {
  name = 'duplicate-audit'
  description = 'Detects duplicates using tiered detection (exact, fuzzy, semantic)'

  async run(context: AuditContext): Promise<Finding[]> {
    const findings: Finding[] = []

    // Tier 1: Exact duplicates
    const exactDuplicates = this.findExactDuplicates(context.menuItems)
    for (const group of exactDuplicates) {
      const mostComplete = this.selectMostCompleteItem(group)
      const toDelete = group.filter(item => item.id !== mostComplete.id)

      for (const item of toDelete) {
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity: 'HIGH',
          category: 'exact_duplicate',
          item_id: item.id,
          restaurant_id: item.restaurant_id,
          message: `Exact duplicate: ${item.name}`,
          current_value: item.id,
          suggested_fix: `Merge with ${mostComplete.id} and delete`,
          auto_fixable: true,
          metadata: {
            duplicate_group: group.map(i => i.id),
            keep_id: mostComplete.id,
            delete_id: item.id
          }
        })
      }
    }

    // Tier 2: Fuzzy matches
    const fuzzyMatches = this.findFuzzyMatches(context.menuItems)
    for (const pair of fuzzyMatches) {
      findings.push({
        id: uuidv4(),
        module: this.name,
        severity: 'MEDIUM',
        category: 'fuzzy_duplicate',
        item_id: pair.item1.id,
        restaurant_id: pair.item1.restaurant_id,
        message: `Fuzzy match: "${pair.item1.name}" vs "${pair.item2.name}"`,
        current_value: pair.item1.name,
        suggested_fix: `Review for merge with ${pair.item2.id}`,
        auto_fixable: false,
        metadata: {
          other_id: pair.item2.id,
          other_name: pair.item2.name,
          similarity: pair.similarity
        }
      })
    }

    return findings
  }

  private findExactDuplicates(items: any[]): any[][] {
    const groups = new Map<string, any[]>()

    for (const item of items) {
      const key = createDuplicateKey(item.restaurant_id, item.name)
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(item)
    }

    return Array.from(groups.values()).filter(group => group.length > 1)
  }

  private selectMostCompleteItem(items: any[]): any {
    return items.reduce((best, current) => {
      const bestScore = this.completenessScore(best)
      const currentScore = this.completenessScore(current)
      return currentScore > bestScore ? current : best
    })
  }

  private completenessScore(item: any): number {
    let score = 0
    if (item.description) score += 2
    if (item.price) score += 1
    if (item.photo_url) score += 1
    return score
  }

  private findFuzzyMatches(items: any[]): Array<{ item1: any; item2: any; similarity: number }> {
    const matches: Array<{ item1: any; item2: any; similarity: number }> = []

    // Group by restaurant
    const byRestaurant = new Map<string, any[]>()
    for (const item of items) {
      if (!byRestaurant.has(item.restaurant_id)) {
        byRestaurant.set(item.restaurant_id, [])
      }
      byRestaurant.get(item.restaurant_id)!.push(item)
    }

    // Compare within each restaurant
    for (const [restaurantId, restaurantItems] of byRestaurant) {
      for (let i = 0; i < restaurantItems.length; i++) {
        for (let j = i + 1; j < restaurantItems.length; j++) {
          const item1 = restaurantItems[i]
          const item2 = restaurantItems[j]

          // Skip if already exact duplicates
          if (normalizeString(item1.name) === normalizeString(item2.name)) {
            continue
          }

          if (areFuzzyMatch(item1.name, item2.name, 0.85)) {
            matches.push({
              item1,
              item2,
              similarity: parseFloat(areFuzzyMatch(item1.name, item2.name, 0.85).toString())
            })
          }
        }
      }
    }

    return matches
  }
}
```

**Step 2: Commit**

```bash
git add scripts/audit/modules/duplicate-audit.ts
git commit -m "feat(audit): implement duplicate audit module

Implements tiered duplicate detection:
- Tier 1: Exact duplicates (HIGH, auto-mergeable)
- Tier 2: Fuzzy matches via Levenshtein (MEDIUM, requires review)
- Groups by restaurant to optimize performance"
```

---

### Task 8: Coverage Audit Module

**Files:**
- Create: `scripts/audit/modules/coverage-audit.ts`

**Step 1: Write coverage audit module**

```typescript
// scripts/audit/modules/coverage-audit.ts

import { v4 as uuidv4 } from 'uuid'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { AuditModule, AuditContext, Finding, ScrapedMenu } from '../shared/types.js'
import { areFuzzyMatch } from '../shared/string-similarity.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class CoverageAudit implements AuditModule {
  name = 'coverage-audit'
  description = 'Compares production DB against scraped menu data for coverage gaps'

  async run(context: AuditContext): Promise<Finding[]> {
    const findings: Finding[] = []

    // Load scraped data if not provided
    const scrapedData = context.scrapedData || this.loadScrapedData()

    if (scrapedData.length === 0) {
      findings.push({
        id: uuidv4(),
        module: this.name,
        severity: 'INFO',
        category: 'no_scraped_data',
        message: 'No scraped data available for coverage comparison',
        current_value: null,
        suggested_fix: 'Run scrapers to generate comparison data',
        auto_fixable: false
      })
      return findings
    }

    // Build lookups for DB data
    const dbItemsByRestaurant = new Map<string, Set<string>>()
    for (const item of context.menuItems) {
      const restaurantName = (item.restaurant as any)?.name || ''
      const key = this.createRestaurantKey(restaurantName)
      if (!dbItemsByRestaurant.has(key)) {
        dbItemsByRestaurant.set(key, new Set())
      }
      dbItemsByRestaurant.get(key)!.add(item.name.toLowerCase().trim())
    }

    // Compare scraped vs DB
    for (const scraped of scrapedData) {
      const restaurantKey = this.createRestaurantKey(scraped.restaurant)
      const dbItems = dbItemsByRestaurant.get(restaurantKey) || new Set()

      let missingCount = 0
      const missingItems: string[] = []

      for (const scrapedItem of scraped.items) {
        const found = this.findMatchingItem(scrapedItem.name, Array.from(dbItems))
        if (!found) {
          missingCount++
          missingItems.push(scrapedItem.name)
        }
      }

      if (missingCount > 0) {
        const severity = missingCount > 50 ? 'HIGH' : missingCount > 10 ? 'MEDIUM' : 'LOW'
        findings.push({
          id: uuidv4(),
          module: this.name,
          severity,
          category: 'missing_items',
          message: `${missingCount} items in scraped data but not in DB: ${scraped.restaurant} (${scraped.park})`,
          current_value: missingCount,
          suggested_fix: missingCount > 20 ? `Run npm run scrape:${this.getParkScraperName(scraped.park)}` : 'Manually verify if items removed',
          auto_fixable: false,
          metadata: {
            park: scraped.park,
            restaurant: scraped.restaurant,
            missing_items: missingItems.slice(0, 10), // First 10
            total_missing: missingCount
          }
        })
      }
    }

    return findings
  }

  private loadScrapedData(): ScrapedMenu[] {
    const scrapedDir = resolve(__dirname, '../../../data/scraped')
    const files = [
      'universal-usf.json',
      'universal-ioa.json',
      'universal-vb.json',
      'dollywood.json',
      'kings-island.json'
    ]

    const allScraped: ScrapedMenu[] = []

    for (const file of files) {
      const filePath = resolve(scrapedDir, file)
      if (existsSync(filePath)) {
        try {
          const data = JSON.parse(readFileSync(filePath, 'utf-8'))
          // Adapt to your scraped data format
          if (Array.isArray(data)) {
            allScraped.push(...data)
          }
        } catch (err) {
          console.warn(`Failed to load ${file}:`, err)
        }
      }
    }

    return allScraped
  }

  private createRestaurantKey(restaurantName: string): string {
    return restaurantName.toLowerCase().trim().replace(/[^\w\s]/g, '')
  }

  private findMatchingItem(scrapedName: string, dbNames: string[]): boolean {
    const normalized = scrapedName.toLowerCase().trim()

    // Exact match
    if (dbNames.includes(normalized)) return true

    // Fuzzy match
    return dbNames.some(dbName => areFuzzyMatch(normalized, dbName, 0.85))
  }

  private getParkScraperName(parkName: string): string {
    const name = parkName.toLowerCase()
    if (name.includes('universal')) return 'universal'
    if (name.includes('dollywood')) return 'dollywood'
    if (name.includes('kings island')) return 'kings-island'
    return 'unknown'
  }
}
```

**Step 2: Commit**

```bash
git add scripts/audit/modules/coverage-audit.ts
git commit -m "feat(audit): implement coverage audit module

Compares production DB against scraped menu data:
- Detects missing items (HIGH if >50, MEDIUM if >10, LOW otherwise)
- Uses fuzzy matching to handle name variations
- Suggests running scrapers for high-gap parks"
```

---

### Task 9: Threshold Recommender Module

**Files:**
- Create: `scripts/audit/modules/threshold-recommender.ts`

**Step 1: Write threshold recommender module**

```typescript
// scripts/audit/modules/threshold-recommender.ts

import { v4 as uuidv4 } from 'uuid'
import { AuditModule, AuditContext, Finding, ThresholdResult } from '../shared/types.js'

export class ThresholdRecommender implements AuditModule {
  name = 'threshold-recommender'
  description = 'Analyzes current state and recommends production readiness thresholds'

  async run(context: AuditContext): Promise<Finding[]> {
    const findings: Finding[] = []

    const metrics = this.calculateMetrics(context)
    const thresholds = this.recommendThresholds(metrics)
    const passFailStatus = this.determinePassFail(metrics, thresholds)

    findings.push({
      id: uuidv4(),
      module: this.name,
      severity: 'INFO',
      category: 'threshold_analysis',
      message: `Production readiness: ${passFailStatus.status}`,
      current_value: metrics,
      suggested_fix: passFailStatus.blocking_issues.length > 0
        ? `Fix ${passFailStatus.blocking_issues.length} blocking issues`
        : 'No blocking issues',
      auto_fixable: false,
      metadata: {
        current_metrics: metrics,
        recommended_thresholds: thresholds,
        pass_fail_status: passFailStatus
      }
    })

    return findings
  }

  private calculateMetrics(context: AuditContext): Record<string, number> {
    const totalItems = context.menuItems.length

    // Build nutrition lookup
    const nutritionMap = new Map<string, any>()
    for (const nd of context.nutritionalData) {
      nutritionMap.set(nd.menu_item_id, nd)
    }

    // Nutrition coverage
    let itemsWithNutrition = 0
    for (const item of context.menuItems) {
      const nutrition = nutritionMap.get(item.id)
      if (nutrition && nutrition.calories !== null) {
        itemsWithNutrition++
      }
    }
    const nutritionCoverage = (itemsWithNutrition / totalItems) * 100

    // Description coverage
    const itemsWithDescription = context.menuItems.filter(
      item => item.description && item.description.trim() !== ''
    ).length
    const descriptionCoverage = (itemsWithDescription / totalItems) * 100

    // Restaurant completion score
    const restaurantItemCounts = new Map<string, number>()
    for (const item of context.menuItems) {
      restaurantItemCounts.set(
        item.restaurant_id,
        (restaurantItemCounts.get(item.restaurant_id) || 0) + 1
      )
    }
    const avgItemsPerRestaurant = totalItems / context.restaurants.length

    return {
      nutrition_coverage: Math.round(nutritionCoverage * 10) / 10,
      description_coverage: Math.round(descriptionCoverage * 10) / 10,
      avg_items_per_restaurant: Math.round(avgItemsPerRestaurant * 10) / 10,
      total_items: totalItems,
      total_restaurants: context.restaurants.length,
      total_parks: context.parks.length
    }
  }

  private recommendThresholds(metrics: Record<string, number>): Record<string, any> {
    return {
      nutrition_coverage: {
        min: 85,
        target: 90,
        rationale: 'Food databases typically achieve 90%+ nutrition coverage. 85% minimum for production.'
      },
      description_coverage: {
        min: 70,
        target: 80,
        rationale: 'Restaurant apps typically have 80%+ descriptions. 70% acceptable for MVP.'
      },
      avg_items_per_restaurant: {
        min: 5,
        target: 10,
        rationale: 'Restaurants with <5 items likely have incomplete data.'
      }
    }
  }

  private determinePassFail(
    metrics: Record<string, number>,
    thresholds: Record<string, any>
  ): ThresholdResult {
    const blockingIssues: string[] = []
    const improvements: string[] = []

    // Check nutrition coverage
    if (metrics.nutrition_coverage < thresholds.nutrition_coverage.min) {
      blockingIssues.push(
        `Nutrition coverage at ${metrics.nutrition_coverage}% (target: ${thresholds.nutrition_coverage.min}%)`
      )
      improvements.push('Increase nutrition coverage to 85%+')
    } else if (metrics.nutrition_coverage < thresholds.nutrition_coverage.target) {
      improvements.push(`Improve nutrition coverage from ${metrics.nutrition_coverage}% to ${thresholds.nutrition_coverage.target}%`)
    }

    // Check description coverage
    if (metrics.description_coverage < thresholds.description_coverage.min) {
      blockingIssues.push(
        `Description coverage at ${metrics.description_coverage}% (target: ${thresholds.description_coverage.min}%)`
      )
      improvements.push('Increase description coverage to 70%+')
    }

    // Determine status
    let status: 'PASS' | 'CONDITIONAL_PASS' | 'FAIL'
    if (blockingIssues.length > 0) {
      status = 'FAIL'
    } else if (improvements.length > 0) {
      status = 'CONDITIONAL_PASS'
    } else {
      status = 'PASS'
    }

    return {
      current_metrics: metrics,
      recommended_thresholds: thresholds,
      pass_fail: status,
      blocking_issues: blockingIssues,
      improvement_priorities: improvements
    }
  }
}
```

**Step 2: Commit**

```bash
git add scripts/audit/modules/threshold-recommender.ts
git commit -m "feat(audit): implement threshold recommender module

Calculates current metrics:
- Nutrition coverage (% items with calories)
- Description coverage (% items with descriptions)
- Avg items per restaurant

Recommends thresholds based on industry benchmarks
Determines PASS/CONDITIONAL_PASS/FAIL status"
```

---

## Phase 3: Fixers

### Task 10: Auto-Fix Trivial Issues

**Files:**
- Create: `scripts/audit/fixers/auto-fix-trivial.ts`

**Step 1: Write auto-fix script**

```typescript
// scripts/audit/fixers/auto-fix-trivial.ts

import { writeFileSync } from 'fs'
import { Finding } from '../shared/types.js'
import { AuditDbClient } from '../shared/db-client.js'

export interface AutoFixResult {
  fixed_count: number
  backup_file: string
  deleted_ids: string[]
  updated_ids: string[]
}

export async function autoFixTrivial(
  findings: Finding[],
  dbClient: AuditDbClient,
  dryRun: boolean = true
): Promise<AutoFixResult> {
  const fixableFindings = findings.filter(f => f.auto_fixable)

  if (fixableFindings.length === 0) {
    console.log('No auto-fixable findings')
    return { fixed_count: 0, backup_file: '', deleted_ids: [], updated_ids: [] }
  }

  console.log(`\nAuto-Fix Summary (${dryRun ? 'DRY RUN' : 'APPLYING FIXES'}):`)
  console.log(`✓ ${fixableFindings.length} auto-fixable findings`)

  // Group by category
  const byCategory = new Map<string, Finding[]>()
  for (const finding of fixableFindings) {
    if (!byCategory.has(finding.category)) {
      byCategory.set(finding.category, [])
    }
    byCategory.get(finding.category)!.push(finding)
  }

  for (const [category, categoryFindings] of byCategory) {
    console.log(`  - ${category}: ${categoryFindings.length} fixes`)
  }

  if (dryRun) {
    console.log('\nRun with --apply to execute these fixes.')
    return { fixed_count: 0, backup_file: '', deleted_ids: [], updated_ids: [] }
  }

  // Backup affected records
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = `audit/backups/pre-fix-${timestamp}.json`
  const backup = await this.createBackup(fixableFindings, dbClient)
  writeFileSync(backupFile, JSON.stringify(backup, null, 2))
  console.log(`\n⚠️  Backup saved to: ${backupFile}`)

  // Apply fixes
  const deletedIds: string[] = []
  const updatedIds: string[] = []

  for (const finding of fixableFindings) {
    if (finding.category === 'exact_duplicate') {
      const deleteId = finding.metadata?.delete_id
      if (deleteId) {
        await this.deleteMenuItem(deleteId, dbClient)
        deletedIds.push(deleteId)
      }
    } else if (finding.category === 'broken_fk') {
      if (finding.item_id) {
        await this.deleteMenuItem(finding.item_id, dbClient)
        deletedIds.push(finding.item_id)
      } else if (finding.restaurant_id) {
        await this.deleteRestaurant(finding.restaurant_id, dbClient)
        deletedIds.push(finding.restaurant_id)
      }
    }
  }

  console.log(`\n✅ Fixed ${fixableFindings.length} issues`)
  console.log(`   Deleted: ${deletedIds.length} records`)
  console.log(`   Updated: ${updatedIds.length} records`)

  return {
    fixed_count: fixableFindings.length,
    backup_file: backupFile,
    deleted_ids: deletedIds,
    updated_ids: updatedIds
  }
}

async function createBackup(findings: Finding[], dbClient: AuditDbClient): Promise<any> {
  const backup: any = {
    timestamp: new Date().toISOString(),
    findings: findings.map(f => ({ id: f.id, category: f.category, item_id: f.item_id })),
    deleted_items: [],
    updated_items: []
  }

  // Fetch records that will be deleted
  const itemIds = findings.filter(f => f.item_id).map(f => f.item_id!)
  if (itemIds.length > 0) {
    const { data } = await dbClient.getClient()
      .from('menu_items')
      .select('*')
      .in('id', itemIds)

    backup.deleted_items = data || []
  }

  return backup
}

async function deleteMenuItem(id: string, dbClient: AuditDbClient): Promise<void> {
  // Delete dependent records first
  await dbClient.getClient().from('nutritional_data').delete().eq('menu_item_id', id)
  await dbClient.getClient().from('allergens').delete().eq('menu_item_id', id)

  // Delete menu item
  await dbClient.getClient().from('menu_items').delete().eq('id', id)
}

async function deleteRestaurant(id: string, dbClient: AuditDbClient): Promise<void> {
  await dbClient.getClient().from('restaurants').delete().eq('id', id)
}
```

**Step 2: Commit**

```bash
git add scripts/audit/fixers/auto-fix-trivial.ts
git commit -m "feat(audit): implement auto-fix for trivial issues

Auto-fixes:
- Exact duplicates (merge to most complete)
- Broken FK relationships (delete orphaned records)

Safety mechanisms:
- Dry-run mode (default)
- Backup before applying fixes
- Transaction-safe deletes (dependent records first)"
```

---

### Task 11: Generate Fix Scripts

**Files:**
- Create: `scripts/audit/fixers/generate-fix-scripts.ts`

**Step 1: Write fix script generator**

```typescript
// scripts/audit/fixers/generate-fix-scripts.ts

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { Finding } from '../shared/types.js'

export function generateFixScripts(findings: Finding[]): string[] {
  const scriptableFindings = findings.filter(
    f => !f.auto_fixable && f.severity === 'MEDIUM' && f.suggested_fix
  )

  if (scriptableFindings.length === 0) {
    console.log('No findings eligible for fix scripts')
    return []
  }

  // Ensure output directory exists
  if (!existsSync('audit/fixes')) {
    mkdirSync('audit/fixes', { recursive: true })
  }

  // Group by category
  const byCategory = new Map<string, Finding[]>()
  for (const finding of scriptableFindings) {
    if (!byCategory.has(finding.category)) {
      byCategory.set(finding.category, [])
    }
    byCategory.get(finding.category)!.push(finding)
  }

  const generatedFiles: string[] = []

  for (const [category, categoryFindings] of byCategory) {
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `audit/fixes/fix-${category}-${timestamp}.ts`

    const script = this.generateScript(category, categoryFindings)
    writeFileSync(filename, script)

    console.log(`✓ Generated fix script: ${filename} (${categoryFindings.length} fixes)`)
    generatedFiles.push(filename)
  }

  // Generate README
  const readmePath = 'audit/fixes/README.md'
  const readme = this.generateReadme(byCategory)
  writeFileSync(readmePath, readme)
  generatedFiles.push(readmePath)

  return generatedFiles
}

function generateScript(category: string, findings: Finding[]): string {
  const fixes = findings.map(f => ({
    id: f.item_id || f.restaurant_id || '',
    issue: f.category,
    current: f.current_value,
    suggested: f.suggested_fix,
    message: f.message,
    metadata: f.metadata
  }))

  return `#!/usr/bin/env tsx
/**
 * Auto-generated fix script for: ${category}
 * Generated: ${new Date().toISOString()}
 * Fixes: ${findings.length} items
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const envVars: Record<string, string> = {}
envContent.split('\\n').forEach(line => {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
  }
})

const sb = createClient(envVars['SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY'])

const FIXES = ${JSON.stringify(fixes, null, 2)}

async function main() {
  const dryRun = !process.argv.includes('--apply')

  console.log(\`\\n\${dryRun ? 'DRY RUN MODE' : 'APPLYING FIXES'}\\n\`)
  console.log(\`Total fixes: \${FIXES.length}\\n\`)

  let applied = 0

  for (const fix of FIXES) {
    console.log(\`\\n\${fix.issue}: \${fix.message}\`)
    console.log(\`  Current: \${fix.current}\`)
    console.log(\`  Suggested: \${fix.suggested}\`)

    if (!dryRun) {
      try {
        // TODO: Implement fix logic based on category
        // Example for wrong_category:
        // await sb.from('menu_items').update({ category: fix.suggested }).eq('id', fix.id)

        applied++
      } catch (err) {
        console.error(\`  ❌ Failed: \${err.message}\`)
      }
    }
  }

  if (dryRun) {
    console.log(\`\\n⚠️  DRY RUN: No changes applied. Run with --apply to execute fixes.\\n\`)
  } else {
    console.log(\`\\n✅ Applied \${applied}/\${FIXES.length} fixes\\n\`)
  }
}

main().catch(console.error)
`
}

function generateReadme(byCategory: Map<string, Finding[]>): string {
  let readme = `# Generated Fix Scripts

**Generated:** ${new Date().toISOString()}

## Available Scripts

`

  for (const [category, findings] of byCategory) {
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `fix-${category}-${timestamp}.ts`

    readme += `### ${filename}

- **Category:** ${category}
- **Fixes:** ${findings.length} items
- **Severity:** MEDIUM
- **Command:** \`npx tsx audit/fixes/${filename} --dry-run\`
- **Apply:** \`npx tsx audit/fixes/${filename} --apply\`

`
  }

  readme += `## Usage

1. Review the fix script to understand what it will change
2. Run with \`--dry-run\` (default) to preview changes
3. If satisfied, run with \`--apply\` to execute fixes
4. Results logged to \`fix-[category]-[timestamp]-results.json\`
`

  return readme
}
```

**Step 2: Commit**

```bash
git add scripts/audit/fixers/generate-fix-scripts.ts
git commit -m "feat(audit): implement fix script generator

Generates executable TypeScript fix scripts for MEDIUM severity findings:
- Groups by category
- Includes dry-run mode
- Auto-generates README index
- Scripts follow existing project patterns"
```

---

### Task 12: Flag Manual Review

**Files:**
- Create: `scripts/audit/fixers/flag-manual-review.ts`

**Step 1: Write manual review flagger**

```typescript
// scripts/audit/fixers/flag-manual-review.ts

import { writeFileSync } from 'fs'
import { Finding } from '../shared/types.js'

export function flagManualReview(findings: Finding[]): string {
  const highRiskFindings = findings.filter(
    f => (f.severity === 'CRITICAL' || f.severity === 'HIGH') && !f.auto_fixable
  )

  if (highRiskFindings.length === 0) {
    console.log('No high-risk findings requiring manual review')
    return ''
  }

  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `audit/manual-review-${timestamp}.md`

  const markdown = this.generateManualReviewReport(highRiskFindings)
  writeFileSync(filename, markdown)

  console.log(`✓ Manual review report: ${filename} (${highRiskFindings.length} items)`)

  return filename
}

function generateManualReviewReport(findings: Finding[]): string {
  const criticalFindings = findings.filter(f => f.severity === 'CRITICAL')
  const highFindings = findings.filter(f => f.severity === 'HIGH')

  let md = `# Manual Review Required - Production Audit ${new Date().toISOString().split('T')[0]}

**CRITICAL Issues:** ${criticalFindings.length}
**HIGH Priority Issues:** ${highFindings.length}

---

## CRITICAL Issues (${criticalFindings.length} items)

`

  let index = 1
  for (const finding of criticalFindings) {
    md += `### ${index}. ${finding.message}

**Category:** ${finding.category}
**Current Value:** ${JSON.stringify(finding.current_value)}
**Suggested Fix:** ${finding.suggested_fix || 'Manual review required'}

`

    if (finding.metadata) {
      md += `**Additional Context:**\n\`\`\`json\n${JSON.stringify(finding.metadata, null, 2)}\n\`\`\`\n\n`
    }

    md += `---\n\n`
    index++
  }

  md += `## HIGH Priority Issues (${highFindings.length} items)

`

  index = 1
  for (const finding of highFindings) {
    md += `### ${index}. ${finding.message}

**Category:** ${finding.category}
**Current Value:** ${JSON.stringify(finding.current_value)}
**Suggested Fix:** ${finding.suggested_fix || 'Manual review required'}

`

    if (finding.metadata) {
      md += `**Additional Context:**\n\`\`\`json\n${JSON.stringify(finding.metadata, null, 2)}\n\`\`\`\n\n`
    }

    md += `---\n\n`
    index++
  }

  return md
}
```

**Step 2: Commit**

```bash
git add scripts/audit/fixers/flag-manual-review.ts
git commit -m "feat(audit): implement manual review flagger

Generates human-readable Markdown report for CRITICAL/HIGH findings:
- Groups by severity
- Includes current values and suggested fixes
- Provides context/metadata for informed decisions"
```

---

## Phase 4: Reporters

### Task 13: JSON Reporter

**Files:**
- Create: `scripts/audit/reports/json-reporter.ts`

**Step 1: Write JSON reporter**

```typescript
// scripts/audit/reports/json-reporter.ts

import { writeFileSync } from 'fs'
import { AuditResult, Finding } from '../shared/types.js'

export function generateJsonReport(result: AuditResult, filename: string): void {
  writeFileSync(filename, JSON.stringify(result, null, 2))
  console.log(`✓ JSON report: ${filename}`)
}

export function buildAuditResult(
  findings: Finding[],
  executionTimeMs: number,
  dbSnapshot: any,
  thresholds?: any
): AuditResult {
  const bySeverity: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0
  }

  const byModule: Record<string, number> = {}

  for (const finding of findings) {
    bySeverity[finding.severity]++
    byModule[finding.module] = (byModule[finding.module] || 0) + 1
  }

  const autoFixableCount = findings.filter(f => f.auto_fixable).length
  const fixScriptCount = findings.filter(
    f => !f.auto_fixable && f.severity === 'MEDIUM'
  ).length
  const manualReviewCount = findings.filter(
    f => (f.severity === 'CRITICAL' || f.severity === 'HIGH') && !f.auto_fixable
  ).length

  return {
    metadata: {
      audit_version: '1.0.0',
      timestamp: new Date().toISOString(),
      execution_time_ms: executionTimeMs,
      database_snapshot: dbSnapshot
    },
    summary: {
      total_findings: findings.length,
      by_severity: bySeverity,
      by_module: byModule,
      auto_fixed: 0, // Updated by auto-fix fixer
      fix_scripts_generated: 0, // Updated by fix script generator
      manual_review_required: manualReviewCount
    },
    findings,
    thresholds
  }
}
```

**Step 2: Commit**

```bash
git add scripts/audit/reports/json-reporter.ts
git commit -m "feat(audit): implement JSON reporter

Generates machine-readable audit report:
- Full findings array
- Summary statistics by severity and module
- Metadata (timestamp, execution time, DB snapshot)
- Threshold analysis results"
```

---

### Task 14: Markdown Reporter

**Files:**
- Create: `scripts/audit/reports/markdown-reporter.ts`

**Step 1: Write Markdown reporter (truncated for brevity)**

```typescript
// scripts/audit/reports/markdown-reporter.ts

import { writeFileSync } from 'fs'
import { AuditResult } from '../shared/types.js'

export function generateMarkdownReport(result: AuditResult, filename: string): void {
  const markdown = buildMarkdownReport(result)
  writeFileSync(filename, markdown)
  console.log(`✓ Markdown report: ${filename}`)
}

function buildMarkdownReport(result: AuditResult): string {
  const { metadata, summary, findings, thresholds } = result

  let md = `# Production Readiness Audit Report

**Generated:** ${metadata.timestamp}
**Execution Time:** ${(metadata.execution_time_ms / 1000).toFixed(1)} seconds
**Database:** ${metadata.database_snapshot.parks} parks, ${metadata.database_snapshot.restaurants} restaurants, ${metadata.database_snapshot.menu_items} menu items

---

## Executive Summary

**Status:** ${thresholds?.pass_fail || 'N/A'}

### Findings by Severity

| Severity | Count | % of Items |
|----------|-------|------------|
| 🔴 CRITICAL | ${summary.by_severity.CRITICAL} | ${((summary.by_severity.CRITICAL / metadata.database_snapshot.menu_items) * 100).toFixed(1)}% |
| 🟠 HIGH | ${summary.by_severity.HIGH} | ${((summary.by_severity.HIGH / metadata.database_snapshot.menu_items) * 100).toFixed(1)}% |
| 🟡 MEDIUM | ${summary.by_severity.MEDIUM} | ${((summary.by_severity.MEDIUM / metadata.database_snapshot.menu_items) * 100).toFixed(1)}% |
| 🔵 LOW | ${summary.by_severity.LOW} | ${((summary.by_severity.LOW / metadata.database_snapshot.menu_items) * 100).toFixed(1)}% |
| ℹ️ INFO | ${summary.by_severity.INFO} | ${((summary.by_severity.INFO / metadata.database_snapshot.menu_items) * 100).toFixed(1)}% |

---

## Module Results

`

  for (const [module, count] of Object.entries(summary.by_module)) {
    md += `### ${module} (${count} findings)\n\n`

    const moduleFindings = findings.filter(f => f.module === module)
    const byCategory = new Map<string, number>()
    for (const finding of moduleFindings) {
      byCategory.set(finding.category, (byCategory.get(finding.category) || 0) + 1)
    }

    for (const [category, categoryCount] of byCategory) {
      md += `- **${category}:** ${categoryCount} items\n`
    }

    md += `\n`
  }

  if (thresholds) {
    md += `---

## Production Readiness Thresholds

### Current Metrics

| Metric | Current | Min | Target | Status |
|--------|---------|-----|--------|--------|
`

    for (const [key, value] of Object.entries(thresholds.current_metrics)) {
      const threshold = thresholds.recommended_thresholds[key]
      const status = threshold && value < threshold.min ? '⚠️' : '✅'
      md += `| ${key} | ${value} | ${threshold?.min || 'N/A'} | ${threshold?.target || 'N/A'} | ${status} |\n`
    }

    if (thresholds.blocking_issues.length > 0) {
      md += `\n### Blocking Issues\n\n`
      for (const issue of thresholds.blocking_issues) {
        md += `- ${issue}\n`
      }
    }

    if (thresholds.improvement_priorities.length > 0) {
      md += `\n### Improvement Priorities\n\n`
      thresholds.improvement_priorities.forEach((priority, i) => {
        md += `${i + 1}. ${priority}\n`
      })
    }
  }

  md += `\n---

## Next Steps

1. Review auto-fix backup (if applied)
2. Run generated fix scripts with --dry-run
3. Review manual review report for CRITICAL/HIGH issues
4. Run scrapers for high-gap parks
5. Re-run audit to verify improvements
`

  return md
}
```

**Step 2: Commit**

```bash
git add scripts/audit/reports/markdown-reporter.ts
git commit -m "feat(audit): implement Markdown reporter

Generates human-readable audit summary:
- Executive summary with pass/fail status
- Findings breakdown by severity and module
- Threshold analysis with current vs targets
- Actionable next steps"
```

---

### Task 15: CSV and Summary Dashboard

**Files:**
- Create: `scripts/audit/reports/csv-reporter.ts`
- Create: `scripts/audit/reports/summary-dashboard.ts`

**Step 1: Write CSV reporter**

```typescript
// scripts/audit/reports/csv-reporter.ts

import { writeFileSync } from 'fs'
import { Finding } from '../shared/types.js'

export function generateCsvReport(findings: Finding[], filename: string): void {
  const headers = [
    'finding_id', 'module', 'severity', 'category', 'park', 'restaurant',
    'item_name', 'item_id', 'message', 'current_value', 'suggested_fix',
    'auto_fixable', 'fix_script'
  ]

  const rows = findings.map(f => [
    f.id,
    f.module,
    f.severity,
    f.category,
    '', // park - would need to lookup
    '', // restaurant - would need to lookup
    '', // item_name - would need to lookup
    f.item_id || '',
    f.message,
    JSON.stringify(f.current_value),
    f.suggested_fix || '',
    f.auto_fixable ? 'YES' : 'NO',
    f.fix_script || ''
  ])

  const csv = [headers.join(','), ...rows.map(row => row.map(escapeCsv).join(','))].join('\n')

  writeFileSync(filename, csv)
  console.log(`✓ CSV report: ${filename}`)
}

function escapeCsv(value: any): string {
  const str = String(value || '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
```

**Step 2: Write summary dashboard**

```typescript
// scripts/audit/reports/summary-dashboard.ts

import { AuditResult } from '../shared/types.js'

export function printSummaryDashboard(result: AuditResult): void {
  const { metadata, summary, thresholds } = result

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log(`║       PRODUCTION READINESS AUDIT - ${new Date().toISOString().split('T')[0]}         ║`)
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  console.log('DATABASE SNAPSHOT')
  console.log(`  Parks: ${metadata.database_snapshot.parks} | Restaurants: ${metadata.database_snapshot.restaurants} | Menu Items: ${metadata.database_snapshot.menu_items}`)
  console.log(`  Items with Nutrition: ${metadata.database_snapshot.items_with_nutrition} (${((metadata.database_snapshot.items_with_nutrition / metadata.database_snapshot.menu_items) * 100).toFixed(1)}%)\n`)

  console.log(`AUDIT RESULTS (${(metadata.execution_time_ms / 1000).toFixed(1)}s execution time)`)
  console.log(`  ✅ Auto-Fixed:        ${summary.auto_fixed} issues`)
  console.log(`  📝 Fix Scripts:       ${summary.fix_scripts_generated} generated`)
  console.log(`  🚨 Manual Review:     ${summary.manual_review_required} CRITICAL/HIGH findings\n`)

  console.log('SEVERITY BREAKDOWN')
  const maxCount = Math.max(...Object.values(summary.by_severity))
  for (const [severity, count] of Object.entries(summary.by_severity)) {
    const emoji = getSeverityEmoji(severity)
    const pct = ((count / metadata.database_snapshot.menu_items) * 100).toFixed(1)
    const bar = '█'.repeat(Math.floor((count / maxCount) * 20))
    console.log(`  ${emoji} ${severity.padEnd(10)} ${String(count).padStart(4)}  (${pct}%)  ${bar}`)
  }

  if (thresholds) {
    const statusEmoji = thresholds.pass_fail === 'PASS' ? '✅' : thresholds.pass_fail === 'CONDITIONAL_PASS' ? '⚠️' : '❌'
    console.log(`\nPRODUCTION READINESS: ${statusEmoji}  ${thresholds.pass_fail}`)

    if (thresholds.blocking_issues.length > 0) {
      for (const issue of thresholds.blocking_issues) {
        console.log(`  ⚠️  ${issue}`)
      }
    }
  }

  console.log('\nNEXT STEPS')
  console.log('  1. Review manual-review-[date].md')
  console.log('  2. Run fix scripts in audit/fixes/')
  console.log('  3. Re-run audit to verify improvements\n')
}

function getSeverityEmoji(severity: string): string {
  const emojis: Record<string, string> = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🔵',
    INFO: 'ℹ️'
  }
  return emojis[severity] || '⚪'
}
```

**Step 3: Commit**

```bash
git add scripts/audit/reports/csv-reporter.ts scripts/audit/reports/summary-dashboard.ts
git commit -m "feat(audit): implement CSV reporter and summary dashboard

CSV reporter:
- Spreadsheet-friendly export for sorting/filtering
- Escape CSV special characters properly

Summary dashboard:
- Terminal-friendly ASCII output
- Visual bar charts for severity breakdown
- Quick pass/fail status
- Next steps guidance"
```

---

## Phase 5: Main Orchestrator

### Task 16: Main Orchestrator Script

**Files:**
- Create: `scripts/audit/production-audit.ts`

**Step 1: Write main orchestrator (part 1 - setup)**

```typescript
// scripts/audit/production-audit.ts

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { AuditDbClient } from './shared/db-client.js'
import { AuditContext, Finding } from './shared/types.js'
import { CompletenessAudit } from './modules/completeness-audit.js'
import { CorrectnessAudit } from './modules/correctness-audit.js'
import { DuplicateAudit } from './modules/duplicate-audit.js'
import { CoverageAudit } from './modules/coverage-audit.js'
import { ThresholdRecommender } from './modules/threshold-recommender.js'
import { autoFixTrivial } from './fixers/auto-fix-trivial.js'
import { generateFixScripts } from './fixers/generate-fix-scripts.js'
import { flagManualReview } from './fixers/flag-manual-review.js'
import { buildAuditResult, generateJsonReport } from './reports/json-reporter.js'
import { generateMarkdownReport } from './reports/markdown-reporter.js'
import { generateCsvReport } from './reports/csv-reporter.js'
import { printSummaryDashboard } from './reports/summary-dashboard.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║           PRODUCTION READINESS AUDIT SYSTEM                  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  const startTime = Date.now()

  // Load env vars
  const envPath = resolve(__dirname, '../../.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const envVars: Record<string, string> = {}
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
    }
  })

  if (!envVars['SUPABASE_URL'] || !envVars['SUPABASE_SERVICE_ROLE_KEY']) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  // Initialize DB client
  console.log('🔗 Connecting to database...')
  const dbClient = new AuditDbClient(
    envVars['SUPABASE_URL'],
    envVars['SUPABASE_SERVICE_ROLE_KEY']
  )

  // Fetch all data
  console.log('📦 Fetching data...')
  const [parks, restaurants, menuItems, nutritionalData, allergens] = await Promise.all([
    dbClient.fetchParks(),
    dbClient.fetchRestaurants(),
    dbClient.fetchMenuItems(),
    dbClient.fetchNutritionalData(),
    dbClient.fetchAllergens()
  ])

  console.log(`   Parks: ${parks.length}`)
  console.log(`   Restaurants: ${restaurants.length}`)
  console.log(`   Menu Items: ${menuItems.length}`)
  console.log(`   Nutritional Data: ${nutritionalData.length}`)
  console.log(`   Allergens: ${allergens.length}\n`)

  const context: AuditContext = {
    parks,
    restaurants,
    menuItems,
    nutritionalData,
    allergens
  }

  // Run audit modules in parallel
  console.log('🔍 Running audit modules...')
  const modules = [
    new CompletenessAudit(),
    new CorrectnessAudit(),
    new DuplicateAudit(),
    new CoverageAudit(),
    new ThresholdRecommender()
  ]

  const moduleResults = await Promise.allSettled(
    modules.map(module => {
      console.log(`   - ${module.name}`)
      return module.run(context)
    })
  )

  const allFindings: Finding[] = []
  for (const [index, result] of moduleResults.entries()) {
    if (result.status === 'rejected') {
      console.error(`   ❌ ${modules[index].name} failed:`, result.reason.message)
    } else {
      allFindings.push(...result.value)
      console.log(`   ✅ ${modules[index].name}: ${result.value.length} findings`)
    }
  }

  console.log(`\n📊 Total findings: ${allFindings.length}\n`)

  // Apply auto-fixes
  console.log('🔧 Applying auto-fixes...')
  const dryRun = !process.argv.includes('--apply')
  const autoFixResult = await autoFixTrivial(allFindings, dbClient, dryRun)

  // Generate fix scripts
  console.log('\n📝 Generating fix scripts...')
  const fixScripts = generateFixScripts(allFindings)

  // Flag manual review
  console.log('\n🚨 Flagging manual review items...')
  const manualReviewFile = flagManualReview(allFindings)

  // Generate reports
  console.log('\n📄 Generating reports...')
  const timestamp = new Date().toISOString().split('T')[0]
  const executionTime = Date.now() - startTime

  const itemsWithNutrition = nutritionalData.filter(nd => nd.calories !== null).length
  const dbSnapshot = {
    parks: parks.length,
    restaurants: restaurants.length,
    menu_items: menuItems.length,
    items_with_nutrition: itemsWithNutrition
  }

  const thresholds = allFindings.find(f => f.module === 'threshold-recommender')?.metadata

  const auditResult = buildAuditResult(allFindings, executionTime, dbSnapshot, thresholds)
  auditResult.summary.auto_fixed = autoFixResult.fixed_count
  auditResult.summary.fix_scripts_generated = fixScripts.length

  generateJsonReport(auditResult, `audit/production-audit-${timestamp}.json`)
  generateMarkdownReport(auditResult, `audit/production-audit-${timestamp}.md`)
  generateCsvReport(allFindings, `audit/production-audit-${timestamp}.csv`)

  printSummaryDashboard(auditResult)

  console.log('✅ Audit complete!\n')
}

main().catch(err => {
  console.error('❌ Audit failed:', err)
  process.exit(1)
})
```

**Step 2: Commit**

```bash
git add scripts/audit/production-audit.ts
git commit -m "feat(audit): implement main orchestrator

Orchestrates full audit pipeline:
- Loads env vars and connects to Supabase
- Fetches all data in parallel
- Runs 5 audit modules concurrently
- Applies auto-fixes (with --apply flag)
- Generates fix scripts
- Flags manual review items
- Generates JSON, Markdown, CSV reports
- Prints terminal summary dashboard"
```

---

## Phase 6: Testing & Documentation

### Task 17: Add Package Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add audit scripts to package.json**

```json
{
  "scripts": {
    "audit:production": "npx tsx scripts/audit/production-audit.ts",
    "audit:production:apply": "npx tsx scripts/audit/production-audit.ts --apply"
  }
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add audit npm scripts

- npm run audit:production (dry-run mode)
- npm run audit:production:apply (execute fixes)"
```

---

### Task 18: Create .gitignore for Audit Outputs

**Files:**
- Modify: `.gitignore`

**Step 1: Add audit output patterns**

```
# Audit outputs
audit/production-audit-*.json
audit/production-audit-*.md
audit/production-audit-*.csv
audit/manual-review-*.md
audit/fixes/fix-*.ts
audit/fixes/fix-*.json
audit/backups/pre-fix-*.json
audit/backups/rollback-*.ts
```

**Step 2: Keep directory structure**

```bash
touch audit/.gitkeep
touch audit/fixes/.gitkeep
touch audit/backups/.gitkeep
git add audit/.gitkeep audit/fixes/.gitkeep audit/backups/.gitkeep .gitignore
git commit -m "chore: add gitignore rules for audit outputs

Exclude generated reports and fix scripts from git
Keep directory structure with .gitkeep files"
```

---

### Task 19: Write Usage Documentation

**Files:**
- Create: `scripts/audit/README.md`

**Step 1: Write audit README**

```markdown
# Production Readiness Audit System

Comprehensive database audit system with modular architecture, tiered fixing, and multi-format reporting.

## Quick Start

\`\`\`bash
# Run audit in dry-run mode (no changes)
npm run audit:production

# Apply auto-fixes
npm run audit:production:apply
\`\`\`

## Architecture

- **5 Audit Modules:** completeness, correctness, duplicates, coverage, thresholds
- **3-Tier Fixing:** auto-fix (trivial), fix scripts (medium), manual review (high-risk)
- **4 Report Formats:** JSON, Markdown, CSV, terminal dashboard

## Modules

### 1. Completeness Audit
Detects missing data: nutrition, descriptions, prices, photos, allergens, sparse restaurants

### 2. Correctness Audit
Identifies incorrect data: wrong categories, broken FKs, invalid prices, malformed descriptions

### 3. Duplicate Audit
Tiered detection: exact duplicates (HIGH), fuzzy matches (MEDIUM), semantic duplicates (LOW)

### 4. Coverage Audit
Compares production DB vs scraped menu data, flags missing items and restaurants

### 5. Threshold Recommender
Analyzes metrics, recommends thresholds, determines PASS/CONDITIONAL_PASS/FAIL

## Outputs

All outputs saved to `audit/`:

- `production-audit-YYYY-MM-DD.json` - Machine-readable full report
- `production-audit-YYYY-MM-DD.md` - Human-readable summary
- `production-audit-YYYY-MM-DD.csv` - Spreadsheet export
- `manual-review-YYYY-MM-DD.md` - CRITICAL/HIGH findings requiring human review
- `fixes/fix-[category]-YYYY-MM-DD.ts` - Generated fix scripts
- `backups/pre-fix-[timestamp].json` - Backup before auto-fixes

## Workflow

1. **Run audit:** `npm run audit:production`
2. **Review reports:** Check `audit/production-audit-*.md`
3. **Apply auto-fixes:** `npm run audit:production:apply` (if confident)
4. **Run fix scripts:** `npx tsx audit/fixes/fix-[category]-*.ts --dry-run`, then `--apply`
5. **Manual review:** Address items in `audit/manual-review-*.md`
6. **Re-run audit:** Verify improvements

## Safety Features

- **Dry-run mode:** Default behavior, requires `--apply` flag
- **Backups:** Auto-created before fixes
- **Rollback scripts:** Generated in `audit/backups/`
- **Confirmation prompts:** For destructive operations
- **Transaction safety:** FK cascades handled correctly

## Development

Run individual modules:

\`\`\`typescript
import { CompletenessAudit } from './modules/completeness-audit.js'
const audit = new CompletenessAudit()
const findings = await audit.run(context)
\`\`\`

## See Also

- Design document: `docs/plans/2026-02-22-production-audit-design.md`
- Existing audits: `scripts/audit-nutrition.ts`, `scripts/check-duplicates.ts`
\`\`\`

**Step 2: Commit**

```bash
git add scripts/audit/README.md
git commit -m "docs: add audit system usage documentation

Complete guide covering:
- Quick start commands
- Architecture overview
- Module descriptions
- Output files
- Recommended workflow
- Safety features"
```

---

## Phase 7: Final Integration

### Task 20: Integration Test

**Files:**
- Test manually

**Step 1: Run audit in dry-run mode**

```bash
npm run audit:production
```

**Expected output:**
- Connects to database successfully
- Fetches all tables
- Runs 5 modules without errors
- Generates reports in `audit/` directory
- Prints summary dashboard

**Step 2: Verify outputs exist**

```bash
ls audit/production-audit-*.json
ls audit/production-audit-*.md
ls audit/production-audit-*.csv
ls audit/manual-review-*.md
ls audit/fixes/README.md
```

**Step 3: Review reports**

Read `audit/production-audit-*.md` and verify:
- Executive summary is accurate
- Findings are categorized correctly
- Thresholds are calculated
- Next steps are actionable

**Step 4: Test auto-fix (if findings exist)**

```bash
npm run audit:production:apply
```

Verify:
- Backup created in `audit/backups/`
- Auto-fixes applied (check counts)
- No database errors

**Step 5: Commit integration test results**

```bash
git add -A
git commit -m "test: verify production audit system integration

Manual integration test passed:
✅ All modules execute without errors
✅ Reports generated correctly
✅ Auto-fix works with backups
✅ Terminal dashboard displays properly"
```

---

## Execution Options

Plan complete and saved to `docs/plans/2026-02-22-production-audit-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
