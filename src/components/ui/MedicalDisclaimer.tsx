import type { ReactNode } from 'react'

type Variant = 'subtle' | 'standard' | 'strong'

const VARIANT_STYLES: Record<Variant, { container: string; icon: string; title: string; body: string }> = {
  subtle: {
    container: 'bg-amber-50 border-amber-200',
    icon: 'text-amber-500 bg-amber-100',
    title: 'text-amber-900',
    body: 'text-amber-800',
  },
  standard: {
    container: 'bg-amber-50 border-amber-300',
    icon: 'text-amber-600 bg-amber-100',
    title: 'text-amber-900',
    body: 'text-amber-800',
  },
  strong: {
    container: 'bg-rose-50 border-rose-300',
    icon: 'text-rose-600 bg-rose-100',
    title: 'text-rose-900',
    body: 'text-rose-800',
  },
}

interface Props {
  variant?: Variant
  title?: string
  children: ReactNode
  className?: string
}

export function MedicalDisclaimer({ variant = 'standard', title, children, className = '' }: Props) {
  const styles = VARIANT_STYLES[variant]
  return (
    <div
      role="note"
      className={`rounded-2xl border-2 p-4 ${styles.container} ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${styles.icon}`} aria-hidden="true">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          {title && <p className={`font-bold text-sm uppercase tracking-wide mb-1 ${styles.title}`}>{title}</p>}
          <div className={`text-sm leading-relaxed ${styles.body}`}>{children}</div>
        </div>
      </div>
    </div>
  )
}
