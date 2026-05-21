import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MedicalDisclaimer } from './MedicalDisclaimer'

const GATE_KEY = 'dg_advanced_acknowledged_session'

interface Props {
  toolName: string
  children: ReactNode
}

function hasAcknowledged(): boolean {
  try {
    return sessionStorage.getItem(GATE_KEY) === '1'
  } catch {
    return false
  }
}

function setAcknowledged() {
  try {
    sessionStorage.setItem(GATE_KEY, '1')
  } catch {
    // ignore
  }
}

export function AdvancedToolsGate({ toolName, children }: Props) {
  const [acknowledged, setLocal] = useState(hasAcknowledged)
  const [checks, setChecks] = useState({ notMedical: false, ownProvider: false, ownRisk: false })

  if (acknowledged) {
    return <>{children}</>
  }

  const allChecked = checks.notMedical && checks.ownProvider && checks.ownRisk

  const handleAcknowledge = () => {
    if (!allChecked) return
    setAcknowledged()
    setLocal(true)
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Heading */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-100 rounded-2xl mb-4">
          <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-rose-600 mb-2">Advanced Tool · Restricted</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900">
          Before You Use the {toolName}
        </h1>
        <p className="text-stone-600 mt-3 text-sm max-w-md mx-auto">
          This tool is intended for educational purposes only. Please read and acknowledge the following before continuing.
        </p>
      </div>

      <MedicalDisclaimer variant="strong" title="Important medical safety notice">
        <p className="mb-3">
          DiabetesGuide is <strong>not a medical device</strong>, has not been reviewed
          by the FDA, and is <strong>not a substitute for the clinical judgment</strong> of
          a licensed healthcare professional.
        </p>
        <p className="mb-3">
          <strong>Insulin overdose can be fatal.</strong> Underdosing or miscalculating
          can lead to hypoglycemia, hyperglycemia, diabetic ketoacidosis, hospitalization,
          or death. Carbohydrate counts shown in this app are <strong>estimates</strong>,
          may be inaccurate, and have not been verified by the parks or restaurants.
        </p>
        <p>
          Never adjust your insulin therapy based solely on the output of this tool. Use only
          dose ratios, correction factors, and targets that have been <strong>prescribed to
          you in writing</strong> by your endocrinologist or diabetes care team. When in
          doubt, contact your provider before dosing.
        </p>
      </MedicalDisclaimer>

      {/* Acknowledgments */}
      <div className="mt-6 rounded-2xl bg-white border-2 border-stone-200 p-5 space-y-4">
        <h2 className="font-semibold text-stone-900">I acknowledge that:</h2>
        <Check
          checked={checks.notMedical}
          onChange={v => setChecks(c => ({ ...c, notMedical: v }))}
          label="This tool is educational only — it is not medical advice and not a substitute for a clinician."
        />
        <Check
          checked={checks.ownProvider}
          onChange={v => setChecks(c => ({ ...c, ownProvider: v }))}
          label="I will only use insulin doses and ratios that my own healthcare provider has prescribed for me."
        />
        <Check
          checked={checks.ownRisk}
          onChange={v => setChecks(c => ({ ...c, ownRisk: v }))}
          label="I understand that nutrition values shown are estimates, and that I use this tool entirely at my own risk."
        />
      </div>

      <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        <Link
          to="/"
          className="px-5 py-3 rounded-xl text-center font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors"
        >
          Cancel and go home
        </Link>
        <button
          type="button"
          onClick={handleAcknowledge}
          disabled={!allChecked}
          className={`px-5 py-3 rounded-xl font-semibold transition-colors ${
            allChecked
              ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          }`}
        >
          I understand — continue
        </button>
      </div>

      <p className="text-xs text-stone-500 text-center mt-6 max-w-md mx-auto">
        This acknowledgment will be remembered for the current browser session only. You will see this notice again next time you open the app.
      </p>
    </div>
  )
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 w-5 h-5 rounded border-stone-400 text-rose-600 focus:ring-rose-500 cursor-pointer flex-shrink-0"
      />
      <span className="text-sm text-stone-700 leading-relaxed group-hover:text-stone-900">{label}</span>
    </label>
  )
}
