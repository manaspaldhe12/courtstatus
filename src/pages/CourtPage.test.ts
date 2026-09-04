import { describe, it, expect, vi, afterEach } from 'vitest'
import type { CourtStatus, ReportHistoryEntry } from '../models/Location'
import { mountCourtPage } from './CourtPage'
import { courtsStore } from '../state/courtsStore'
import { fetchReportHistory } from '../api/courts'
import { openReportModal } from '../components/ReportModal'

vi.mock('../state/courtsStore', () => ({ courtsStore: { subscribe: vi.fn(() => () => {}) } }))
vi.mock('../api/courts', () => ({ fetchReportHistory: vi.fn() }))
vi.mock('../components/ReportModal', () => ({ openReportModal: vi.fn() }))

type Listener = (courts: CourtStatus[], error: string | null) => void

function latestListener(): Listener {
  const calls = vi.mocked(courtsStore.subscribe).mock.calls
  return calls[calls.length - 1][0] as Listener
}

const walkupOnly: CourtStatus = {
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
  avg_queue_length: 2,
  last_queue_report_at: new Date().toISOString(),
}

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('mountCourtPage', () => {
  it('shows "Court not found." when no court matches the slug', () => {
    const container = document.createElement('div')
    mountCourtPage(container, 'does-not-exist')
    latestListener()([walkupOnly], null)

    expect(container.textContent).toContain('Court not found.')
    expect(container.querySelector('a[href="#/"]')).not.toBeNull()
  })

  it('surfaces the store error instead of "not found" when the list failed to load', () => {
    const container = document.createElement('div')
    mountCourtPage(container, 'alamo-square')
    latestListener()([], 'network down')

    expect(container.textContent).toContain("Couldn't load courts: network down")
  })

  it('renders status and wires the report button for a matching, reportable court', () => {
    vi.mocked(fetchReportHistory).mockResolvedValue([])
    const container = document.createElement('div')
    mountCourtPage(container, 'alamo-square')
    latestListener()([walkupOnly], null)

    expect(container.querySelector('h2')?.textContent).toBe('Alamo Square')
    expect(container.textContent).toContain('queue ~2')

    const button = container.querySelector('button.report-btn') as HTMLButtonElement
    expect(button).not.toBeNull()
    button.click()
    expect(openReportModal).toHaveBeenCalledWith(walkupOnly)
  })

  it('omits the report button for a non-crowd-reportable court', () => {
    vi.mocked(fetchReportHistory).mockResolvedValue([])
    const container = document.createElement('div')
    mountCourtPage(container, 'goldman')
    latestListener()([{ ...walkupOnly, slug: 'goldman', crowd_reportable: false, num_reservable: 16, num_walkup: 0 }], null)

    expect(container.querySelector('button.report-btn')).toBeNull()
  })

  it('renders the fetched report history', async () => {
    const entries: ReportHistoryEntry[] = [
      { report_type: 'queue_length', count_free: null, queue_length: 3, created_at: new Date().toISOString() },
    ]
    vi.mocked(fetchReportHistory).mockResolvedValue(entries)
    const container = document.createElement('div')
    mountCourtPage(container, 'alamo-square')
    latestListener()([walkupOnly], null)

    await vi.waitFor(() =>
      expect(container.querySelector('#report-history')?.textContent).toContain('Queue length 3 reported'),
    )
  })

  it('shows a placeholder when there is no report history', async () => {
    vi.mocked(fetchReportHistory).mockResolvedValue([])
    const container = document.createElement('div')
    mountCourtPage(container, 'alamo-square')
    latestListener()([walkupOnly], null)

    await vi.waitFor(() =>
      expect(container.querySelector('#report-history')?.textContent).toContain('No reports in the last 7 days.'),
    )
  })

  it('ignores a stale history response that resolves after a newer poll tick already replaced it', async () => {
    let resolveFirst!: (entries: ReportHistoryEntry[]) => void
    const first = new Promise<ReportHistoryEntry[]>((resolve) => {
      resolveFirst = resolve
    })
    vi.mocked(fetchReportHistory).mockReturnValueOnce(first)

    const container = document.createElement('div')
    mountCourtPage(container, 'alamo-square')
    const listener = latestListener()
    listener([walkupOnly], null) // kicks off the slow first fetch

    vi.mocked(fetchReportHistory).mockResolvedValueOnce([
      { report_type: 'queue_length', count_free: null, queue_length: 9, created_at: new Date().toISOString() },
    ])
    listener([walkupOnly], null) // a newer poll tick starts a fetch that resolves first

    await vi.waitFor(() =>
      expect(container.querySelector('#report-history')?.textContent).toContain('Queue length 9 reported'),
    )

    resolveFirst([{ report_type: 'queue_length', count_free: null, queue_length: 1, created_at: new Date().toISOString() }])
    await new Promise((r) => setTimeout(r, 0))

    expect(container.querySelector('#report-history')?.textContent).toContain('Queue length 9 reported')
    expect(container.querySelector('#report-history')?.textContent).not.toContain('Queue length 1 reported')
  })
})
