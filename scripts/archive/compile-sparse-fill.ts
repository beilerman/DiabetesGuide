/**
 * Compile sparse restaurant research data into import JSON
 */
import { writeFileSync } from 'fs'

const menuItems: any[] = []

// Goofy's Candy Company (Marketplace) - 46 new items
const goofysItems = [
  // Caramel Bars
  { name: "Werther's Original Caramel Butter Bar", description: "Werther's Original Caramel layered into Buttery Shortbread", price: 5.79, category: "dessert" },
  { name: "Werther's Original Caramel Pecan Cluster", description: "Werther's Original Caramel layered with Roasted Salted Pecans and Milk Chocolate", price: 5.79, category: "dessert" },
  { name: "Werther's Original Caramel Strawberry Butter Bar", description: "Chopped Strawberries and Strawberry-flavored Werther's Original Caramel layered into Buttery Shortbread", price: 5.79, category: "dessert" },

  // Caramel & Candied Apples
  { name: "Mickey Apple Pie Caramel Apple", description: "Apple dipped in caramel with apple pie toppings", price: 14.49, category: "dessert" },
  { name: "Mickey Caramel Apple with M&M'S Milk Chocolate Minis", description: "Mickey-shaped apple with caramel and M&M's", price: 14.49, category: "dessert" },
  { name: "Pink Minnie Caramel Apple with M&M'S", description: "Pink-themed Minnie caramel apple with M&M's", price: 14.49, category: "dessert" },
  { name: "Classic Mickey Caramel Apple with M&M'S", description: "Classic Mickey-themed caramel apple with M&M's", price: 14.49, category: "dessert" },
  { name: "Classic Minnie Caramel Apple with M&M'S", description: "Classic Minnie-themed caramel apple with M&M's", price: 14.49, category: "dessert" },
  { name: "Winnie the Pooh Caramel Apple", description: "Winnie the Pooh-themed caramel apple", price: 14.49, category: "dessert" },
  { name: "Werther's Original Caramel Apple with Chopped Peanuts", description: "Caramel apple with chopped peanuts", price: 8.49, category: "dessert" },
  { name: "Cherry Candy Apple", description: "Apple with cherry candy coating", price: 7.99, category: "dessert" },
  { name: "Werther's Original Caramel Apple", description: "Classic caramel apple with Werther's caramel", price: 7.99, category: "dessert" },

  // Cookies  { name: "Large Mickey Chocolate Chip Cookie", description: "Oversized Mickey-shaped chocolate chip cookie", price: 7.29, category: "dessert" },
  { name: "Mickey Strawberry Cookie Sandwich with SKITTLES", description: "Strawberry cookie sandwich with SKITTLES", price: 7.99, category: "dessert" },
  { name: "Peanut Butter & Jelly Cookie Pie with M&M'S", description: "Cookie pie with PB&J and M&M's", price: 7.79, category: "dessert" },

  // Confections
  { name: "Dark Chocolatey Dipped Strawberries", description: "Fresh strawberries dipped in dark chocolate", price: 6.49, category: "dessert" },
  { name: "Milk Chocolatey Dipped Strawberries", description: "Fresh strawberries dipped in milk chocolate", price: 6.49, category: "dessert" },

  // Cotton Candy
  { name: "Blue Cotton Candy", description: "Blue-colored cotton candy", price: 5.49, category: "snack" },
  { name: "Pink Cotton Candy", description: "Pink-colored cotton candy", price: 5.49, category: "snack" },

  // Crisped Rice Cereal Treats
  { name: "Minnie Strawberry Cereal Treat with M&M'S", description: "Strawberry-flavored Minnie cereal treat with M&M's", price: 8.99, category: "dessert" },
  { name: "Classic Mickey Cereal Treat with M&M'S", description: "Classic Mickey cereal treat with M&M's", price: 7.99, category: "dessert" },
  { name: "Classic Minnie Cereal Treat with M&M'S", description: "Classic Minnie cereal treat with M&M's", price: 7.99, category: "dessert" },
  { name: "Mickey Cereal Treat with M&M'S Milk Chocolate Minis", description: "Mickey cereal treat with M&M's Minis", price: 7.99, category: "dessert" },
  { name: "S'Mores Cereal Treat Bar", description: "Cereal treat bar with s'mores flavoring", price: 7.99, category: "dessert" },

  // Cupcakes
  { name: "Mickey Valentine Vanilla Cupcake", description: "Valentine-themed Mickey vanilla cupcake", price: 5.99, category: "dessert" },
  { name: "Minnie Valentine Chocolate Cupcake", description: "Valentine-themed Minnie chocolate cupcake", price: 5.99, category: "dessert" },
  { name: "Goofy Vanilla Cupcake", description: "Goofy-themed vanilla cupcake", price: 5.99, category: "dessert" },

  // Fudge
  { name: "Chocolate Fudge", description: "Classic chocolate fudge", price: 5.79, category: "dessert" },
  { name: "Cookies and Cream Fudge", description: "Fudge with cookies and cream flavor", price: 5.79, category: "dessert" },
  { name: "Peanut Butter and Chocolate Fudge", description: "Fudge with peanut butter and chocolate", price: 5.79, category: "dessert" },

  // Marshmallow Treats
  { name: "Pink Minnie Marshmallow with M&M'S", description: "Pink Minnie-themed marshmallow treat with M&M's", price: 7.49, category: "dessert" },
  { name: "Banana S'more", description: "S'more with banana flavoring", price: 6.49, category: "dessert" },
  { name: "Peanut Butter & Jelly S'more", description: "S'more with PB&J flavor", price: 6.49, category: "dessert" },
  { name: "Winnie the Pooh Marshmallow Wand", description: "Winnie the Pooh-themed marshmallow wand", price: 6.49, category: "dessert" },
  { name: "Tigger Tail Marshmallow Wand", description: "Tigger-themed marshmallow wand", price: 6.49, category: "dessert" },

  // Beverages (14 items)
  { name: "Smartwater", description: "Premium bottled water", price: 6.25, category: "beverage" },
  { name: "POWERADE Fruit Punch", description: "Fruit punch sports drink", price: 5.50, category: "beverage" },
  { name: "POWERADE Lemon Lime", description: "Lemon lime sports drink", price: 5.50, category: "beverage" },
  { name: "POWERADE Mountain Berry Blue", description: "Mountain berry blue sports drink", price: 5.50, category: "beverage" },
  { name: "Vitaminwater power-c", description: "Vitamin-enhanced water", price: 5.50, category: "beverage" },
  { name: "Coca-Cola Cherry", description: "Cherry-flavored Coca-Cola", price: 5.50, category: "beverage" },
  { name: "Gold Peak Sweet Tea", description: "Bottled sweet tea", price: 5.50, category: "beverage" },
]

