export type Severity = 'HIGH' | 'MEDIUM' | 'LOW'

export interface AuditFinding {
  item: string
  restaurant: string
  park: string
  checkName: string
  severity: Severity
  message: string
  currentValue?: string
  suggestedValue?: string
  autoFixable: boolean
}

export interface AutoFix {
  nutritionDataId: string
  item: string
  restaurant: string
  park: string
  field: string
  before: number | null
  after: number
  reason: string
}

export interface AuditPassResult {
  pass: string
  findings: AuditFinding[]
  autoFixes: AutoFix[]
  stats: Record<string, number>
}

export interface AuditReport {
  date: string
  mode: 'daily' | 'weekly'
  passes: AuditPassResult[]
  totalFindings: { high: number; medium: number; low: number }
  totalAutoFixes: number
  graduationDay: number
}

export interface GraduationState {
  mode: 'daily' | 'weekly'
  consecutiveCleanDays: number
  lastAudit: string
  autoFixesApplied: number
  graduationThreshold: number
  history: Array<{
    date: string
    high: number
    medium: number
    low: number
    autoFixes: number
  }>
}

export interface NutData {
  id: string
  calories: number | null
  carbs: number | null
  fat: number | null
  sugar: number | null
  protein: number | null
  fiber: number | null
  sodium: number | null
  cholesterol: number | null
  source: string
  confidence_score: number | null
}

export interface Item {
  id: string
  name: string
  category: string
  is_vegetarian: boolean
  is_fried: boolean
  description: string | null
  restaurant: { name: string; park: { name: string } }
  nutritional_data: NutData[]
}
