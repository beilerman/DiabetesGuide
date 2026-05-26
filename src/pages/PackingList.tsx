import { useState, useEffect, useMemo } from 'react'
import { buildChecklist, type ChecklistOptions } from '../data/checklist'
import { loadChecklistOptions, normalizeTripDays, saveChecklistOptions } from '../lib/packing-options'

const LS_KEY = 'dg_checklist'
type ChecklistProgress = Record<string, Record<string, boolean>>

function loadChecklistProgress(): ChecklistProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') as unknown
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
    const record = saved as Record<string, unknown>
    const values = Object.values(record)
    if (values.every(value => typeof value === 'boolean')) {
      return { t1: record as Record<string, boolean> }
    }
    return record as ChecklistProgress
  } catch {
    return {}
  }
}

function getProfileKey(opts: ChecklistOptions): string {
  const profile = [
    opts.t1 ? 't1' : null,
    opts.t2 ? 't2' : null,
    opts.pump ? 'pump' : null,
    opts.cgm ? 'cgm' : null,
    opts.child ? 'child' : null,
  ].filter((value): value is string => value != null)

  return profile.length > 0 ? profile.join('-') : 'general'
}

function getChecklistItemId(item: string): string {
  return item
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function PackingList() {
  const [opts, setOpts] = useState<ChecklistOptions>(loadChecklistOptions)

  const sections = useMemo(() => buildChecklist(opts), [opts])
  const profileKey = useMemo(() => getProfileKey(opts), [opts])

  const [checked, setChecked] = useState<ChecklistProgress>(loadChecklistProgress)
  const checkedForProfile = checked[profileKey] ?? {}

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(checked))
  }, [checked])

  useEffect(() => {
    saveChecklistOptions(opts)
  }, [opts])

  const toggle = (item: string) => {
    const itemId = getChecklistItemId(item)
    setChecked(prev => {
      const currentProfile = prev[profileKey] ?? {}
      return {
        ...prev,
        [profileKey]: {
          ...currentProfile,
          [itemId]: !currentProfile[itemId],
        },
      }
    })
  }

  const resetChecklist = () => {
    if (!window.confirm('Reset checklist progress for this profile?')) return
    setChecked(prev => {
      const next = { ...prev }
      delete next[profileKey]
      return next
    })
  }

  const getSectionProgress = (items: string[]) => {
    const complete = items.filter(item => checkedForProfile[getChecklistItemId(item)]).length
    return { complete, total: items.length }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Packing Checklist</h1>
          <p className="mt-1 text-sm text-stone-500">Saved on this device</p>
        </div>
        <div className="print-hidden flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetChecklist}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:border-rose-300 hover:text-rose-700"
          >
            Reset checklist
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-teal-700 bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Print / Export PDF
          </button>
        </div>
      </div>

      <div className="print-hidden flex flex-wrap gap-4 mb-6 rounded-lg border bg-white p-4">
        {(['t1', 't2', 'pump', 'cgm', 'child'] as const).map(key => (
          <label key={key} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={opts[key]}
              onChange={() => setOpts(p => ({ ...p, [key]: !p[key] }))}
            />
            {{ t1: 'Type 1', t2: 'Type 2', pump: 'Pump', cgm: 'CGM', child: 'Child' }[key]}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          Trip days:
          <input
            type="number"
            min={1}
            max={30}
            step={1}
            inputMode="numeric"
            className="w-16 rounded border px-2 py-1"
            value={opts.tripDays}
            onChange={e => setOpts(p => ({ ...p, tripDays: normalizeTripDays(e.target.valueAsNumber) }))}
          />
        </label>
      </div>

      <div className="space-y-6">
        {sections.map(section => {
          const progress = getSectionProgress(section.items)

          return (
            <div key={section.title}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-stone-900">
                  {section.title} {progress.complete}/{progress.total}
                </h2>
                <progress
                  className="h-2 w-28"
                  value={progress.complete}
                  max={progress.total}
                  aria-label={`${section.title} progress ${progress.complete} of ${progress.total}`}
                />
              </div>
              <ul className="space-y-1">
                {section.items.map(item => {
                  const itemId = getChecklistItemId(item)
                  const isChecked = !!checkedForProfile[itemId]

                  return (
                    <li key={itemId}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={isChecked}
                          onChange={() => toggle(item)}
                        />
                        <span className={isChecked ? 'text-gray-400 line-through' : ''}>
                          {item}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
