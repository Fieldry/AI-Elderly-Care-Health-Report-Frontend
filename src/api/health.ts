import { requestJson } from '@/api/core'
import type { HealthStatus } from '@/types'

export function getHealthStatus() {
  return requestJson<HealthStatus>('/api/health')
}