menuItems.push(...goofysItems.map(item => ({
  land: "Marketplace",
  restaurant: "Goofy's Candy Company",
  ...item
})))

// Candy Cauldron (The Landing) - 39 new items
const cauldronItems = [
  // Character Caramel Apples
  { name: "Not-So-Classic Mickey Caramel Apple", description: "Granny Smith Apple with Marshmallow Ears, Werther's Original Caramel, Dark Chocolatey Coating, Black Sanding Sugar, Milk Chocolate Candies", price: 13.99, category: "snack" },
  { name: "Not-So-Classic Minnie Caramel Apple", description: "Granny Smith Apple with Marshmallow Ears, Werther's Original Caramel, Milk Chocolatey Coating, Purple Sanding Sugar, Black Bow", price: 13.99, category: "snack" },
  { name: "Mickey Caramel Apple with Chocolate Candies", description: "Granny Smith Apple with Marshmallow Ears, Werther's Original Caramel, Milk Chocolatey Coating, M&M's Candies", price: 13.99, category: "snack" },
  { name: "Evil Queen Caramel Apple", description: "Granny Smith Apple, Werther's Original Caramel, Dark Chocolatey Coating, Fondant Face, Yellow Crown", price: 13.99, category: "snack" },
  { name: "Cauldron Caramel Apple", description: "Granny Smith Apple, Werther's Original Caramel, Green Chocolatey Coating, Marshmallows, Candies, Sprinkles", price: 13.99, category: "snack" },
  { name: "Caramel 'Poison' Apple", description: "Granny Smith Apple, Werther's Original Caramel, White Chocolatey Coating, White Chocolate Skull", price: 12.99, category: "snack" },
  { name: "Candy 'Poison' Apple", description: "Red Delicious Apple, Cherry Candy Coating, Green Chocolate Skull", price: 10.99, category: "snack" },

  // Caramel Treats
  { name: "Werther's Original Caramel Liquor Flight", description: "Four Werther's Original Caramel Mini Squares with Liqueur Flavors (Brandy, Irish Cream, Rum, Whiskey)", price: 7.99, category: "dessert" },
  { name: "Werther's Original Caramel Apple Butter Bar", description: "Werther's Original Caramel Apple Butter with Oats and Caramel", price: 5.79, category: "dessert" },

  // Cookies
  { name: "Mickey Mint Chocolate Chip Cookie Sandwich", description: "Two Chocolate Cookies with Mint Chocolate Chip Buttercream Frosting", price: 7.79, category: "dessert" },
  { name: "Large Mickey Pineapple Cookie", description: "Pineapple Cookie with Icing Design", price: 6.99, category: "dessert" },
  { name: "'Poison' Apple Cookie", description: "Sugar Cookie with Poison Apple Design", price: 6.99, category: "dessert" },
  { name: "Apple Pie Cookie", description: "Apple-flavored Cookie with Cinnamon Sugar", price: 5.49, category: "dessert" },
  { name: "Mickey Sugar Cookie", description: "Sugar Cookie with Pastel Coating and Sprinkles", price: 5.49, category: "dessert" },

  // Rice Cereal Treats
  { name: "Mickey Crisped Rice Cereal Treat", description: "Milk Chocolatey Coating, Graham Cracker Crumbs, Mini Marshmallows, Mickey Chocolate Chips", price: 7.99, category: "dessert" },
  { name: "Not-So-Classic Minnie Cereal Treat", description: "White Chocolatey Coating, Purple Sanding Sugar, M&M's, Black Chocolate Bow", price: 7.99, category: "dessert" },

  // Fudge
  { name: "Apple Pie Fudge Pie", description: "Mini Apple-flavored Fudge Pie with Apple Pieces and Cinnamon Sugar Topping in Graham Cracker Crust", price: 6.99, category: "dessert" },
  { name: "Peanut Butter Fudge Pie", description: "Peanut Butter Fudge in Graham Cracker Crust", price: 6.99, category: "dessert" },
  { name: "Chocolate Peanut Butter Fudge Pie", description: "Chocolate and Peanut Butter Swirled Fudge in Graham Cracker Crust", price: 6.99, category: "dessert" },

  // Frozen Glaciers
  { name: "Frozen Glacier (Non-Alcoholic)", description: "Frozen slush beverage (various flavors)", price: 5.99, category: "beverage" },
  { name: "Frozen Glacier (Alcoholic)", description: "Frozen slush with choice of Rum, Tequila, Vodka, Whiskey, or Cinnamon Whiskey", price: 13.50, category: "beverage" },

  // Beverages
  { name: "Coca-Cola Bottle", description: "Coca-Cola Bottle", price: 5.29, category: "beverage" },
  { name: "Coca-Cola Zero Sugar Bottle", description: "Coca-Cola Zero Sugar Bottle", price: 5.29, category: "beverage" },
  { name: "Diet Coke Bottle", description: "Diet Coke Bottle", price: 5.29, category: "beverage" },
  { name: "Sprite Bottle", description: "Sprite Bottle", price: 5.29, category: "beverage" },
  { name: "DASANI Bottled Water", description: "DASANI Bottled Water", price: 4.00, category: "beverage" },
]

