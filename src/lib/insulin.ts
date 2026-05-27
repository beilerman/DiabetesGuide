export type ActivityLevel = 'none' | 'mod' | 'high'

export interface InsulinInputs {
  carbs: number | ''
  bloodGlucose: number | ''
  targetGlucose: number | ''
  insulinToCarbRatio: number | ''
  correctionFactor: number | ''
  activity: ActivityLevel
  activeInsulin?: number | ''
  maxBolus?: number | ''
}

export type InsulinValidationStatus = 'valid' | 'incomplete' | 'invalid' | 'hypoglycemia'
export type InsulinDoseStatus = 'ok' | 'warning' | 'blocked'

export interface InsulinValidation {
  isValid: boolean
  status: InsulinValidationStatus
  messages: string[]
}

export interface InsulinDoseResult {
  carbBolus: number
  activityAdjustedCarbBolus: number
  correction: number
  iobAdjustment: number
  correctionAfterIob: number
  adjPct: number
  totalBeforeSafety: number
  suggested: number | null
  status: InsulinDoseStatus
  messages: string[]
}

export interface HypoglycemiaTreatmentPlan {
  severity: 'low' | 'clinically-significant-low'
  fastCarbsGrams: number
  recheckMinutes: number
  headline: string
  guidance: string
  urgent: boolean
}

export const INSULIN_LIMITS = {
  hypoglycemiaThreshold: 70,
  clinicallySignificantHypoglycemiaThreshold: 54,
  carbs: { min: 0, max: 250 },
  bloodGlucose: { min: 40, max: 600 },
  targetGlucose: { min: 70, max: 180 },
  insulinToCarbRatio: { min: 3, max: 30 },
  correctionFactor: { min: 10, max: 150 },
  activeInsulin: { min: 0, max: 50 },
  maxBolus: { min: 1, max: 50, default: 25 },
  unusualDose: 15,
  absoluteMaxBolus: 50,
} as const

function isPositiveNumber(value: number | ''): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeNumber(value: number | ''): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10
}

function validateRange(
  label: string,
  value: number | '',
  min: number,
  max: number,
  message: string,
  messages: string[]
): value is number {
  if (value === '') {
    messages.push(`Enter ${label}.`)
    return false
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    messages.push(message)
    return false
  }
  return true
}

export function validateInsulinInputs(inputs: InsulinInputs): InsulinValidation {
  const messages: string[] = []
  let incomplete = false
  let hypoglycemia = false

  if (inputs.carbs === '') {
    messages.push('Enter total carbs.')
    incomplete = true
  } else if (!isNonNegativeNumber(inputs.carbs) || inputs.carbs > INSULIN_LIMITS.carbs.max) {
    messages.push('Total carbs must be between 0 and 250g.')
  }

  if (inputs.bloodGlucose === '') {
    messages.push('Enter current blood glucose.')
    incomplete = true
  } else if (!isPositiveNumber(inputs.bloodGlucose) || inputs.bloodGlucose < INSULIN_LIMITS.bloodGlucose.min || inputs.bloodGlucose > INSULIN_LIMITS.bloodGlucose.max) {
    messages.push('Blood glucose must be between 40 and 600 mg/dL.')
  } else if (inputs.bloodGlucose < INSULIN_LIMITS.hypoglycemiaThreshold) {
    messages.push('Blood glucose is below 70 mg/dL. Treat the low before considering meal or correction insulin.')
    hypoglycemia = true
  }

  if (inputs.targetGlucose === '') {
    messages.push('Enter target glucose.')
    incomplete = true
  } else if (!isPositiveNumber(inputs.targetGlucose) || inputs.targetGlucose < INSULIN_LIMITS.targetGlucose.min || inputs.targetGlucose > INSULIN_LIMITS.targetGlucose.max) {
    messages.push('Target glucose must be between 70 and 180 mg/dL.')
  }

  if (inputs.insulinToCarbRatio === '') {
    messages.push('Enter your insulin-to-carb ratio.')
    incomplete = true
  } else if (!isPositiveNumber(inputs.insulinToCarbRatio) || inputs.insulinToCarbRatio < INSULIN_LIMITS.insulinToCarbRatio.min || inputs.insulinToCarbRatio > INSULIN_LIMITS.insulinToCarbRatio.max) {
    messages.push('Insulin-to-carb ratio must be between 3 and 30 grams per unit.')
  }

  if (inputs.correctionFactor === '') {
    messages.push('Enter your correction factor.')
    incomplete = true
  } else if (!isPositiveNumber(inputs.correctionFactor) || inputs.correctionFactor < INSULIN_LIMITS.correctionFactor.min || inputs.correctionFactor > INSULIN_LIMITS.correctionFactor.max) {
    messages.push('Correction factor must be between 10 and 150 mg/dL per unit.')
  }

  const activeInsulin = inputs.activeInsulin ?? 0
  if (activeInsulin !== '' && (typeof activeInsulin !== 'number' || !Number.isFinite(activeInsulin) || activeInsulin < INSULIN_LIMITS.activeInsulin.min || activeInsulin > INSULIN_LIMITS.activeInsulin.max)) {
    messages.push('Insulin on board must be between 0 and 50 units.')
  }

  const maxBolus = inputs.maxBolus ?? INSULIN_LIMITS.maxBolus.default
  validateRange(
    'your max bolus',
    maxBolus,
    INSULIN_LIMITS.maxBolus.min,
    INSULIN_LIMITS.maxBolus.max,
    'Max bolus must be between 1 and 50 units.',
    messages
  )

  const status: InsulinValidationStatus = hypoglycemia
    ? 'hypoglycemia'
    : messages.length === 0
      ? 'valid'
      : incomplete
        ? 'incomplete'
        : 'invalid'

  return { isValid: status === 'valid', status, messages }
}

