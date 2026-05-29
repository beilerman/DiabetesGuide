import { describe, expect, it } from 'vitest'

describe('collectExistingNutritionRows', () => {
  it('normalizes Supabase nested nutritional_data arrays', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'

    const { collectExistingNutritionRows } = await import('../estimate-nutrition.js')
    const rows = collectExistingNutritionRows([
      {
        id: 'item-1',
        name: 'Cheeseburger',
        category: 'entree',
        nutritional_data: [
          {
            calories: 700,
            carbs: 45,
            fat: 38,
            protein: 30,
            sugar: 8,
            fiber: 3,
            sodium: 1200,
          },
        ],
      },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Cheeseburger', calories: 700, carbs: 45 })
  })
})
