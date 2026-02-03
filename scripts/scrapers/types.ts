/**
 * Common types for all scraper modules
 */

export interface ScrapedItem {
  source: 'allears' | 'dfb' | 'official' | 'touringplans' | 'yelp'
  parkName: string
  restaurantName: string
  landName?: string
  itemName: string
  description?: string
  price?: number
  category?: 'entree' | 'dessert' | 'beverage' | 'side' | 'snack'
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
  scrapedAt: Date
}

export interface ScrapeResult {
  source: ScrapedItem['source']
  scrapedAt: Date
  restaurants: ScrapedRestaurant[]
  errors: string[]
}
