import { fetchCourtStatuses } from '../api/courts'
import type { CourtStatus } from '../models/Location'

type Listener = (courts: CourtStatus[], error: string | null) => void

const POLL_INTERVAL_MS = 45_000

class CourtsStore {
  private courts: CourtStatus[] = []
  private lastError: string | null = null
  private listeners = new Set<Listener>()
  private timer: number | undefined

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.courts, this.lastError)
    return () => this.listeners.delete(listener)
  }

  async refresh(): Promise<void> {
    try {
      this.courts = await fetchCourtStatuses()
      this.lastError = null
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Failed to load courts.'
    }
    for (const listener of this.listeners) listener(this.courts, this.lastError)
  }

  startPolling(): void {
    void this.refresh()
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh()
    }, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.refresh()
    })
  }
}

export const courtsStore = new CourtsStore()
