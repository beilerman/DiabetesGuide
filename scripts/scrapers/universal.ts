import * as cheerio from 'cheerio'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ScrapeResult, ScrapedRestaurant, ScrapedItem } from './types.js'
import { inferCategory, delay } from './utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Universal Orlando menu URLs organized by restaurant
const RESTAURANT_MENUS: Record<string, { park: string; urls: string[] }> = {
  'Antojitos Authentic Mexican Food': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/antojitos-authentic-mexican-food/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/antojitos-authentic-mexican-food/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/antojitos-authentic-mexican-food/dessert-menu.html',
    ],
  },
  'Backwater Bar': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/backwater-bar/drink-menu.html',
    ],
  },
  'Bambu': {
    park: 'Universal Volcano Bay',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bambu/menu.html',
    ],
  },
  'Bend the Bao': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bend-the-bao/all-day-menu.html',
    ],
  },
  'Bigfire': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bigfire/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bigfire/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bigfire/desserts-menu.html',
    ],
  },
  "Blondie's": {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/blondies/menu.html',
    ],
  },
  'Bob Marley - A Tribute to Freedom': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bob-marley-a-tribute-to-freedom/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bob-marley-a-tribute-to-freedom/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bob-marley-a-tribute-to-freedom/dessert-menu.html',
    ],
  },
  'Bread Box Handcrafted Sandwiches': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bread-box-handcrafted-sandwiches/all-day-menu.html',
    ],
  },
  "Bumblebee Man's Taco Truck": {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bumblebee-mans-taco-truck/menu.html',
    ],
  },
  'Cafe 4': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/cafe-4/menu.html',
    ],
  },
  'Cafe La Bamba': {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/cafe-la-bamba/lunch-menu.html',
    ],
  },
  'Captain America Diner': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/captain-america-diner/menu.html',
    ],
  },
  'Chill Ice Cream': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/chill-ice-cream/menu.html',
    ],
  },
  'Cinnabon': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/cinnabon-ioa/menu.html',
    ],
  },
  'Circus McGurkus Cafe Stoo-pendous': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/circus-mcgurkus-cafe-stoo-pendous/menu.html',
    ],
  },
  'Cold Stone Creamery': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/cold-stone-creamery/menu.html',
    ],
  },
  'Comic Strip Cafe': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/comic-strip-cafe/menu.html',
    ],
  },
  'Confisco Grille': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/confisco-grille/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/confisco-grille/kids_menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/confisco-grille/dessert_menu.html',
    ],
  },
  'Croissant Moon Bakery': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/croissant-moon-bakery/menu.html',
    ],
  },
  "Doc Sugrue's Desert Kebab House": {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/doc-sugrues-desert-kebab-house/menu.html',
    ],
  },
  "Finnegan's Bar & Grill": {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/finnegans-bar-grill/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/finnegans-bar-grill/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/finnegans-bar-grill/dessert-menu.html',
    ],
  },
  "Fire Eater's Grill": {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/fire-eaters-grill/menu.html',
    ],
  },
  "Flaming Moe's": {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/flaming-moes/menu.html',
    ],
  },
  "Florean Fortescue's Ice-Cream Parlour": {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/florean-fortescues-ice-cream-parlour/menu.html',
    ],
  },
  'Green Eggs and Ham Cafe': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/green-eggs-and-ham-cafe/menu.html',
    ],
  },
  'Haagen-Dazs': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining//haagen-dazs/menu.html',
    ],
  },
  'Hop on Pop Ice Cream Shop': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/hop-on-pop-ice-cream-shop/menu.html',
    ],
  },
  'Hot Dog Hall of Fame': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/hot-dog-hall-of-fame/all-day-menu.html',
    ],
  },
  'KidZone Pizza Company': {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/kidzone-pizza-company/menu.html',
    ],
  },
  'Krusty Burger': {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/krusty-burger/menu.html',
    ],
  },
  'Leaky Cauldron': {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/leaky-cauldron/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/leaky-cauldron/breakfast-menu.html',
    ],
  },
  "Lombard's Seafood Grille": {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/lombards-seafood-grille/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/lombards-seafood-grille/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/lombards-seafood-grille/dessert-menu.html',
    ],
  },
  'Lone Palm Airport': {
    park: 'Universal Volcano Bay',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining//lone-palm-airport/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining//lone-palm-airport/kids_menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining//lone-palm-airport/dessert-menu.html',
    ],
  },
  "Louie's Italian Restaurant": {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/louies-italian-restaurant/menu.html',
    ],
  },
  "Luigi's Pizza": {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/luigis-pizza/menu.html',
    ],
  },
  "Mel's Drive-In": {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/mels-drive-in/menu.html',
    ],
  },
  "Moe's Southwest Grill": {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining//moes-southwest-grill/menu.html',
    ],
  },
  'Moose Juice, Goose Juice': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/moose-juice-goose-juice/menu.html',
    ],
  },
  'Mythos Restaurant': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/mythos-restaurant/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/mythos-restaurant/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/mythos-restaurant/dessert-menu.html',
    ],
  },
  'NBC Sports Grill & Brew': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/nbc-sports-grill-brew/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/nbc-sports-grill-brew/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/nbc-sports-grill-brew/dessert-menu.html',
    ],
  },
  "Pat O'Brien's": {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/pat-o-briens/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/pat-o-briens/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/pat-o-briens/dessert-menu.html',
    ],
  },
  'Pizza Predattoria': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/pizza-predattoria/menu.html',
    ],
  },
  'Red Oven Pizza Bakery': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/red-oven-pizza-bakery/all-day-menu.html',
    ],
  },
  "Richter's Burger Co.": {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/richters-burger-co/menu.html',
    ],
  },
  'San Francisco Pastry Company': {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/san-francisco-pastry-company/menu.html',
    ],
  },
  "Schwab's Pharmacy": {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/schwabs-pharmacy/menu.html',
    ],
  },
  'The Burger Digs': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/the-burger-digs/menu.html',
    ],
  },
  'The Cowfish': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining//the-cowfish/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining//the-cowfish/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining//the-cowfish/dessert-menu.html',
    ],
  },
  'The Fountain of Fair Fortune': {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/the-fountain-of-fair-fortune/menu-drink.html',
    ],
  },
  'The Frying Dutchman': {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/the-frying-dutchman/menu.html',
    ],
  },
  'The Hopping Pot': {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/the-hopping-pot/menu.html',
    ],
  },
  'The Watering Hole': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/the-watering-hole/Menu.html',
    ],
  },
  'Three Broomsticks': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/three-broomsticks/menu.html',
    ],
  },
  'Thunder Falls Terrace': {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/thunder-falls-terrace/menu.html',
    ],
  },
  'Today Cafe': {
    park: 'Universal Studios Florida',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/today-cafe/menu.html',
    ],
  },
  'Toothsome Chocolate Emporium': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/toothsome-chocolate-emporium-and-savory-feast-kitchen/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/toothsome-chocolate-emporium-and-savory-feast-kitchen/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/toothsome-chocolate-emporium-and-savory-feast-kitchen/milkshakes-desserts-menu.html',
    ],
  },
  'Vivo Italian Kitchen': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/vivo-italian-kitchen/menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/vivo-italian-kitchen/kids-menu.html',
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/vivo-italian-kitchen/dessert-menu.html',
    ],
  },
  'Voodoo Doughnut': {
    park: 'Universal CityWalk',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/voodoo-doughnut/menu.html',
    ],
  },
  'Whakawaiwai Eats': {
    park: 'Universal Volcano Bay',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/whakawaiwai-eats/menu.html',
    ],
  },
  "Wimpy's": {
    park: 'Islands of Adventure',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/wimpys/menu.html',
    ],
  },
  // Epic Universe restaurants
  "Cafe L'Air de la Sirene": {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/cafe-lair-de-la-sirene/menu.html',
    ],
  },
  'Das Stakehaus': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/das-stakehaus/menu.html',
    ],
  },
  'Le Gobelet Noir': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/le-gobelet-noir/menu.html',
    ],
  },
  'Bar Moonshine': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bar-moonshine/menu.html',
    ],
  },
  'Toadstool Cafe': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/toadstool-cafe/menu.html',
    ],
  },
  'The Bubbly Barrel': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/the-bubbly-barrel/menu.html',
    ],
  },
  "Yoshi's Snack Island": {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/yoshis-snack-island/menu.html',
    ],
  },
  'Turbo Boost Treats': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/turbo-boost-treats/menu.html',
    ],
  },
  "De Lacey's": {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/de-laceys/menu.html',
    ],
  },
  'Atlantic': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/atlantic/menu.html',
    ],
  },
  'The Plastered Owl': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/the-plastered-owl/menu.html',
    ],
  },
  'Star Sui Bao': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/star-sui-bao/menu.html',
    ],
  },
  'Comet Dogs': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/comet-dogs/menu.html',
    ],
  },
  'Celestiki': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/celestiki/menu.html',
    ],
  },
  'Bar Zenith': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/bar-zenith/menu.html',
    ],
  },
  'Mead Hall': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/mead-hall/menu.html',
    ],
  },
  'Spit Fyre Grill': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/spit-fyre-grill/menu.html',
    ],
  },
  "Hooligan's Grog and Gruel": {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/hooligans-grog-and-gruel/menu.html',
    ],
  },
  'The Burning Blade Tavern': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/the-burning-blade-tavern/menu.html',
    ],
  },
  'The Oak and Star Tavern': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/the-oak-and-star-tavern/menu.html',
    ],
  },
  'Pizza Moon': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/pizza-moon/menu.html',
    ],
  },
  'Meteor Astropub': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/meteor-astropub/menu.html',
    ],
  },
  'Frosty Moon': {
    park: 'Universal Epic Universe',
    urls: [
      'https://www.universalorlando.com/webdata/k2/en/us/things-to-do/dining/frosty-moon/menu.html',
    ],
  },
}

