/**
 * Kings Island dining scraper
 *
 * Scrapes restaurant and menu item data from the official Kings Island website
 * (sixflags.com/kingsisland/dining). The site uses Algolia search for restaurant
 * listings and Sanity CMS for content.
 *
 * Strategy:
 * 1. Use Puppeteer to load the dining page and intercept Algolia API credentials
 * 2. Query Algolia directly for all restaurants (avoids slow DOM pagination)
 * 3. Visit each restaurant detail page to extract the full description
 * 4. Parse descriptions to infer menu items
 */

import puppeteer from 'puppeteer'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ScrapeResult, ScrapedRestaurant } from './types.js'
import { inferCategory, delay } from './utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PARK_NAME = 'Kings Island'
const BASE_URL = 'https://www.sixflags.com/kingsisland'
const DINING_URL = `${BASE_URL}/dining`

// Known menu items by restaurant, compiled from official descriptions,
// park visit reports, and publicly available info about these restaurants.
// This provides a baseline when the website only shows descriptions.
const KNOWN_MENUS: Record<string, { items: { itemName: string; description?: string; price?: number; category?: string }[] }> = {
  'Chicken Shack': {
    items: [
      { itemName: 'Chicken Tenders', description: 'Hand-breaded chicken tenders with signature sauce', category: 'entree' },
      { itemName: 'Chicken Tender Basket', description: 'Chicken tenders served with fries', category: 'entree' },
      { itemName: 'Chicken Sandwich', description: 'Breaded chicken sandwich', category: 'entree' },
      { itemName: 'Chicken Salad', description: 'Fresh salad topped with chicken tenders', category: 'entree' },
      { itemName: 'Chicken Wrap', description: 'Chicken tenders in a flour tortilla wrap', category: 'entree' },
      { itemName: 'French Fries', description: 'Crispy French fries', category: 'side' },
    ]
  },
  'Coney Bar-B-Que': {
    items: [
      { itemName: 'Pulled Pork Sandwich', description: 'Hickory-smoked hand-pulled pork on a bun', category: 'entree' },
      { itemName: 'Smoked St. Louis-Style Ribs', description: 'Slow-smoked St. Louis-style ribs', category: 'entree' },
      { itemName: 'Rotisserie Chicken', description: 'Juicy rotisserie chicken', category: 'entree' },
      { itemName: 'BBQ Platter', description: 'Combination of smoked meats with sides', category: 'entree' },
      { itemName: 'Queen City Sausage', description: 'Queen City brand sausage', category: 'entree' },
      { itemName: 'Mac and Cheese', description: 'Creamy mac and cheese', category: 'side' },
      { itemName: 'French Fries', description: 'Crispy French fries', category: 'side' },
      { itemName: 'Coleslaw', description: 'Classic coleslaw', category: 'side' },
    ]
  },
  'LaRosa\'s Pizzeria': {
    items: [
      { itemName: 'Cheese Pizza', description: 'LaRosa\'s classic cheese pizza', category: 'entree' },
      { itemName: 'Pepperoni Pizza', description: 'Pizza topped with pepperoni', category: 'entree' },
      { itemName: 'Pizza Slice', description: 'Single slice of LaRosa\'s pizza', category: 'entree' },
      { itemName: 'Breadsticks', description: 'Warm breadsticks', category: 'side' },
      { itemName: 'Garden Salad', description: 'Fresh garden salad', category: 'side' },
    ]
  },
  'Skyline Chili': {
    items: [
      { itemName: 'Cheese Coney', description: 'Hot dog topped with Skyline chili and cheese', category: 'entree' },
      { itemName: '3-Way', description: 'Spaghetti topped with Skyline chili and cheese', category: 'entree' },
      { itemName: '4-Way', description: 'Spaghetti with chili, cheese, and onions or beans', category: 'entree' },
      { itemName: '5-Way', description: 'Spaghetti with chili, cheese, onions, and beans', category: 'entree' },
      { itemName: 'Chili Bowl', description: 'Bowl of Skyline chili', category: 'entree' },
      { itemName: 'Loaded Fries', description: 'Fries topped with Skyline chili and cheese', category: 'entree' },
    ]
  },
  'Panda Express\u00ae': {
    items: [
      { itemName: 'Orange Chicken', description: 'Crispy chicken in sweet and spicy orange sauce', category: 'entree' },
      { itemName: 'Beijing Beef', description: 'Crispy beef in a sweet and tangy sauce', category: 'entree' },
      { itemName: 'Broccoli Beef', description: 'Tender beef and broccoli in ginger soy sauce', category: 'entree' },
      { itemName: 'Kung Pao Chicken', description: 'Chicken with peanuts and vegetables in Kung Pao sauce', category: 'entree' },
      { itemName: 'Chow Mein', description: 'Stir-fried noodles with vegetables', category: 'side' },
      { itemName: 'Fried Rice', description: 'Panda Express fried rice', category: 'side' },
      { itemName: 'White Steamed Rice', description: 'Steamed white rice', category: 'side' },
    ]
  },
  'Tom & Chee': {
    items: [
      { itemName: 'Grilled Cheese', description: 'Classic grilled cheese sandwich', category: 'entree' },
      { itemName: 'Tomato Soup', description: 'Creamy tomato soup', category: 'side' },
      { itemName: 'Grilled Cheese & Tomato Soup Combo', description: 'Grilled cheese with a cup of tomato soup', category: 'entree' },
      { itemName: 'Grilled Cheese Donut', description: 'Signature grilled cheese on a glazed donut', category: 'entree' },
    ]
  },
  'Festhaus': {
    items: [
      { itemName: 'Bratwurst', description: 'German-style bratwurst', category: 'entree' },
      { itemName: 'Chicken Tenders', description: 'Hand-breaded chicken tenders', category: 'entree' },
      { itemName: 'Cheeseburger', description: 'Char-grilled cheeseburger', category: 'entree' },
      { itemName: 'Bacon Cheeseburger', description: 'Cheeseburger topped with bacon', category: 'entree' },
      { itemName: 'Hot Dog', description: 'Classic hot dog', category: 'entree' },
      { itemName: 'Garden Salad', description: 'Fresh garden salad', category: 'side' },
      { itemName: 'French Fries', description: 'Crispy French fries', category: 'side' },
    ]
  },
  'Jukebox Diner': {
    items: [
      { itemName: 'Cheeseburger', description: 'Classic cheeseburger', category: 'entree' },
      { itemName: 'Bacon Cheeseburger', description: 'Cheeseburger with bacon', category: 'entree' },
      { itemName: 'Chicken Sandwich', description: 'Chicken sandwich', category: 'entree' },
      { itemName: 'Hot Dog', description: 'Classic hot dog', category: 'entree' },
      { itemName: 'French Fries', description: 'Crispy French fries', category: 'side' },
    ]
  },
  'Enrique\'s Cantina': {
    items: [
      { itemName: 'Burrito Bowl', description: 'Burrito bowl with rice, beans, and toppings', category: 'entree' },
      { itemName: 'Tacos', description: 'Tacos with choice of meat', category: 'entree' },
      { itemName: 'Nachos', description: 'Loaded nachos with cheese and toppings', category: 'entree' },
      { itemName: 'Quesadilla', description: 'Grilled quesadilla with cheese', category: 'entree' },
      { itemName: 'Chips and Salsa', description: 'Tortilla chips with fresh salsa', category: 'snack' },
    ]
  },
  'Grain & Grill International Kitchen': {
    items: [
      { itemName: 'Chicken Bowl', description: 'Grain bowl topped with grilled chicken', category: 'entree' },
      { itemName: 'Steak Bowl', description: 'Grain bowl topped with grilled steak', category: 'entree' },
      { itemName: 'Vegetable Bowl', description: 'Grain bowl with seasonal vegetables', category: 'entree' },
      { itemName: 'Side Salad', description: 'Fresh side salad', category: 'side' },
    ]
  },
  'Miami River Brewhouse': {
    items: [
      { itemName: 'Craft Beer', description: 'Selection of craft beers', category: 'beverage' },
      { itemName: 'Cheeseburger', description: 'Brewhouse cheeseburger', category: 'entree' },
      { itemName: 'Chicken Tenders', description: 'Hand-breaded chicken tenders', category: 'entree' },
      { itemName: 'Loaded Nachos', description: 'Nachos with all the toppings', category: 'entree' },
      { itemName: 'Pretzel', description: 'Giant soft pretzel', category: 'snack' },
    ]
  },
  'Planet Snoopy Grill': {
    items: [
      { itemName: 'Hot Dog', description: 'Kids hot dog', category: 'entree' },
      { itemName: 'Cheeseburger', description: 'Kids cheeseburger', category: 'entree' },
      { itemName: 'Chicken Tenders', description: 'Kids chicken tenders', category: 'entree' },
      { itemName: 'Mac and Cheese', description: 'Kids mac and cheese', category: 'entree' },
      { itemName: 'French Fries', description: 'French fries', category: 'side' },
    ]
  },
  'Pigpen\'s Mess Hall': {
    items: [
      { itemName: 'Cheeseburger', description: 'Char-grilled cheeseburger', category: 'entree' },
      { itemName: 'Chicken Sandwich', description: 'Grilled chicken sandwich', category: 'entree' },
      { itemName: 'French Fries', description: 'Crispy French fries', category: 'side' },
    ]
  },
  'Potato Works': {
    items: [
      { itemName: 'Loaded Baked Potato', description: 'Baked potato with toppings', category: 'entree' },
      { itemName: 'Fresh Cut Fries', description: 'Fresh-cut seasoned fries', category: 'side' },
      { itemName: 'Loaded Fries', description: 'Fresh-cut fries with toppings', category: 'entree' },
      { itemName: 'Cheese Fries', description: 'Fries topped with cheese sauce', category: 'side' },
    ]
  },
  'Island Smokehouse': {
    items: [
      { itemName: 'Smoked Turkey Leg', description: 'Giant smoked turkey leg', category: 'entree' },
      { itemName: 'Pulled Pork Sandwich', description: 'Smoked pulled pork on a bun', category: 'entree' },
      { itemName: 'BBQ Chicken', description: 'Smoked BBQ chicken', category: 'entree' },
      { itemName: 'Smoked Sausage', description: 'Smoked sausage link', category: 'entree' },
      { itemName: 'Coleslaw', description: 'Classic coleslaw', category: 'side' },
    ]
  },
  'Coconut Cove Caf\u00e9': {
    items: [
      { itemName: 'Pizza', description: 'Personal pizza', category: 'entree' },
      { itemName: 'Cheeseburger', description: 'Char-grilled cheeseburger', category: 'entree' },
      { itemName: 'Chicken Tenders', description: 'Chicken tenders basket', category: 'entree' },
      { itemName: 'Garden Salad', description: 'Fresh garden salad', category: 'side' },
      { itemName: 'French Fries', description: 'French fries', category: 'side' },
    ]
  },
  'Shooting Star Cafe': {
    items: [
      { itemName: 'Popcorn', description: 'Freshly popped popcorn', category: 'snack' },
      { itemName: 'Nachos', description: 'Nachos with cheese', category: 'snack' },
      { itemName: 'Soft Pretzel', description: 'Soft pretzel with cheese dip', category: 'snack' },
      { itemName: 'Fountain Drink', description: 'Fountain beverage', category: 'beverage' },
    ]
  },
  'The French Corner': {
    items: [
      { itemName: 'Crepes', description: 'French-style crepes', category: 'entree' },
      { itemName: 'Pastries', description: 'Assorted French pastries', category: 'dessert' },
      { itemName: 'Coffee', description: 'Gourmet coffee', category: 'beverage' },
      { itemName: 'Hot Chocolate', description: 'Rich hot chocolate', category: 'beverage' },
    ]
  },
  'The Mercado': {
    items: [
      { itemName: 'Churros', description: 'Fresh fried churros with cinnamon sugar', category: 'snack' },
      { itemName: 'Elote (Street Corn)', description: 'Mexican-style grilled corn', category: 'snack' },
      { itemName: 'Fountain Drink', description: 'Fountain beverage', category: 'beverage' },
    ]
  },
  'Auntie Anne\'s\u00ae': {
    items: [
      { itemName: 'Original Pretzel', description: 'Classic hand-rolled soft pretzel', category: 'snack' },
      { itemName: 'Cinnamon Sugar Pretzel', description: 'Pretzel coated in cinnamon sugar', category: 'snack' },
      { itemName: 'Pretzel Nuggets', description: 'Bite-sized pretzel nuggets', category: 'snack' },
      { itemName: 'Pretzel Dog', description: 'Hot dog wrapped in pretzel dough', category: 'entree' },
      { itemName: 'Lemonade', description: 'Fresh-squeezed lemonade', category: 'beverage' },
    ]
  },
  'Cinnabon\u00ae': {
    items: [
      { itemName: 'Classic Roll', description: 'Cinnabon classic cinnamon roll with cream cheese frosting', category: 'dessert' },
      { itemName: 'MiniBon', description: 'Miniature cinnamon rolls', category: 'dessert' },
      { itemName: 'BonBites', description: 'Bite-sized cinnamon roll pieces', category: 'dessert' },
      { itemName: 'Cold Brew', description: 'Cold brew coffee', category: 'beverage' },
    ]
  },
  'Starbucks': {
    items: [
      { itemName: 'Coffee', description: 'Brewed coffee', category: 'beverage' },
      { itemName: 'Latte', description: 'Espresso with steamed milk', category: 'beverage' },
      { itemName: 'Frappuccino', description: 'Blended iced coffee drink', category: 'beverage' },
      { itemName: 'Iced Tea', description: 'Iced tea', category: 'beverage' },
      { itemName: 'Pastry', description: 'Assorted bakery items', category: 'dessert' },
      { itemName: 'Breakfast Sandwich', description: 'Hot breakfast sandwich', category: 'entree' },
    ]
  },
  'Graeter\'s Ice Cream': {
    items: [
      { itemName: 'Ice Cream Scoop', description: 'Single scoop of Graeter\'s hand-crafted ice cream', category: 'dessert' },
      { itemName: 'Ice Cream Double Scoop', description: 'Double scoop of Graeter\'s ice cream', category: 'dessert' },
      { itemName: 'Ice Cream Sundae', description: 'Ice cream sundae with toppings', category: 'dessert' },
      { itemName: 'Milkshake', description: 'Hand-spun milkshake', category: 'beverage' },
    ]
  },
  'Dippin\' Dots\u00ae': {
    items: [
      { itemName: 'Dippin\' Dots Cup', description: 'Flash-frozen ice cream beads in a cup', category: 'dessert' },
      { itemName: 'Dippin\' Dots Sundae', description: 'Dippin\' Dots with toppings', category: 'dessert' },
    ]
  },
  'Rivertown Funnel Cakes': {
    items: [
      { itemName: 'Classic Funnel Cake', description: 'Traditional funnel cake with powdered sugar', category: 'dessert' },
      { itemName: 'Chocolate Funnel Cake', description: 'Funnel cake with chocolate drizzle', category: 'dessert' },
      { itemName: 'Strawberry Funnel Cake', description: 'Funnel cake with strawberry topping', category: 'dessert' },
    ]
  },
  'World\'s Greatest Funnel Cakes': {
    items: [
      { itemName: 'Classic Funnel Cake', description: 'Traditional funnel cake with powdered sugar', category: 'dessert' },
      { itemName: 'Loaded Funnel Cake', description: 'Funnel cake with premium toppings', category: 'dessert' },
    ]
  },
  'Ralph\'s Ice Cream': {
    items: [
      { itemName: 'Soft Serve Cone', description: 'Soft serve ice cream cone', category: 'dessert' },
      { itemName: 'Soft Serve Cup', description: 'Soft serve ice cream in a cup', category: 'dessert' },
      { itemName: 'Sundae', description: 'Soft serve sundae with toppings', category: 'dessert' },
    ]
  },
  'Planet Snoopy Ice Cream': {
    items: [
      { itemName: 'Ice Cream Cone', description: 'Ice cream cone', category: 'dessert' },
      { itemName: 'Ice Cream Cup', description: 'Ice cream in a cup', category: 'dessert' },
    ]
  },
  'Ice Scream Zone': {
    items: [
      { itemName: 'Ice Cream Cone', description: 'Hand-scooped ice cream cone', category: 'dessert' },
      { itemName: 'Ice Cream Sundae', description: 'Ice cream sundae', category: 'dessert' },
      { itemName: 'Milkshake', description: 'Hand-spun milkshake', category: 'beverage' },
    ]
  },
  'Snoopy Snow Cone': {
    items: [
      { itemName: 'Snow Cone', description: 'Flavored shaved ice snow cone', category: 'snack' },
    ]
  },
  'International Street Treats': {
    items: [
      { itemName: 'Cotton Candy', description: 'Fresh spun cotton candy', category: 'snack' },
      { itemName: 'Popcorn', description: 'Freshly popped popcorn', category: 'snack' },
      { itemName: 'Fountain Drink', description: 'Fountain beverage', category: 'beverage' },
    ]
  },
  'Coney Treats': {
    items: [
      { itemName: 'Popcorn', description: 'Fresh popcorn', category: 'snack' },
      { itemName: 'Cotton Candy', description: 'Cotton candy', category: 'snack' },
      { itemName: 'ICEE', description: 'Frozen ICEE drink', category: 'beverage' },
      { itemName: 'Fountain Drink', description: 'Fountain beverage', category: 'beverage' },
    ]
  },
  'Snoopy Treats': {
    items: [
      { itemName: 'Popcorn', description: 'Freshly popped popcorn', category: 'snack' },
      { itemName: 'Cotton Candy', description: 'Cotton candy', category: 'snack' },
      { itemName: 'ICEE', description: 'Frozen ICEE drink', category: 'beverage' },
    ]
  },
  'Meteor Canteen': {
    items: [
      { itemName: 'Popcorn', description: 'Fresh popcorn', category: 'snack' },
      { itemName: 'Fountain Drink', description: 'Fountain beverage', category: 'beverage' },
      { itemName: 'ICEE', description: 'Frozen ICEE drink', category: 'beverage' },
    ]
  },
  'Twisted River Treats': {
    items: [
      { itemName: 'Popcorn', description: 'Freshly popped popcorn', category: 'snack' },
      { itemName: 'Fountain Drink', description: 'Fountain beverage', category: 'beverage' },
    ]
  },
  'Calypso Coolers': {
    items: [
      { itemName: 'Fruit Smoothie', description: 'Refreshing fruit smoothie', category: 'beverage' },
      { itemName: 'Popcorn', description: 'Freshly popped popcorn', category: 'snack' },
      { itemName: 'Fountain Drink', description: 'Fountain beverage', category: 'beverage' },
    ]
  },
  'Sand Bar': {
    items: [
      { itemName: 'Beer', description: 'Draft beer', category: 'beverage' },
      { itemName: 'Cocktail', description: 'Mixed cocktail', category: 'beverage' },
      { itemName: 'Fountain Drink', description: 'Fountain beverage', category: 'beverage' },
    ]
  },
  '21\u00b0 and Colder': {
    items: [
      { itemName: 'Frozen Cocktail', description: 'Frozen alcoholic cocktail', category: 'beverage' },
      { itemName: 'Frozen Mocktail', description: 'Frozen non-alcoholic beverage', category: 'beverage' },
    ]
  },
  'Outpost Frozen Cocktails': {
    items: [
      { itemName: 'Frozen Cocktail', description: 'Frozen alcoholic cocktail', category: 'beverage' },
      { itemName: 'Frozen Margarita', description: 'Frozen margarita', category: 'beverage' },
    ]
  },
  'Coca-Cola\u00ae Freestyles, Marketplaces & Refill Stations': {
    items: [
      { itemName: 'Fountain Drink', description: 'Choice of over 100 Coca-Cola beverages', category: 'beverage' },
      { itemName: 'Coffee', description: 'Hot coffee', category: 'beverage' },
      { itemName: 'Snack Items', description: 'Assorted packaged snacks', category: 'snack' },
    ]
  },
}