export function calculateInsulinDose(inputs: InsulinInputs): InsulinDoseResult | null {
  const validation = validateInsulinInputs(inputs)
  if (!validation.isValid) return null

  const carbs = Number(inputs.carbs)
  const bg = Number(inputs.bloodGlucose)
  const target = Number(inputs.targetGlucose)
  const icr = Number(inputs.insulinToCarbRatio)
  const cf = Number(inputs.correctionFactor)
  const activeInsulin = Number(inputs.activeInsulin ?? 0)
  const maxBolus = Number(inputs.maxBolus ?? INSULIN_LIMITS.maxBolus.default)

  const carbBolus = carbs / icr
  const correction = Math.max(0, bg > target ? (bg - target) / cf : 0)
  const iobAdjustment = Math.min(activeInsulin, correction)
  const correctionAfterIob = Math.max(0, correction - iobAdjustment)
  const adjPct = inputs.activity === 'mod' ? 0.25 : inputs.activity === 'high' ? 0.5 : 0
  const activityAdjustedCarbBolus = carbBolus * (1 - adjPct)
  const totalBeforeSafety = Math.max(0, activityAdjustedCarbBolus + correctionAfterIob)
  const messages: string[] = []
  let status: InsulinDoseStatus = 'ok'
  let suggested: number | null = roundTenths(totalBeforeSafety)

  if (totalBeforeSafety > Math.min(maxBolus, INSULIN_LIMITS.absoluteMaxBolus)) {
    status = 'blocked'
    suggested = null
    messages.push('Calculated dose exceeds the configured max bolus. Do not use this result without clinician guidance.')
  } else if (totalBeforeSafety > INSULIN_LIMITS.unusualDose) {
    status = 'warning'
    messages.push('Suggested dose is unusually high. Verify carbs, ratios, glucose, and active insulin before using.')
  }

  return {
    carbBolus: roundTenths(carbBolus),
    activityAdjustedCarbBolus: roundTenths(activityAdjustedCarbBolus),
    correction: roundTenths(correction),
    iobAdjustment: roundTenths(iobAdjustment),
    correctionAfterIob: roundTenths(correctionAfterIob),
    adjPct: Math.round(adjPct * 100),
    totalBeforeSafety: roundTenths(totalBeforeSafety),
    suggested,
    status,
    messages,
  }
}

export function getHypoglycemiaTreatmentPlan(
  bloodGlucose: number | '',
): HypoglycemiaTreatmentPlan | null {
  if (
    typeof bloodGlucose !== 'number' ||
    !Number.isFinite(bloodGlucose) ||
    bloodGlucose >= INSULIN_LIMITS.hypoglycemiaThreshold
  ) {
    return null
  }

  const urgent = bloodGlucose < INSULIN_LIMITS.clinicallySignificantHypoglycemiaThreshold

  return {
    severity: urgent ? 'clinically-significant-low' : 'low',
    fastCarbsGrams: 15,
    recheckMinutes: 15,
    headline: urgent ? 'Clinically significant low - treat now' : 'Treat low glucose before insulin',
    guidance: 'Take 15g fast-acting carbohydrate, recheck in 15 minutes, and repeat if still below 70 mg/dL.',
    urgent,
  }
}
