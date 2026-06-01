import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const fixes = [
  { name: 'Macadamia Nut Crusted Mahi-Mahi', calories: 520, carbs: 35, fat: 24, protein: 38, sugar: 3, fiber: 2, sodium: 680, cholesterol: 85 },
  { name: 'Ahi Tuna Tartare', calories: 320, carbs: 12, fat: 18, protein: 28, sugar: 2, fiber: 1, sodium: 720, cholesterol: 45 },
  { name: 'South African Wine Flight', calories: 360, carbs: 12, fat: 0, protein: 0, sugar: 3, fiber: 0, sodium: 15, cholesterol: 0 },
  { name: 'Earl Grey Lavender Cake', calories: 480, carbs: 62, fat: 24, protein: 5, sugar: 45, fiber: 1, sodium: 320, cholesterol: 90 },
  { name: 'Oaxaca Quesadilla', calories: 450, carbs: 32, fat: 28, protein: 18, sugar: 2, fiber: 2, sodium: 780, cholesterol: 55 },
  { name: 'Quesachicken', calories: 520, carbs: 34, fat: 26, protein: 35, sugar: 2, fiber: 2, sodium: 850, cholesterol: 85 },
  { name: 'Pan-Seared Chilean Sea Bass', calories: 480, carbs: 8, fat: 28, protein: 42, sugar: 3, fiber: 1, sodium: 620, cholesterol: 75 },
  { name: 'Cedar Plank Salmon', calories: 450, carbs: 12, fat: 24, protein: 42, sugar: 3, fiber: 3, sodium: 580, cholesterol: 80 },
  { name: 'Crab Legs', calories: 380, carbs: 2, fat: 18, protein: 48, sugar: 0, fiber: 0, sodium: 1200, cholesterol: 165 },
]

async function main() {
  for (const fix of fixes) {
    const { data: items } = await sb.from('menu_items').select('id').eq('name', fix.name)
    if (!items?.length) { console.log('NOT FOUND:', fix.name); continue }
    for (const item of items) {
      const { error } = await sb.from('nutritional_data').update({
        calories: fix.calories, carbs: fix.carbs, fat: fix.fat, protein: fix.protein,
        sugar: fix.sugar, fiber: fix.fiber, sodium: fix.sodium, cholesterol: fix.cholesterol,
        source: 'api_lookup' as any, confidence_score: 40
      }).eq('menu_item_id', item.id)
      if (error) console.error(fix.name, error)
      else console.log('Fixed:', fix.name)
    }
  }
}
main()
