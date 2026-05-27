export interface RestaurantCountSource {
  id: string
  park_id: string | null
}

export interface MenuItemCountSource {
  restaurant_id: string | null
}

export function countMenuItemsByPark(
  restaurants: RestaurantCountSource[],
  items: MenuItemCountSource[],
): Map<string, number> {
  const restaurantToPark = new Map<string, string>()
  const counts = new Map<string, number>()

  for (const restaurant of restaurants) {
    if (!restaurant.park_id) continue
    restaurantToPark.set(restaurant.id, restaurant.park_id)
    if (!counts.has(restaurant.park_id)) counts.set(restaurant.park_id, 0)
  }

  for (const item of items) {
    if (!item.restaurant_id) continue
    const parkId = restaurantToPark.get(item.restaurant_id)
    if (!parkId) continue
    counts.set(parkId, (counts.get(parkId) ?? 0) + 1)
  }

  return counts
}
