export interface ChecklistSection {
  title: string
  items: string[]
}

export interface ChecklistOptions {
  t1: boolean
  t2: boolean
  pump: boolean
  cgm: boolean
  child: boolean
  tripDays: number
}

export function buildChecklist(opts: ChecklistOptions): ChecklistSection[] {
  const { t1, t2, pump, cgm, child, tripDays } = opts
  const sections: ChecklistSection[] = []

  // Essentials - always included
  const essentials = [
    'Blood glucose meter + extra batteries',
    'Test strips (pack 2x what you think you need)',
    'Lancets and lancing device',
    'Fast-acting glucose tabs or juice boxes',
    'Snacks (granola bars, crackers, peanut butter)',
    'Medical ID bracelet or card',
    'Written list of all medications and dosages',
    'Insurance card and emergency contact info',
    'Cooler bag or insulated pouch for insulin',
    'Sunscreen (sunburn can raise blood sugar)',
    'Comfortable broken-in walking shoes',
    'Refillable water bottle',
  ]
  sections.push({ title: 'Essentials', items: essentials })

  // Insulin supplies
  if (t1 || t2) {
    const insulinItems = [
      `Insulin vials or pens (${Math.ceil(tripDays * 1.5)} day supply recommended)`,
      'Insulin pen needles (extra box)',
      'Sharps container or travel sharps case',
      'Alcohol swabs',
    ]
    if (t1) {
      insulinItems.push('Rapid-acting insulin (e.g., Humalog, NovoLog)')
      insulinItems.push('Long-acting insulin (e.g., Lantus, Levemir)')
      insulinItems.push('Ketone test strips')
      insulinItems.push('Glucagon emergency kit')
    }
    if (t2) {
      insulinItems.push('Oral medications (enough for trip + 2 extra days)')
    }
    sections.push({ title: 'Insulin & Medication Supplies', items: insulinItems })
  }

  // Pump supplies
  if (pump) {
    sections.push({
      title: 'Insulin Pump Supplies',
      items: [
        `Infusion sets (${Math.ceil(tripDays / 2) + 2} sets minimum)`,
        `Reservoirs (${Math.ceil(tripDays / 2) + 2} minimum)`,
        'Pump batteries or charger',
        'Backup insulin pen or syringe in case of pump failure',
        'Skin prep wipes and adhesive remover',
        'Tegaderm or tape for extra adhesion in heat/sweat',
        'Pump manufacturer emergency phone number',
      ],
    })
  }

  // CGM supplies
  if (cgm) {
    sections.push({
      title: 'CGM Supplies',
      items: [
        `Extra CGM sensors (${Math.ceil(tripDays / 10) + 1} extras)`,
        'CGM transmitter (backup if available)',
        'Sensor adhesive patches (OverPatches or similar)',
        'Phone charger / portable battery pack for CGM receiver',
        'Skin prep wipes for sensor adhesion',
      ],
    })
  }

  // Child-specific
  if (child) {
    sections.push({
      title: 'For Kids',
      items: [
        'Letter from doctor explaining medical supplies for park security',
        'Kid-friendly glucose tabs or gummy snacks',
        'Smaller-portion snack packs',
        'Comfort item for low blood sugar episodes',
        'School/camp diabetes management plan (copy)',
        'Temporary tattoo or wristband with parent phone number',
      ],
    })
  }

  // Park day bag
  sections.push({
    title: 'Park Day Bag',
    items: [
      'Small backpack or fanny pack',
      'Glucose meter + strips for the day',
      'Fast-acting sugar source',
      'Snacks',
      'Insulin pen or pump supplies for the day',
      'Phone + charger/battery pack',
      'Hand sanitizer (clean hands before testing)',
      'Ziploc bags (keep supplies dry on water rides)',
    ],
  })

  return sections
}