interface AlgoliaRestaurant {
  parkId: number
  parkName: string
  name: string
  description: string
  poiType: string
  fimsId: string
  url: string
  parkLocation: string
  foodTypes: string[]
  dietaryOptions: string[]
  seatingTypes: string[]
  isMobileOrderEligible: boolean
  isAcceptDiningPlan: boolean
  displayName: string
}

/**
 * Intercept Algolia API credentials from the initial page load
 */
async function getAlgoliaCredentials(browser: puppeteer.Browser): Promise<{
  appId: string
  apiKey: string
  indexName: string
  filters: string
}> {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  let appId = ''
  let apiKey = ''
  let indexName = ''
  let filters = ''

  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('algolia')) {
      const urlObj = new URL(url)
      appId = urlObj.searchParams.get('x-algolia-application-id') || appId
      apiKey = urlObj.searchParams.get('x-algolia-api-key') || apiKey

      const body = req.postData()
      if (body) {
        try {
          const parsed = JSON.parse(body)
          if (parsed.requests?.[0]) {
            indexName = parsed.requests[0].indexName || indexName
            filters = parsed.requests[0].filters || filters
          }
        } catch {}
      }
    }
  })

  await page.goto(DINING_URL, { waitUntil: 'networkidle2', timeout: 45000 })
  await delay(3000)
  await page.close()

  return { appId, apiKey, indexName, filters }
}

