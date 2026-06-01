import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const data = JSON.parse(readFileSync(__dirname + '/../data/scraped/universal-2026-02-04.json', 'utf8'));
const eu = (data.restaurants as any[]).filter(r => r.parkName === 'Universal Epic Universe');

for (const r of eu) {
  const extraKeys = Object.keys(r).filter(k => !['source','parkName','restaurantName','items'].includes(k));
  console.log(`\n${r.restaurantName} (${r.items?.length ?? 0} items)`);
  if (extraKeys.length) console.log('  Extra fields:', extraKeys.map(k => `${k}=${JSON.stringify(r[k])}`).join(', '));
  if (r.items?.length) {
    const itemKeys = Object.keys(r.items[0]).filter(k => k !== 'itemName' && k !== 'description' && k !== 'price');
    if (itemKeys.length) console.log('  Item extra fields:', itemKeys.join(', '));
    console.log('  Sample item:', JSON.stringify(r.items[0]).slice(0, 120));
  }
}