menuItems.push(...cauldronItems.map(item => ({
  land: "The Landing",
  restaurant: "Candy Cauldron",
  ...item
})))

// The Ganachery (The Landing) - 46 new items
const ganacheryItems = [
  // Ganache Squares (18 flavors @ $3 each)
  { name: "Orange Ganache Square", description: "Artisan chocolate ganache with orange flavor", price: 3.00, category: "dessert" },
  { name: "Caramel Fleur de Sel Ganache Square", description: "Salted caramel ganache", price: 3.00, category: "dessert" },
  { name: "Coffee Ganache Square", description: "Coffee-flavored ganache", price: 3.00, category: "dessert" },
  { name: "Chipotle Ganache Square", description: "Spicy chipotle ganache", price: 3.00, category: "dessert" },
  { name: "Cinnamon Ganache Square", description: "Cinnamon-flavored ganache", price: 3.00, category: "dessert" },
  { name: "Egyptian Sea Salt Ganache Square", description: "Dark chocolate with Egyptian sea salt", price: 3.00, category: "dessert" },
  { name: "Gianduja Italian Hazelnut Ganache Square", description: "Italian hazelnut ganache", price: 3.00, category: "dessert" },
  { name: "Coconut Ganache Square", description: "Coconut-flavored ganache", price: 3.00, category: "dessert" },
  { name: "Raspberry Ganache Square", description: "Raspberry ganache", price: 3.00, category: "dessert" },
  { name: "Passion Fruit Ganache Square", description: "Passion fruit ganache", price: 3.00, category: "dessert" },
  { name: "Milk Chocolate Ganache Square", description: "Classic milk chocolate ganache", price: 3.00, category: "dessert" },
  { name: "Vanilla Ganache Square", description: "Vanilla ganache", price: 3.00, category: "dessert" },
  { name: "Dark Chocolate 65% Ganache Square", description: "65% dark chocolate ganache", price: 3.00, category: "dessert" },
  { name: "Peanut Butter Ganache Square", description: "Peanut butter ganache", price: 3.00, category: "dessert" },
  { name: "Mint Ganache Square", description: "Mint-flavored ganache", price: 3.00, category: "dessert" },
  { name: "Pistachio Ganache Square", description: "Pistachio ganache", price: 3.00, category: "dessert" },
  { name: "Mango Curry Ganache Square", description: "Mango curry ganache (specialty flavor)", price: 3.00, category: "dessert" },
  { name: "10-Year Tawny Port Ganache Square", description: "Port wine ganache", price: 3.00, category: "dessert" },

  // Ganache Box Sets
  { name: "Box of Six Ganache Squares", description: "Six artisan ganache squares", price: 16.00, category: "dessert" },
  { name: "Box of Nine Ganache Squares", description: "Nine artisan ganache squares", price: 22.00, category: "dessert" },
  { name: "Box of Sixteen Ganache Squares", description: "Sixteen artisan ganache squares", price: 38.00, category: "dessert" },

  // Ganache Pops
  { name: "Minnie Ganache Pop", description: "Cookies and Cream pop enrobed in dark chocolate", price: 8.00, category: "dessert" },
  { name: "Mickey Ganache Pop", description: "Milk chocolate ganache enrobed in milk chocolate", price: 7.50, category: "dessert" },
  { name: "Soulful New York Cheesecake Pop", description: "Cheesecake ganache layered with graham cracker ganache enrobed in 65% dark chocolate", price: 8.00, category: "dessert" },

  // Chocolate Bars
  { name: "Mickey Mouse Chocolate Bar", description: "Simple milk chocolate bar (8 squares)", price: 8.00, category: "dessert" },
  { name: "Minnie Mouse Chocolate Bar", description: "Pink chocolate with dried strawberries (8 squares)", price: 8.00, category: "dessert" },
  { name: "Pluto Chocolate Bar", description: "Chocolate with peanut butter (8 squares)", price: 8.00, category: "dessert" },
  { name: "Goofy Chocolate Bar", description: "Dark chocolate with popping candy (8 squares)", price: 8.00, category: "dessert" },
  { name: "Aulani Hawaii Chocolate Bar", description: "White chocolate with coconut flakes and pineapple (8 squares)", price: 8.00, category: "dessert" },

  // Specialty Treats
  { name: "Made-To-Order Artisan S'mores", description: "House-made marshmallow and chocolate ganache s'mores", price: 9.00, category: "dessert" },
  { name: "Milk Chocolate Marshmallows", description: "House-made vanilla bean marshmallows enrobed in milk chocolate", price: 9.00, category: "dessert" },
  { name: "Chocolate-Peppermint Marshmallows", description: "House-made marshmallows with peppermint flavor", price: 10.00, category: "dessert" },
  { name: "Chocolate Piñatas", description: "Seasonal chocolate shell filled with treats", price: 35.00, category: "dessert" },
  { name: "Crispy Chocolate Pearls (White Chocolate)", description: "Crispy pearls coated in white chocolate", price: 6.50, category: "snack" },
  { name: "Crispy Chocolate Pearls (Milk Chocolate)", description: "Crispy pearls coated in milk chocolate", price: 6.50, category: "snack" },
  { name: "Crispy Chocolate Pearls (Dark Chocolate)", description: "Crispy pearls coated in dark chocolate", price: 6.50, category: "snack" },
  { name: "Crispy Chocolate Pearls (Caramel)", description: "Crispy pearls coated in caramel chocolate", price: 6.50, category: "snack" },
  { name: "Crispy Chocolate Pearls (Strawberry)", description: "Crispy pearls coated in strawberry chocolate", price: 6.50, category: "snack" },
  { name: "Chocolate Lollipops", description: "Artisan chocolate lollipops", price: 6.00, category: "dessert" },

  // Beverages
  { name: "Malted Chocolate Chiller", description: "Cold chocolate beverage", price: 7.25, category: "beverage" },
  { name: "Hot Ganache (Standard)", description: "Hot ganache made with milk, dark, and caramel chocolates blended with cream and vanilla", price: 8.00, category: "beverage" },
  { name: "Hot Ganache with Bailey's", description: "Hot ganache served with Bailey's Original Irish Cream Liqueur", price: 12.00, category: "beverage" },
  { name: "Rosa Regale (Glass)", description: "Sparkling red wine", price: 17.00, category: "beverage" },
  { name: "Rosa Regale with Ganache Square Pairing", description: "Glass of Rosa Regale paired with a ganache square", price: 20.00, category: "beverage" },
  { name: "Rosa Regale (Bottle)", description: "Full bottle of sparkling red wine", price: 67.00, category: "beverage" },
]

