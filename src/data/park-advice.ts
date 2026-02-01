export interface AdviceSection {
  heading: string
  content: string[]
}

export const parkAdvice: AdviceSection[] = [
  {
    heading: 'Before You Go',
    content: [
      'Visit your endocrinologist or diabetes care team 2-4 weeks before your trip to discuss travel adjustments.',
      'Get a letter from your doctor explaining your diabetes supplies — this helps with park security and TSA.',
      'Research dining options at each park ahead of time. Most parks post menus with nutrition info online.',
      'Download the park app — it shows restaurant locations, First Aid stations, and wait times.',
      'Consider purchasing a cooling wallet or Frio pouch to keep insulin safe in the Florida heat.',
    ],
  },
  {
    heading: 'Packing Tips',
    content: [
      'Pack at least double the supplies you think you need — pharmacies near parks may not carry your specific insulin.',
      'Split supplies between two bags in case one is lost or stolen.',
      'Bring a small day pack for the park with meter, strips, insulin, snacks, glucose tabs, and water.',
      'Ziploc bags protect supplies from water rides and sudden rain.',
      'Keep insulin out of direct sunlight and never leave it in a hot car.',
    ],
  },
  {
    heading: 'At the Park: Blood Sugar Management',
    content: [
      'Walking 20,000+ steps per day is common — this significantly lowers blood sugar.',
      'Consider reducing basal rates (pump) or long-acting insulin by 10-20% on park days.',
      'Check blood sugar more frequently than usual, especially before and after rides.',
      'Adrenaline from thrill rides and excitement can cause blood sugar spikes.',
      'Heat and dehydration can make blood sugar readings less predictable.',
      'Set CGM alerts slightly wider to avoid alarm fatigue but narrow enough to catch real problems.',
    ],
  },
  {
    heading: 'Eating at the Parks',
    content: [
      'Theme park meals tend to be high-carb — burgers, fries, funnel cakes, churros.',
      'Look for grilled options, salads, and protein-based snacks for more stable blood sugar.',
      'Mobile ordering lets you plan meals and review nutrition info before committing.',
      'Carry your own snacks for times when wait lines are long and meals are delayed.',
      'Character dining and buffets offer variety but make carb counting harder — estimate conservatively.',
    ],
  },
  {
    heading: 'Rides and Attractions',
    content: [
      'Insulin pumps and CGMs are generally fine on all rides, including roller coasters.',
      'Some riders prefer to disconnect pumps for very intense rides — consult your doctor.',
      'Water rides can loosen CGM adhesive — bring extra adhesive patches.',
      'If you feel low during a ride queue, step out of line and treat immediately.',
      'Disability Access Service (DAS) may be available if diabetes-related needs affect your ability to wait in standard queues.',
    ],
  },
  {
    heading: 'Emergency Preparedness',
    content: [
      'Know the location of First Aid at every park before you arrive.',
      'First Aid stations stock basic supplies and can store insulin in a refrigerator.',
      'Teach your travel companions how to use glucagon and recognize severe lows.',
      'Wear a medical ID bracelet or tag at all times.',
      'Program ICE (In Case of Emergency) contacts into your phone.',
      'If blood sugar is very high (>300) with ketones, seek medical attention immediately.',
    ],
  },
  {
    heading: 'Special Considerations for Kids',
    content: [
      'Create a simple "what to do" card for any adult supervising your child.',
      'Pack kid-friendly low snacks that your child will actually eat (juice boxes, fruit snacks).',
      'Build in rest breaks — overtired kids are harder to manage and stress raises blood sugar.',
      'Use a phone or smartwatch to share CGM data with parents in real time.',
      'Practice talking to your child about asking for help if they feel low while on a ride.',
    ],
  },
]
