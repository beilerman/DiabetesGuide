export type ActivityLevel = 'none' | 'mod' | 'high'

export interface InsulinInputs {
  carbs: number | ''
  bloodGlucose: number | ''
  targetGlucose: number | ''
  insulinToCarbRatio: number | ''
  correctionFactor: number | ''
  activity: ActivityLevel
}

export interface InsulinValidation {
  isValid: boolean
  messages: string[]
}

export interface InsulinDoseResult {
  carbBolus: number
  correction: number
  adjPct: number
  suggested: number
}

function isPositiveNumber(value: number | ''): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeNumber(value: number | ''): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10
}

export function validateInsulinInputs(inputs: InsulinInputs): InsulinValidation {
  const messages: string[] = []

  if (inputs.carbs === '') messages.push('Enter total carbs.')
  else if (!isNonNegativeNumber(inputs.carbs)) messages.push('Total carbs must be 0 or greater.')

  if (inputs.bloodGlucose === '') messages.push('Enter current blood glucose.')
  else if (!isPositiveNumber(inputs.bloodGlucose)) messages.push('Blood glucose must be greater than 0.')

  if (inputs.targetGlucose === '') messages.push('Enter target glucose.')
  else if (!isPositiveNumber(inputs.targetGlucose)) messages.push('Target glucose must be greater than 0.')

  if (inputs.insulinToCarbRatio === '') messages.push('Enter your insulin-to-carb ratio.')
  else if (!isPositiveNumber(inputs.insulinToCarbRatio)) messages.push('Insulin-to-carb ratio must be greater than 0.')

  if (inputs.correctionFactor === '') messages.push('Enter your correction factor.')
  else if (!isPositiveNumber(inputs.correctionFactor)) messages.push('Correction factor must be greater than 0.')

  return { isValid: messages.length === 0, messages }
}

export function calculateInsulinDose(inputs: InsulinInputs): InsulinDoseResult | null {
  const validation = validateInsulinInputs(inputs)
  if (!validation.isValid) return null

  const carbs = Number(inputs.carbs)
  const bg = Number(inputs.bloodGlucose)
  const target = Number(inputs.targetGlucose)
  const icr = Number(inputs.insulinToCarbRatio)
  const cf = Number(inputs.correctionFactor)

  const carbBolus = carbs / icr
  const correction = bg !== target ? (bg - target) / cf : 0
  const adjPct = inputs.activity === 'mod' ? 0.25 : inputs.activity === 'high' ? 0.5 : 0
  const suggested = Math.max(0, (carbBolus + correction) * (1 - adjPct))

  return {
    carbBolus: roundTenths(carbBolus),
    correction: roundTenths(correction),
    adjPct: Math.round(adjPct * 100),
    suggested: roundTenths(suggested),
  }
}