/**
 * Fetch page content - handles both JSON and HTML
 */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`)
  }
  return response.text()
}

/**
 * Parse Universal menu JSON to extract items
 * Supports two formats:
 * 1. Epic Universe (GDS Menu Page Template): sections.EmbeddedValues[].items.EmbeddedValues[] with heading/description
 * 2. Older parks (K2 Restaurant Menu): ComponentPresentations[].Component.Fields.MenuDetails.EmbeddedValues[].DishDetails.EmbeddedValues[] with Title/Description/Price
 */
function parseMenuJson(content: string): ScrapedItem[] {
  const items: ScrapedItem[] = []

  try {
    const data = JSON.parse(content)

    // Helper to get value from CMS field
    const getValue = (field: unknown): string | undefined => {
      if (!field || typeof field !== 'object') return undefined
      const f = field as Record<string, unknown>
      if (f.Values && Array.isArray(f.Values) && f.Values.length > 0) {
        return f.Values[0] as string
      }
      return undefined
    }

    // Format 1: Epic Universe (GDS Menu Page Template)
    // Path: sections.EmbeddedValues[].items.EmbeddedValues[]
    function extractEpicUniverseItems(obj: unknown): void {
      if (!obj) return
      if (Array.isArray(obj)) {
        obj.forEach(extractEpicUniverseItems)
        return
      }
      if (typeof obj === 'object' && obj !== null) {
        const record = obj as Record<string, unknown>

        // Look for sections with EmbeddedValues containing items
        if (record.sections && typeof record.sections === 'object') {
          const sections = record.sections as Record<string, unknown>
          if (sections.EmbeddedValues && Array.isArray(sections.EmbeddedValues)) {
            for (const section of sections.EmbeddedValues) {
              const s = section as Record<string, unknown>
              if (s.items && typeof s.items === 'object') {
                const itemsObj = s.items as Record<string, unknown>
                if (itemsObj.EmbeddedValues && Array.isArray(itemsObj.EmbeddedValues)) {
                  for (const item of itemsObj.EmbeddedValues) {
                    const i = item as Record<string, unknown>
                    const name = getValue(i.heading)
                    const desc = getValue(i.description)

                    if (name && !name.toLowerCase().includes('allergen note')) {
                      items.push({
                        itemName: name,
                        description: desc || undefined,
                        category: inferCategory(name),
                      })
                    }
                  }
                }
              }
            }
          }
        }

        for (const v of Object.values(record)) {
          extractEpicUniverseItems(v)
        }
      }
    }

    // Format 2: Older parks (K2 Restaurant Menu)
    // Path: ComponentPresentations[].Component.Fields.MenuDetails.EmbeddedValues[].DishDetails.EmbeddedValues[]
    function extractK2Items(presentations: unknown[]): void {
      for (const p of presentations) {
        const pres = p as Record<string, unknown>
        const component = pres.Component as Record<string, unknown> | undefined
        if (!component) continue

        const schema = (component.Schema as Record<string, unknown>)?.Title
        if (schema !== 'K2 Restaurant Menu') continue

        const fields = component.Fields as Record<string, unknown> | undefined
        const menuDetails = fields?.MenuDetails as Record<string, unknown> | undefined
        if (!menuDetails?.EmbeddedValues) continue

        const sections = menuDetails.EmbeddedValues as Array<Record<string, unknown>>
        for (const section of sections) {
          const dishDetails = section.DishDetails as Record<string, unknown> | undefined
          if (!dishDetails?.EmbeddedValues) continue

          const dishes = dishDetails.EmbeddedValues as Array<Record<string, unknown>>
          for (const dish of dishes) {
            const name = getValue(dish.Title)
            const desc = getValue(dish.Description) || getValue(dish.ShortDescription)
            const priceStr = getValue(dish.Price)
            const price = priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, '')) : undefined

            if (name && !name.toLowerCase().includes('allergen note')) {
              // Clean up description (remove HTML entities and tags)
              let cleanDesc = desc
              if (cleanDesc) {
                cleanDesc = cleanDesc.replace(/&amp;/g, '&')
                cleanDesc = cleanDesc.replace(/<[^>]*>/g, '')
                cleanDesc = cleanDesc.trim()
              }

              items.push({
                itemName: name,
                description: cleanDesc || undefined,
                price: isNaN(price!) ? undefined : price,
                category: inferCategory(name),
              })
            }
          }
        }
      }
    }

    // Try Epic Universe format first (recursively search for sections)
    extractEpicUniverseItems(data)

    // If no items found, try K2 format
    if (items.length === 0 && data.ComponentPresentations) {
      extractK2Items(data.ComponentPresentations)
    }
  } catch {
    // Not JSON, try HTML parsing
    return parseMenuHtml(content)
  }

  // Deduplicate by name
  const seen = new Set<string>()
  return items.filter(item => {
    const key = item.itemName.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Fallback: Parse Universal menu page HTML to extract items
 */
function parseMenuHtml(html: string): ScrapedItem[] {
  const $ = cheerio.load(html)
  const items: ScrapedItem[] = []

  // Universal uses consistent menu card structure
  // Look for menu items with name, description, price
  $('.menu-item, .menu-card, [class*="menu-item"]').each((_, el) => {
    const $el = $(el)

    // Try various selectors for item name
    const nameEl = $el.find('.item-name, .menu-item-name, h3, h4, .title').first()
    const name = nameEl.text().trim()

    // Try various selectors for description
    const descEl = $el.find('.item-description, .menu-item-description, .description, p').first()
    const description = descEl.text().trim()

    // Try various selectors for price
    const priceEl = $el.find('.item-price, .menu-item-price, .price').first()
    const priceText = priceEl.text().trim()
    const priceMatch = priceText.match(/\$?([\d.]+)/)
    const price = priceMatch ? parseFloat(priceMatch[1]) : undefined

    if (name && name.length > 2) {
      items.push({
        itemName: name,
        description: description || undefined,
        price,
        category: inferCategory(name),
      })
    }
  })

  // If no structured menu items found, try parsing tables
  if (items.length === 0) {
    $('table tr, .menu-row').each((_, row) => {
      const $row = $(row)
      const cells = $row.find('td')

      if (cells.length >= 1) {
        const name = $(cells[0]).text().trim()
        const description = cells.length >= 2 ? $(cells[1]).text().trim() : undefined
        const priceText = cells.length >= 2 ? $(cells[cells.length - 1]).text().trim() : ''
        const priceMatch = priceText.match(/\$?([\d.]+)/)
        const price = priceMatch ? parseFloat(priceMatch[1]) : undefined

        if (name && name.length > 2 && !name.toLowerCase().includes('price')) {
          items.push({
            itemName: name,
            description: description || undefined,
            price,
            category: inferCategory(name),
          })
        }
      }
    })
  }

  // Deduplicate by name
  const seen = new Set<string>()
  return items.filter(item => {
    const key = item.itemName.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Scrape a single restaurant's menus
 */
async function scrapeRestaurant(
  name: string,
  park: string,
  urls: string[]
): Promise<ScrapedRestaurant | null> {
  const allItems: ScrapedItem[] = []
  const seenItems = new Set<string>()

  for (const url of urls) {
    try {
      await delay(300) // Rate limit
      const content = await fetchPage(url)
      const items = parseMenuJson(content)

      // Deduplicate across menu pages
      for (const item of items) {
        const key = item.itemName.toLowerCase()
        if (!seenItems.has(key)) {
          seenItems.add(key)
          allItems.push(item)
        }
      }
    } catch (err) {
      console.error(`    Error fetching ${url}:`, err)
    }
  }

  if (allItems.length === 0) {
    return null
  }

  return {
    source: 'universal',
    parkName: park,
    restaurantName: name,
    items: allItems,
    scrapedAt: new Date(),
  }
}

/**
 * Main scraper function
 */
export async function scrapeUniversal(): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    source: 'universal',
    scrapedAt: new Date(),
    restaurants: [],
    errors: [],
  }

  const restaurantNames = Object.keys(RESTAURANT_MENUS)
  console.log(`Scraping ${restaurantNames.length} Universal restaurants...`)

  for (const name of restaurantNames) {
    const { park, urls } = RESTAURANT_MENUS[name]
    console.log(`  ${name} (${park})...`)

    try {
      const restaurant = await scrapeRestaurant(name, park, urls)
      if (restaurant) {
        result.restaurants.push(restaurant)
        console.log(`    ${restaurant.items.length} items`)
      } else {
        console.log(`    No items found`)
      }
    } catch (err) {
      const msg = `Error scraping ${name}: ${err}`
      console.error(`    ${msg}`)
      result.errors.push(msg)
    }
  }

  return result
}

// CLI entry point
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  scrapeUniversal()
    .then(result => {
      const outputDir = resolve(__dirname, '../../data/scraped')
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().slice(0, 10)
      const outputPath = resolve(outputDir, `universal-${timestamp}.json`)
      writeFileSync(outputPath, JSON.stringify(result, null, 2))

      console.log('')
      console.log('=== Scrape Complete ===')
      console.log(`Restaurants: ${result.restaurants.length}`)
      console.log(`Total items: ${result.restaurants.reduce((sum, r) => sum + r.items.length, 0)}`)
      console.log(`Errors: ${result.errors.length}`)
      console.log(`Output: ${outputPath}`)
    })
    .catch(console.error)
}