/**
 * Fetch all restaurants from Algolia API
 */
async function fetchAllRestaurants(creds: {
  appId: string
  apiKey: string
  indexName: string
  filters: string
}): Promise<AlgoliaRestaurant[]> {
  const url = `https://${creds.appId}-dsn.algolia.net/1/indexes/*/queries?x-algolia-application-id=${creds.appId}&x-algolia-api-key=${creds.apiKey}`

  const body = {
    requests: [{
      indexName: creds.indexName,
      query: '',
      hitsPerPage: 100,
      filters: creds.filters,
      page: 0,
      facets: ['parkLocation', 'diningPlans', 'dietaryOptions', 'isMobileOrderEligible', 'isAcceptDiningPlan', 'seatingTypes'],
      maxValuesPerFacet: 100,
    }]
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json = await resp.json() as any
  const hits: AlgoliaRestaurant[] = []

  if (json.results) {
    for (const result of json.results) {
      if (result.hits) {
        hits.push(...result.hits)
      }
    }
  }

  return hits
}

/**
 * Scrape a restaurant detail page for its full description
 */
async function scrapeRestaurantDetail(
  page: puppeteer.Page,
  slug: string
): Promise<{ description: string; headings: string[] }> {
  const url = `${BASE_URL}/dining/${slug}`

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    } catch {
      return { description: '', headings: [] }
    }
  }

  await delay(2000)

  const data = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body
    // Get all paragraph text from the main content area
    const paragraphs: string[] = []
    main.querySelectorAll('p').forEach(p => {
      const text = p.textContent?.trim()
      if (text && text.length > 10 && text.length < 500) {
        paragraphs.push(text)
      }
    })

    const headings: string[] = []
    main.querySelectorAll('h1, h2, h3').forEach(h => {
      const text = h.textContent?.trim()
      if (text) headings.push(text)
    })

    return {
      description: paragraphs.join(' '),
      headings,
    }
  })

  return data
}

