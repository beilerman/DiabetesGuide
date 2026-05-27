export interface BuildInfo {
  version: string
  gitSha: string
  buildDate: string
  catalogSnapshotDate: string
}

const fallbackBuildInfo: BuildInfo = {
  version: 'v1.0',
  gitSha: 'local',
  buildDate: new Date().toISOString(),
  catalogSnapshotDate: 'unknown',
}

export const buildInfo: BuildInfo = typeof __APP_BUILD_INFO__ === 'undefined'
  ? fallbackBuildInfo
  : __APP_BUILD_INFO__

export function formatBuildDate(value: string): string {
  if (value === 'unknown') return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
