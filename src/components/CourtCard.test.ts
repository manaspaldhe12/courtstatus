import { describe, it, expect, vi } from 'vitest'
import { createCourtCard } from './CourtCard'
import type { CourtStatus } from '../models/Location'

const base: CourtStatus = {
  id: 'loc-1',
  slug: 'test-court',
  name: 'Test Court',
  zip: '94100',
  num_reservable: 0,
  num_walkup: 0,
  lights: true,
  restrooms: true,
  reservation_url: null,
  crowd_reportable: true,
  active: true,
  max_count_free: null,
  last_free_report_at: null,
  avg_queue_length: null,
  last_queue_report_at: null,
}

vi.mock('./ReportModal', () => ({ openReportModal: vi.fn() }))

describe('createCourtCard', () => {
  it('renders the name and meta line', () => {
    const card = createCourtCard({ ...base, num_walkup: 1 })
    expect(card.querySelector('h2')?.textContent).toBe('Test Court')
    expect(card.querySelector('.court-meta')?.textContent).toBe('94100 · lights · restrooms')
  })

  it('shows a Report status button for a crowd-reportable location with courts', () => {
    const card = createCourtCard({ ...base, num_walkup: 1 })
    expect(card.querySelector('button.report-btn')).not.toBeNull()
  })

  it('omits the Report button for a non-crowd-reportable location', () => {
    const card = createCourtCard({ ...base, num_reservable: 16, crowd_reportable: false })
    expect(card.querySelector('button.report-btn')).toBeNull()
    expect(card.textContent).toContain('booked through a separate system')
  })

  it('omits the Report button for a location with no courts of either kind', () => {
    const card = createCourtCard(base)
    expect(card.querySelector('button.report-btn')).toBeNull()
  })

  it('opens the report modal for this location when clicked', async () => {
    const { openReportModal } = await import('./ReportModal')
    const location = { ...base, num_walkup: 1 }
    const card = createCourtCard(location)
    ;(card.querySelector('button.report-btn') as HTMLButtonElement).click()
    expect(openReportModal).toHaveBeenCalledWith(location)
  })
})
