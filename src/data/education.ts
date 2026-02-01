export interface EducationSection {
  heading: string
  points: string[]
}

export const type1Content: EducationSection[] = [
  {
    heading: 'What is Type 1 Diabetes?',
    points: [
      'An autoimmune condition where the pancreas produces little or no insulin.',
      'The immune system attacks insulin-producing beta cells in the pancreas.',
      'It is not caused by diet or lifestyle and cannot be prevented.',
      'Usually diagnosed in children and young adults, but can occur at any age.',
      'Requires daily insulin therapy (injections or pump) to survive.',
    ],
  },
  {
    heading: 'Managing Blood Sugar',
    points: [
      'Monitor blood glucose frequently (meter or CGM).',
      'Count carbohydrates to calculate insulin doses.',
      'Adjust insulin for meals, activity, illness, and stress.',
      'Target blood glucose range is typically 70-180 mg/dL.',
      'A1C goal is generally below 7% for most adults.',
    ],
  },
  {
    heading: 'Insulin Basics',
    points: [
      'Rapid-acting insulin (Humalog, NovoLog) covers meals.',
      'Long-acting insulin (Lantus, Levemir) provides background coverage.',
      'Insulin pumps deliver rapid-acting insulin continuously.',
      'Insulin must be stored properly — avoid extreme heat or cold.',
      'Never skip insulin doses even if not eating.',
    ],
  },
  {
    heading: 'Highs and Lows',
    points: [
      'Hypoglycemia (low BG < 70 mg/dL): treat with 15g fast-acting carbs, recheck in 15 min.',
      'Hyperglycemia (high BG > 250 mg/dL): check for ketones, correct with insulin.',
      'Diabetic ketoacidosis (DKA) is a life-threatening emergency — seek immediate medical help.',
      'Always carry fast-acting glucose and a glucagon emergency kit.',
      'Teach friends and family how to recognize and treat severe lows.',
    ],
  },
  {
    heading: 'At the Theme Park',
    points: [
      'Heat can cause insulin to degrade — use a cooling case.',
      'Walking all day lowers blood sugar — reduce bolus or carry extra snacks.',
      'Adrenaline from thrill rides may spike blood sugar temporarily.',
      'Inform your group about where your supplies are and what to do in an emergency.',
      'First Aid stations can help with diabetes emergencies.',
    ],
  },
]

export const type2Content: EducationSection[] = [
  {
    heading: 'What is Type 2 Diabetes?',
    points: [
      'A metabolic condition where the body becomes resistant to insulin or does not produce enough.',
      'Most common form of diabetes, accounting for about 90-95% of cases.',
      'Risk factors include family history, weight, age, and physical inactivity.',
      'Can often be managed with lifestyle changes, oral medications, or injectable therapies.',
      'Some people with Type 2 may eventually need insulin therapy.',
    ],
  },
  {
    heading: 'Lifestyle Management',
    points: [
      'Regular physical activity helps improve insulin sensitivity.',
      'A balanced diet focusing on whole grains, vegetables, lean protein, and healthy fats.',
      'Portion control and carbohydrate awareness are key.',
      'Weight management can significantly improve blood sugar control.',
      'Stress management and adequate sleep support glucose regulation.',
    ],
  },
  {
    heading: 'Medications',
    points: [
      'Metformin is the most common first-line medication.',
      'Other classes include sulfonylureas, DPP-4 inhibitors, SGLT2 inhibitors, and GLP-1 agonists.',
      'Take medications consistently as prescribed.',
      'Some medications may cause low blood sugar — know which ones.',
      'Discuss any new supplements or OTC medications with your doctor.',
    ],
  },
  {
    heading: 'Monitoring',
    points: [
      'Check blood sugar as recommended by your healthcare team.',
      'Fasting blood glucose target is typically 80-130 mg/dL.',
      'A1C test reflects average blood sugar over 2-3 months; goal is usually under 7%.',
      'CGMs are increasingly available for Type 2 as well.',
      'Keep a log of readings, meals, and activity to find patterns.',
    ],
  },
  {
    heading: 'At the Theme Park',
    points: [
      'Walking extensively counts as exercise — monitor for lows if on sulfonylureas or insulin.',
      'Stay hydrated — dehydration worsens blood sugar control.',
      'Plan meals and snacks around park schedules.',
      'Carry your medications and a snack at all times.',
      'Know where First Aid is located at each park.',
    ],
  },
]
