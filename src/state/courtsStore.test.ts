import { describe, it, expect, vi, afterEach } from 'vitest'
import type { CourtStatus } from '../models/Location'

const fixture: CourtStatus = {
  id: 'loc-1',
  slug: 'alamo-square',
  name: 'Alamo Square',
  zip: '94117',
  num_reservable: 0,
  num_walkup: 1,
  lights: false,
  restrooms: true,
  reservation_url: null,
  crowd_reportable: true,
  active: true,
  max_count_free: null,
  last_free_report_at: null,
  avg_queue_length: null,
  last_queue_report_at: null,
}

vi.mock('../api/courts', () => ({
  fetchCourtStatuses: vi.fn(),
}))

// courtsStore is a module-level singleton, so each test gets a clean copy
// via resetModules + a fresh dynamic import.
async function freshStore() {
  vi.resetModules()
  const api = await import('../api/courts')
  const { courtsStore } = await import('./courtsStore')
  return { courtsStore, fetchCourtStatuses: api.fetchCourtStatuses as ReturnType<typeof vi.fn> }
}

describe('courtsStore', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('notifies a new subscriber immediately with the current (initially empty) state', async () => {
    const { courtsStore } = await freshStore()
    const listener = vi.fn()
    courtsStore.subscribe(listener)
    expect(listener).toHaveBeenCalledWith([], null)
  })

  it('refresh() populates courts and clears any prior error on success', async () => {
    const { courtsStore, fetchCourtStatuses } = await freshStore()
    fetchCourtStatuses.mockResolvedValueOnce([fixture])
    const listener = vi.fn()
    courtsStore.subscribe(listener)

    await courtsStore.refresh()

    expect(listener).toHaveBeenLastCalledWith([fixture], null)
  })

  it('refresh() surfaces a message and keeps prior data on failure', async () => {
    const { courtsStore, fetchCourtStatuses } = await freshStore()
    fetchCourtStatuses.mockResolvedValueOnce([fixture])
    await courtsStore.refresh()

    fetchCourtStatuses.mockRejectedValueOnce(new Error('network down'))
    const listener = vi.fn()
    courtsStore.subscribe(listener)
    await courtsStore.refresh()

    expect(listener).toHaveBeenLastCalledWith([fixture], 'network down')
  })

  it('startPolling refreshes immediately and again on each interval while the tab is visible', async () => {
    vi.useFakeTimers()
    const { courtsStore, fetchCourtStatuses } = await freshStore()
    fetchCourtStatuses.mockResolvedValue([fixture])

    courtsStore.startPolling()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchCourtStatuses).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(45_000)
    expect(fetchCourtStatuses).toHaveBeenCalledTimes(2)
  })
})
