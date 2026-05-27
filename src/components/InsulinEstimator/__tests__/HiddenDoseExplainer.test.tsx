import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { calculateInsulinDose, validateInsulinInputs, type InsulinInputs } from '../../../lib/insulin'
import { getHiddenDoseTriggers } from '../../../lib/hidden-dose-triggers'
import { HiddenDoseExplainer } from '../HiddenDoseExplainer'

describe('getHiddenDoseTriggers', () => {
  it('lists missing required fields and zero-carb trigger', () => {
    const inputs: InsulinInputs = {
      carbs: 0,
      bloodGlucose: '',
      targetGlucose: 120,
      insulinToCarbRatio: '',
      correctionFactor: '',
      activeInsulin: 0,
      maxBolus: 25,
      activity: 'none',
    }

    const triggers = getHiddenDoseTriggers({
      inputs,
      validation: validateInsulinInputs(inputs),
      result: calculateInsulinDose(inputs),
    })

    expect(triggers).toContain('Missing required input: Blood glucose, Insulin-to-carb ratio, Correction factor.')
    expect(triggers).toContain('Carbs <= 0: no meal-carb dose is shown.')
  })

  it('lists BG suppression, IOB suppression, and max bolus triggers', () => {
    const blockedInputs: InsulinInputs = {
      carbs: 100,
      bloodGlucose: 180,
      targetGlucose: 120,
      insulinToCarbRatio: 10,
      correctionFactor: 50,
      activeInsulin: 2,
      maxBolus: 5,
      activity: 'none',
    }
    const belowTargetInputs: InsulinInputs = {
      ...blockedInputs,
      carbs: 0,
      bloodGlucose: 100,
      maxBolus: 25,
    }

    expect(getHiddenDoseTriggers({
      inputs: blockedInputs,
      validation: validateInsulinInputs(blockedInputs),
      result: calculateInsulinDose(blockedInputs),
    })).toEqual(expect.arrayContaining([
      'IOB exceeds correction need: correction insulin is reduced to 0 units.',
      'Total would exceed Max Bolus.',
    ]))

    expect(getHiddenDoseTriggers({
      inputs: belowTargetInputs,
      validation: validateInsulinInputs(belowTargetInputs),
      result: calculateInsulinDose(belowTargetInputs),
    })).toEqual(expect.arrayContaining([
      'BG below target: correction insulin is suppressed.',
      'Carbs <= 0: no meal-carb dose is shown.',
    ]))
  })
})

describe('HiddenDoseExplainer', () => {
  it('renders a safety methodology link', () => {
    const inputs: InsulinInputs = {
      carbs: '',
      bloodGlucose: '',
      targetGlucose: '',
      insulinToCarbRatio: '',
      correctionFactor: '',
      activeInsulin: 0,
      maxBolus: 25,
      activity: 'none',
    }

    render(
      <MemoryRouter>
        <HiddenDoseExplainer
          inputs={inputs}
          validation={validateInsulinInputs(inputs)}
          result={calculateInsulinDose(inputs)}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText(/why is the dose hidden/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /safety methodology/i })).toHaveAttribute('href', '/data-sources#estimator-safety')
  })
})
