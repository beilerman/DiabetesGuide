import { parkAdvice } from '../data/park-advice'

export default function ParkAdvice() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Park Day Advice</h1>

      <div className="space-y-6">
        {parkAdvice.map(section => (
          <div key={section.heading}>
            <h2 className="text-lg font-semibold mb-2">{section.heading}</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
              {section.content.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