menuItems.push(...ganacheryItems.map(item => ({
  land: "The Landing",
  restaurant: "The Ganachery",
  ...item
})))

// Paddy's Bar (The Landing) - 23 new beverages
const paddysItems = [
  // Specialty Cocktails
  { name: "Strawberry Fields Mimosa", description: "Dingle Irish Vodka, Luxardo Apertivo, lemon sour, house-made strawberry puree, Prosecco", price: 17.00, category: "beverage" },
  { name: "Arthur's Old Fashioned", description: "Tullamore Dew 12 Irish Whiskey, Guinness simple syrup, orange bitters, Guinness cured bacon", price: 17.00, category: "beverage" },
  { name: "Strawberry & Cucumber Mojito", description: "Bacardi Gold Rum, strawberry puree, muddled cucumber & mint, lime sour, ginger ale", price: 17.00, category: "beverage" },
  { name: "Iced Irish", description: "Bushmills Original Irish Whiskey, butterscotch, Baileys Salted Caramel, cold brew coffee, whipped cream", price: 16.00, category: "beverage" },
  { name: "Wild Rosey", description: "Glendalough Wild Rose Gin, Rockeys Botanical Liqueur, homemade rosemary syrup, lemon Pellegrino, Fever Tree premium tonic", price: 16.00, category: "beverage" },
  { name: "The Pale Lass", description: "Cazodores reposado tequila, Italicus liquor, hibiscus water, lemon sour, honey, topped with sparkling Fever Tree grapefruit soda", price: 16.00, category: "beverage" },
  { name: "New York by Nature", description: "Teeling's small batch Irish Whiskey, passionfruit puree, house-made demerara brown sugar, lemon sour, topped with Petite Sirah red wine", price: 16.00, category: "beverage" },
  { name: "Irish Espresso Martini", description: "Slane Irish whiskey, J.F. Hadens espresso liqueur, Guinness simple syrup, chilled espresso", price: 16.00, category: "beverage" },

  // Mocktails
  { name: "Not So Wild Rosey", description: "Seedlip Garden 108 non-alcoholic spirit, homemade rosemary syrup, lemon Pellegrino, Fever Tree premium tonic", price: 10.00, category: "beverage" },

  // Draft Beers
  { name: "City Beautiful IPA", description: "Orange Blossom, Orlando FL - American IPA, 6.4% ABV", price: 10.00, category: "beverage" },
  { name: "Space Cowboi Hazy Double IPA", description: "Crooked Can, Winter Garden FL - Hazy Double IPA, 8.5% ABV", price: 12.00, category: "beverage" },
  { name: "Allagash White", description: "Allagash, Maine - Belgian-Style Wheat Ale, 5% ABV", price: 10.00, category: "beverage" },
  { name: "Sullivan's Black Marble Stout", description: "Kilkenny, Ireland - 5.1% ABV", price: 10.00, category: "beverage" },

  // Cider
  { name: "De Cider No. 2", description: "Cider", price: 11.00, category: "beverage" },

  // Wine & Sparkling
  { name: "Prosecco Cavit Lunetta Italy 187ml", description: "187ml bottle", price: 14.00, category: "beverage" },
  { name: "Sauvignon Blanc", description: "White wine", price: 12.00, category: "beverage" },
  { name: "Pinot Grigio", description: "White wine", price: 12.00, category: "beverage" },
  { name: "Pinot Noir", description: "Red wine", price: 13.00, category: "beverage" },

  // Non-Alcoholic Beers
  { name: "Heineken 0.0", description: "Non-alcoholic beer", price: 8.00, category: "beverage" },
  { name: "Guinness 0.0", description: "Non-alcoholic Guinness", price: 8.00, category: "beverage" },
]

