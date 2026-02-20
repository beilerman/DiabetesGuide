/**
 * Common types for all scraper modules
 */

export interface ScrapedItem {
  source: 'allears' | 'dfb' | 'official' | 'touringplans' | 'universal' | 'yelp'
  parkName: string
  restaurantName: string
  landName?: string
  itemName: string
  description?: string
  price?: number
  category?: 'entree' | 'dessert' | 'beverage' | 'side' | 'snack'
  photoUrl?: string
  scrapedAt: Date
  confidence: number // 0-100 based on source reliability
}

export interface ScrapedRestaurant {
  source: ScrapedItem['source']
  parkName: string
  restaurantName: string
  landName?: string
  cuisineType?: string
  items: Omit<ScrapedItem, 'source' | 'parkName' | 'restaurantName' | 'landName' | 'scrapedAt' | 'confidence'>[]
  restaurantPhotoUrl?: string
  scrapedAt: Date
}

export interface ScrapeResult {
  source: ScrapedItem['source']
  scrapedAt: Date
  restaurants: ScrapedRestaurant[]
  errors: string[]
}
