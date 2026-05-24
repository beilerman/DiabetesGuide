# Resort-First Home Design

## Goal

Make the initial page a destination hub organized by resort instead of a flat park grid.

## Recommended Approach

Use the existing resort configuration as the Home page source of truth. The Home page should show the compact DiabetesGuide hero, the existing quick actions, then a "Choose a Destination" section grouped by resort: Walt Disney World, Disneyland Resort, Universal Orlando Resort, Disney Cruise Line, SeaWorld Parks, Aulani, Dollywood, Kings Island, and an Other Destinations fallback when unmatched data exists.

Each resort section should expose category links, such as Theme Parks, Water Parks, Resort Hotels, Disney Springs, Downtown Disney, CityWalk, or Ships. Category links go to the existing `/resort/:resortId/:categoryId` route. The resort heading links to `/resort/:resortId`.

## Data Flow

Home continues to use `useParks()` and `useMenuItemCounts()`. A pure helper groups parks by `findResortForPark()` and `findCategoryForPark()`, sums item counts, hides empty categories when counts are available, and preserves the configured resort/category order.

## UI

The resort blocks are lightweight sections, not nested card containers. Each section has a heading row with resort name, location, location count, item count, and a compact "Browse all" action. Category links render as small repeated items with icon, label, location count, item count, and a short venue preview.

## Testing

Add a pure helper test for resort ordering, category grouping, count aggregation, empty category filtering, and Other Destinations fallback. Use browser smoke for `/` to verify the first page shows destination grouping, no longer says "Choose a Park", and links navigate to the resort/category pages.