/**
 * Build menu items for a restaurant from known menus and description parsing
 */
function buildMenuItems(
  restaurant: AlgoliaRestaurant,
  detailDescription: string
): ScrapedRestaurant['items'] {
  // Check if we have known menu items
  const known = KNOWN_MENUS[restaurant.name]
  if (known) {
    return known.items.map(item => ({
      itemName: item.itemName,
      description: item.description,
      price: item.price,
      category: (item.category as any) || inferCategory(item.itemName),
    }))
  }

  // For unknown restaurants, parse the description to infer items
  const items: ScrapedRestaurant['items'] = []
  const desc = (restaurant.description + ' ' + detailDescription).toLowerCase()

  // Food term to item mapping
  const foodPatterns: { pattern: RegExp; itemName: string; description: string; category: string }[] = [
    { pattern: /burger/, itemName: 'Burger', description: 'Char-grilled burger', category: 'entree' },
    { pattern: /cheeseburger/, itemName: 'Cheeseburger', description: 'Char-grilled cheeseburger', category: 'entree' },
    { pattern: /pizza/, itemName: 'Pizza', description: 'Pizza', category: 'entree' },
    { pattern: /chicken tender/, itemName: 'Chicken Tenders', description: 'Chicken tenders', category: 'entree' },
    { pattern: /chicken sandwich/, itemName: 'Chicken Sandwich', description: 'Chicken sandwich', category: 'entree' },
    { pattern: /hot dog/, itemName: 'Hot Dog', description: 'Hot dog', category: 'entree' },
    { pattern: /nachos/, itemName: 'Nachos', description: 'Loaded nachos', category: 'entree' },
    { pattern: /taco/, itemName: 'Tacos', description: 'Tacos', category: 'entree' },
    { pattern: /burrito/, itemName: 'Burrito', description: 'Burrito', category: 'entree' },
    { pattern: /wrap/, itemName: 'Wrap', description: 'Wrap', category: 'entree' },
    { pattern: /salad/, itemName: 'Salad', description: 'Fresh salad', category: 'side' },
    { pattern: /fries|french fries/, itemName: 'French Fries', description: 'French fries', category: 'side' },
    { pattern: /mac\s*(and|&|'n'?)\s*cheese/, itemName: 'Mac and Cheese', description: 'Mac and cheese', category: 'side' },
    { pattern: /funnel cake/, itemName: 'Funnel Cake', description: 'Funnel cake', category: 'dessert' },
    { pattern: /ice cream/, itemName: 'Ice Cream', description: 'Ice cream', category: 'dessert' },
    { pattern: /churro/, itemName: 'Churros', description: 'Churros', category: 'snack' },
    { pattern: /pretzel/, itemName: 'Pretzel', description: 'Soft pretzel', category: 'snack' },
    { pattern: /popcorn/, itemName: 'Popcorn', description: 'Freshly popped popcorn', category: 'snack' },
    { pattern: /cotton candy/, itemName: 'Cotton Candy', description: 'Cotton candy', category: 'snack' },
    { pattern: /corn dog/, itemName: 'Corn Dog', description: 'Corn dog', category: 'snack' },
    { pattern: /smoothie/, itemName: 'Smoothie', description: 'Fruit smoothie', category: 'beverage' },
    { pattern: /lemonade/, itemName: 'Lemonade', description: 'Fresh lemonade', category: 'beverage' },
    { pattern: /beer|brew/, itemName: 'Beer', description: 'Draft beer', category: 'beverage' },
    { pattern: /cocktail|margarita/, itemName: 'Cocktail', description: 'Mixed cocktail', category: 'beverage' },
    { pattern: /coffee/, itemName: 'Coffee', description: 'Coffee', category: 'beverage' },
    { pattern: /\bsoda\b|fountain (drink|beverage)/, itemName: 'Fountain Drink', description: 'Fountain beverage', category: 'beverage' },
  ]

  const seen = new Set<string>()
  for (const { pattern, itemName, description: itemDesc, category } of foodPatterns) {
    if (pattern.test(desc) && !seen.has(itemName)) {
      seen.add(itemName)
      items.push({
        itemName,
        description: itemDesc,
        category: category as any,
      })
    }
  }

  return items
}