menuItems.push(...paddysItems.map(item => ({
  land: "The Landing",
  restaurant: "Paddy's Bar - Pub/Lounge",
  ...item
})))

// Cilantro Urban Eatery (West Side) - 2 new items
const cilantroItems = [
  { name: "Arepa Encantada", description: "Two South American gluten-free white corn cakes stuffed with mozzarella cheese and cilantro-avocado mayo dip", price: 10.00, category: "entree" },
  { name: "Pabellon-Ropa Vieja", description: "Venezuelan national dish with shredded flank steak braised in tomato juice, onions and peppers with white rice, black beans and sweet plantains", price: 16.00, category: "entree" },
]

menuItems.push(...cilantroItems.map(item => ({
  land: "West Side",
  restaurant: "Cilantro Urban Eatery",
  ...item
})))

// eet by Maneet Chauhan (Town Center) - 38 new items
const eetItems = [
  // Shareables
  { name: "eet Bread Service with Pimento Whipped Paneer", description: "Naan varieties, paneer cheese, vegetable sticks, chutneys", price: 19.95, category: "entree" },
  { name: "Tandoori Chicken Poutine", description: "Chaat masala fries, tandoori chicken, white cheddar curds, rich tomato butter sauce", price: 15.95, category: "entree" },
  { name: "D.I.Y. Pani Puri (7 pcs.)", description: "Semolina puffs, beans, potatoes, tamarind, date chutney, mint water", price: 12.95, category: "snack" },
  { name: "Walking Taco", description: "Frito chips, spicy pork chili, Indian pico, tamarind chutney, cotija cheese", price: 12.95, category: "snack" },
  { name: "Samosas", description: "Potato & pea pastry, tamarind and mint chutneys", price: 11.95, category: "snack" },

  // Pizza & Breads
  { name: "Crispy Flounder Sandwich", description: "Deep fried flounder with santra BBQ sauce, tikka butter", price: 16.00, category: "entree" },
  { name: "Chicken Tikka Naan Pizza", description: "Chicken kabab, tomato butter sauce, cheeses", price: 16.95, category: "entree" },
  { name: "Bhunna Paneer Flatbread", description: "Paneer curry flatbread", price: 16.95, category: "entree" },
  { name: "Beer Cheese Flatbread", description: "Beer cheese flatbread", price: 16.95, category: "entree" },
  { name: "Spicy Green Chili Naan", description: "Chilies, cilantro, clarified butter", price: 6.95, category: "side" },

  // Market Fresh
  { name: "Enchanted Noodles", description: "Lo-mein, peas, carrots, umami glaze", price: 14.00, category: "entree" },
  { name: "Monster Mein", description: "Lo-mein, vegetables, lava garlic umami sauce", price: 15.00, category: "entree" },
  { name: "Street Style Puffed Rice Salad", description: "Crispy rice, mango, strawberry, potato, chutneys", price: 12.95, category: "entree" },
  { name: "Samosa Chopped Salad", description: "Mixed greens, vegetables, mini samosa croutons, vinaigrette", price: 15.95, category: "entree" },
  { name: "Salad Enhancement", description: "Add: Tandoori chicken, paneer tikka, shrimp, or cauliflower", price: 8.00, category: "side" },

  // Build Your Own Bowl
  { name: "Build Your Own Bowl", description: "Choose base (cumin basmati rice, turmeric cauliflower rice, or fresh greens), kabab (tandoori chicken, paneer tikka, basil cilantro shrimp, or roasted cauliflower), and sauce (tikka, moilee, or bhunna)", price: 19.95, category: "entree" },

  // Additions / Sides
  { name: "Side Curry", description: "Side curry portion", price: 9.95, category: "side" },
  { name: "Masala Fries", description: "Masala-spiced fries", price: 6.95, category: "side" },
  { name: "Desi Salad", description: "Indian-style salad", price: 5.95, category: "side" },
  { name: "Side Rice", description: "Side rice portion", price: 3.95, category: "side" },
  { name: "Yogurt Raita", description: "Yogurt raita", price: 2.95, category: "side" },
  { name: "Chopped Green Chilies", description: "Chopped green chilies", price: 2.95, category: "side" },
  { name: "Mint Chutney", description: "Mint chutney", price: 1.95, category: "side" },
  { name: "Tamarind Chutney", description: "Tamarind chutney", price: 1.95, category: "side" },

  // Kids Menu
  { name: "Lil' Naan Pizza", description: "Kids naan pizza", price: 9.95, category: "entree" },
  { name: "Lil' Sliders", description: "Beef sliders with cheese", price: 9.95, category: "entree" },
  { name: "Crispy Chicken Fingers", description: "Crispy chicken fingers", price: 9.95, category: "entree" },
  { name: "DIY PB&J", description: "DIY peanut butter & jelly", price: 9.95, category: "entree" },
  { name: "Veggie Skewer", description: "Vegetable skewer", price: 9.95, category: "entree" },
  { name: "Shrimp Skewer", description: "Shrimp skewer", price: 9.95, category: "entree" },
  { name: "Mac and Cheese", description: "Mac and cheese", price: 9.95, category: "entree" },

  // Desserts
  { name: "Gulab Jamun Cheesecake", description: "NY-style cheesecake, gulab jamun, strawberries, saffron, cardamom", price: 11.95, category: "dessert" },
  { name: "Seasonal Dessert", description: "Seasonal dessert offering", price: 11.95, category: "dessert" },

  // Beverages
  { name: "Monster Mash-Tini", description: "Frozen green appletini with vodka, caramel drizzle", price: 14.00, category: "beverage" },
  { name: "Mango Yogurt Lassi", description: "Mango yogurt lassi", price: 5.95, category: "beverage" },
  { name: "Apple Juice", description: "Apple juice", price: 3.95, category: "beverage" },
]

menuItems.push(...eetItems.map(item => ({
  land: "Town Center",
  restaurant: "eet by Maneet Chauhan",
  ...item
})))

// Output JSON
const output = {
  parks: [{
    id: "disney-springs",
    name: "Disney Springs",
    subtitle: "Sparse restaurant fill - 6 restaurants expanded (Feb 2026)",
    lands: ["Marketplace", "The Landing", "West Side", "Town Center"],
    menuItems
  }]
}

writeFileSync('data/parks/disney-springs-sparse-fill.json', JSON.stringify(output, null, 2))
console.log(`Created disney-springs-sparse-fill.json with ${menuItems.length} items`)
