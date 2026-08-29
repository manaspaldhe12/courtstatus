// Integration test: wires the real CourtList + CourtCard + ReportModal +
// courtsStore together, mocking only the true external boundary
// (api/courts.ts, i.e. Supabase). Exercises the full user-visible flow:
// load -> report -> UI reflects the new status -> UI reflects it decaying
// back to "no report" once the (mocked) server stops returning one.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CourtStatus } from '../models/Location'
import { fetchCourtStatuses, submitQueueLength } from '../api/courts'
import { renderCourtList } from '../components/CourtList'
import { courtsStore } from '../state/courtsStore'

vi.mock('../api/courts', () => ({ fetchCourtStatuses: vi.fn(), submitQueueLength: vi.fn(), submitReservableFree: vi.fn() }))
vi.mock('../state/deviceId', () => ({ getDeviceId: () => 'device-abc' }))

const alamoSquare: CourtStatus = {
  id: 'alamo-square-id',
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

beforeEach(() => {
  document.body.innerHTML = '<div id="court-list"></div>'
  vi.clearAllMocks()
})

function listEl(): HTMLElement {
  return document.querySelector('#court-list') as HTMLElement
}

function reportButtonFor(name: string): HTMLButtonElement {
  const card = [...document.querySelectorAll('.court-card')].find((c) => c.querySelector('h2')?.textContent === name)!
  return card.querySelector('button.report-btn') as HTMLButtonElement
}

describe('report flow, end to end through the UI', () => {
  it('renders "no recent queue report", then updates after a successful report, then reverts once the server stops returning it (TTL decay)', async () => {
    vi.mocked(fetchCourtStatuses).mockResolvedValueOnce([alamoSquare])
    courtsStore.subscribe((courts, error) => renderCourtList(listEl(), courts, error))
    await courtsStore.refresh()

    expect(listEl().textContent).toContain('no recent queue report')

    // Submit a queue-length report through the real modal.
    vi.mocked(submitQueueLength).mockResolvedValueOnce(undefined)
    vi.mocked(fetchCourtStatuses).mockResolvedValueOnce([
      { ...alamoSquare, avg_queue_length: 3, last_queue_report_at: new Date().toISOString() },
    ])

    reportButtonFor('Alamo Square').click()
    const form = document.querySelector('.report-form') as HTMLFormElement
    ;(form.querySelector('input[name="queue_length"]') as HTMLInputElement).value = '3'
    form.querySelector('button[type="submit"]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(submitQueueLength).toHaveBeenCalledWith('alamo-square-id', 3, 'device-abc'))
    await vi.waitFor(() => expect(listEl().textContent).toContain('queue ~3'))
    expect(listEl().textContent).not.toContain('no recent queue report')

    // Simulate the next poll tick after the DB view's TTL has expired the
    // report server-side: the mocked API now reports no unexpired report.
    vi.mocked(fetchCourtStatuses).mockResolvedValueOnce([alamoSquare])
    await courtsStore.refresh()

    expect(listEl().textContent).toContain('no recent queue report')
    expect(listEl().textContent).not.toContain('queue ~3')
  })
})
