import { useState, useEffect, useMemo } from 'react'
import { buildChecklist, type ChecklistOptions } from '../data/checklist'

const LS_KEY = 'dg_checklist'

export default function PackingList() {
  const [opts, setOpts] = useState<ChecklistOptions>({
    t1: true, t2: false, pump: false, cgm: false, child: false, tripDays: 3,
  })

  const sections = useMemo(() => buildChecklist(opts), [opts])

  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(checked))
  }, [checked])

  const toggle = (item: string) =>
    setChecked(prev => ({ ...prev, [item]: !prev[item] }))

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Packing Checklist</h1>

      <div className="flex flex-wrap gap-4 mb-6 rounded-lg border bg-white p-4">
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
            className="w-16 rounded border px-2 py-1"
            value={opts.tripDays}
            onChange={e => setOpts(p => ({ ...p, tripDays: Math.max(1, Number(e.target.value)) }))}
          />
        </label>
      </div>

      <div className="space-y-6">
        {sections.map(section => (
          <div key={section.title}>
            <h2 className="text-lg font-semibold mb-2">{section.title}</h2>
            <ul className="space-y-1">
              {section.items.map(item => (
                <li key={item}>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={!!checked[item]}
                      onChange={() => toggle(item)}
                    />
                    <span className={checked[item] ? 'line-through text-gray-400' : ''}>
                      {item}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