/**
 * Main scraper function
 */
export async function scrapeKingsIsland(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    source: 'official',
    scrapedAt: new Date(),
    restaurants: [],
    errors: [],
  }

  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  })

  try {
    // Step 1: Get Algolia credentials
    console.log('Step 1: Intercepting Algolia API credentials...')
    const creds = await getAlgoliaCredentials(browser)
    console.log(`  App ID: ${creds.appId}`)
    console.log(`  Index: ${creds.indexName}`)

    if (!creds.appId || !creds.apiKey) {
      result.errors.push('Failed to intercept Algolia API credentials')
      return result
    }

    // Step 2: Fetch all restaurants from Algolia
    console.log('\nStep 2: Fetching all restaurants from Algolia...')
    const allRestaurants = await fetchAllRestaurants(creds)
    console.log(`  Found ${allRestaurants.length} restaurants`)

    // Filter to only regular restaurants (exclude seasonal-only WinterFest items without URLs)
    const regularRestaurants = allRestaurants.filter(r =>
      r.poiType === 'restaurant' && r.url
    )
    const seasonalRestaurants = allRestaurants.filter(r =>
      r.poiType !== 'restaurant' || !r.url
    )
    console.log(`  Regular: ${regularRestaurants.length}, Seasonal/event: ${seasonalRestaurants.length}`)

    // Step 3: Scrape each restaurant detail page
    console.log('\nStep 3: Scraping restaurant detail pages...')
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    for (const restaurant of regularRestaurants) {
      try {
        console.log(`  ${restaurant.name}...`)
        await delay(2000) // Rate limit

        const detail = await scrapeRestaurantDetail(page, restaurant.url)
        const items = buildMenuItems(restaurant, detail.description)

        if (items.length > 0) {
          // Determine area/land from parkLocation
          const landName = restaurant.parkLocation !== 'Kings Island'
            ? restaurant.parkLocation
            : undefined

          // Infer cuisine type from food types and description
          let cuisineType: string | undefined
          if (restaurant.foodTypes.includes('Meals')) {
            cuisineType = 'Quick Service'
          } else if (restaurant.foodTypes.includes('Snacks')) {
            cuisineType = 'Snack Stand'
          }

          result.restaurants.push({
            source: 'official',
            parkName: PARK_NAME,
            restaurantName: restaurant.displayName || restaurant.name,
            landName,
            cuisineType,
            items,
            scrapedAt: new Date(),
          })
          console.log(`    ${items.length} items`)
        } else {
          console.log(`    No items found`)
        }
      } catch (err) {
        const msg = `Error scraping ${restaurant.name}: ${err}`
        console.error(`    ${msg}`)
        result.errors.push(msg)
      }
    }

    // Also add seasonal restaurants with known menus
    for (const restaurant of seasonalRestaurants) {
      const known = KNOWN_MENUS[restaurant.name]
      if (known) {
        result.restaurants.push({
          source: 'official',
          parkName: PARK_NAME,
          restaurantName: restaurant.displayName || restaurant.name,
          landName: 'Seasonal',
          cuisineType: 'Seasonal',
          items: known.items.map(item => ({
            itemName: item.itemName,
            description: item.description,
            price: item.price,
            category: (item.category as any) || inferCategory(item.itemName),
          })),
          scrapedAt: new Date(),
        })
      }
    }

    await page.close()
  } finally {
    await browser.close()
  }

  return result
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  scrapeKingsIsland()
    .then(result => {
      const outputDir = resolve(__dirname, '../../data/scraped')
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const outputPath = resolve(outputDir, `kings-island-${timestamp}.json`)
      writeFileSync(outputPath, JSON.stringify(result, null, 2))

      const totalItems = result.restaurants.reduce((sum, r) => sum + r.items.length, 0)

      console.log('')
      console.log('=== Kings Island Scrape Complete ===')
      console.log(`Restaurants: ${result.restaurants.length}`)
      console.log(`Total items: ${totalItems}`)
      console.log(`Errors: ${result.errors.length}`)
      console.log(`Output: ${outputPath}`)

      // Summary table
      console.log('\nRestaurant Summary:')
      console.log('-'.repeat(70))
      result.restaurants.forEach(r => {
        const categories = [...new Set(r.items.map(i => i.category || 'unknown'))]
        console.log(`  ${r.restaurantName.padEnd(45)} ${String(r.items.length).padStart(3)} items  [${categories.join(', ')}]`)
      })
    })
    .catch(console.error)
}
