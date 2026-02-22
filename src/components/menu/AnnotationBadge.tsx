import type { Annotation } from '../../lib/annotations'

interface Props {
  annotation: Annotation
}

const severityStyles = {
  green: 'border-l-green-500 bg-green-50 text-green-800',
  amber: 'border-l-amber-500 bg-amber-50 text-amber-800',
  red: 'border-l-rose-500 bg-rose-50 text-rose-800',
  teal: 'border-l-teal-500 bg-teal-50 text-teal-800',
}

const severityIcons = {
  green: '\u2713',
  amber: '\u26A0',
  red: '\u26A0',
  teal: '\u2139',
}

export function AnnotationBadge({ annotation }: Props) {
  return (
    <div
      className={`flex items-start gap-1.5 px-2.5 py-1.5 text-xs leading-tight rounded-r border-l-2 ${severityStyles[annotation.severity]}`}
      role="note"
    >
      <span className="flex-shrink-0" aria-hidden="true">
        {severityIcons[annotation.severity]}
      </span>
      <span>{annotation.text}</span>
    </div>
  )
}
