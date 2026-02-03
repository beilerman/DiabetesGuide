export interface Park {
  id: string
  name: string
  location: string
  timezone: string
  first_aid_locations: FirstAidLocation[]
  created_at: string
}

export interface FirstAidLocation {
  name: string
  description: string
  land?: string
}

export interface Restaurant {
  id: string
  park_id: string
  name: string
  land: string | null
  cuisine_type: string | null
  hours: Record<string, string> | null
  lat: number | null
  lon: number | null
  created_at: string
}

export interface MenuItem {
  id: string
  restaurant_id: string
  name: string
  description: string | null
  price: number | null
  category: 'entree' | 'snack' | 'beverage' | 'dessert' | 'side'
  is_seasonal: boolean
  is_fried: boolean
  is_vegetarian: boolean
  photo_url: string | null
  created_at: string
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
  source: 'official' | 'crowdsourced' | 'api_lookup'
  source_detail: string | null
  confidence_score: number
  created_at: string
}

export interface Allergen {
  id: string
  menu_item_id: string
  allergen_type: string
  severity: 'contains' | 'may_contain'
  created_at: string
}

export interface MenuItemWithNutrition extends MenuItem {
  nutritional_data: NutritionalData[]
  allergens: Allergen[]
  restaurant?: Restaurant & { park?: Park }
}

export interface MealItem {
  id: string
  name: string
  carbs: number
  calories: number
  fat: number
}

export interface Filters {
  search: string
  maxCarbs: number | null
  category: MenuItem['category'] | null
  vegetarianOnly: boolean
  hideFried: boolean
  hideDrinks: boolean
  sort: 'name' | 'carbsAsc' | 'carbsDesc' | 'caloriesAsc' | 'caloriesDesc'
}
