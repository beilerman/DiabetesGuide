import { useState } from 'react'
import { type1Content, type2Content, type EducationSection } from '../data/education'

const tabs = [
  { key: 'type1', label: 'Type 1', content: type1Content },
  { key: 'type2', label: 'Type 2', content: type2Content },
] as const

export default function DiabetesGuide() {
  const [active, setActive] = useState<'type1' | 'type2'>('type1')
  const current = tabs.find(t => t.key === active)!

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Diabetes Guide</h1>

      <div className="flex gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              active === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {current.content.map((section: EducationSection) => (
          <div key={section.heading}>
            <h2 className="text-lg font-semibold mb-2">{section.heading}</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
              {section.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
