import type { InsulinDoseResult, InsulinInputs, InsulinValidation } from './insulin'
import { INSULIN_LIMITS } from './insulin'

export interface HiddenDoseTriggerInput {
  inputs: InsulinInputs
  validation: InsulinValidation
  result: InsulinDoseResult | null
  blockedByUnavailableNutrition?: boolean
}

export function getHiddenDoseTriggers({
  inputs,
  validation,
  result,
  blockedByUnavailableNutrition,
}: HiddenDoseTriggerInput): string[] {
  const triggers: string[] = []
  const missing = getMissingRequiredFields(inputs)

  if (missing.length > 0) {
    triggers.push(`Missing required input: ${missing.join(', ')}.`)
  }

  if (validation.status === 'hypoglycemia') {
    triggers.push('Blood glucose is below 70 mg/dL; treat the low before considering insulin.')
  }

  if (
    typeof inputs.bloodGlucose === 'number' &&
    typeof inputs.targetGlucose === 'number' &&
    inputs.bloodGlucose < inputs.targetGlucose
  ) {
    triggers.push('BG below target: correction insulin is suppressed.')
  }

  if (activeInsulinExceedsCorrectionNeed(inputs)) {
    triggers.push('IOB exceeds correction need: correction insulin is reduced to 0 units.')
  }

  if (result?.status === 'blocked') {
    triggers.push('Total would exceed Max Bolus.')
  }

  if (typeof inputs.carbs === 'number' && inputs.carbs <= 0) {
    triggers.push('Carbs <= 0: no meal-carb dose is shown.')
  }

  if (blockedByUnavailableNutrition) {
    triggers.push('Meal includes items with unavailable nutrition; totals should not feed the estimator.')
  }

  for (const message of validation.messages) {
    if (message.startsWith('Enter ')) continue
    if (!triggers.includes(message)) triggers.push(message)
  }

  return triggers
}

function getMissingRequiredFields(inputs: InsulinInputs): string[] {
  const missing: string[] = []

  if (inputs.carbs === '') missing.push('Total carbs')
  if (inputs.bloodGlucose === '') missing.push('Blood glucose')
  if (inputs.targetGlucose === '') missing.push('Target glucose')
  if (inputs.insulinToCarbRatio === '') missing.push('Insulin-to-carb ratio')
  if (inputs.correctionFactor === '') missing.push('Correction factor')
  if ((inputs.maxBolus ?? INSULIN_LIMITS.maxBolus.default) === '') missing.push('Max bolus')

  return missing
}

function activeInsulinExceedsCorrectionNeed(inputs: InsulinInputs): boolean {
  if (
    typeof inputs.bloodGlucose !== 'number' ||
    typeof inputs.targetGlucose !== 'number' ||
    typeof inputs.correctionFactor !== 'number' ||
    typeof inputs.activeInsulin !== 'number' ||
    inputs.bloodGlucose <= inputs.targetGlucose ||
    inputs.correctionFactor <= 0
  ) {
    return false
  }

  const correctionNeed = (inputs.bloodGlucose - inputs.targetGlucose) / inputs.correctionFactor

  return correctionNeed > 0 && inputs.activeInsulin >= correctionNeed
}
