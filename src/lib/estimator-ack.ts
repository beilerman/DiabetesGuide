export const ESTIMATOR_ACK_KEY = 'dg_estimator_acknowledged_v1'

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function hasEstimatorAcknowledgement(): boolean {
  return getStorage()?.getItem(ESTIMATOR_ACK_KEY) === 'true'
}

export function saveEstimatorAcknowledgement(): void {
  getStorage()?.setItem(ESTIMATOR_ACK_KEY, 'true')
}
