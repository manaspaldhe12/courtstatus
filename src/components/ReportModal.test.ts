import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CourtStatus } from '../models/Location'
import { openReportModal } from './ReportModal'
import { submitReservableFree, submitQueueLength } from '../api/courts'
import { courtsStore } from '../state/courtsStore'

// vi.mock factories are hoisted above all other code in the file, so they
// must not reference outer `const`s (those wouldn't be initialized yet) —
// define the mocks inline, then import the (now-mocked) named exports above.
vi.mock('../api/courts', () => ({ submitReservableFree: vi.fn(), submitQueueLength: vi.fn() }))
vi.mock('../state/courtsStore', () => ({ courtsStore: { refresh: vi.fn() } }))
vi.mock('../state/deviceId', () => ({ getDeviceId: () => 'device-123' }))

const walkupOnly: CourtStatus = {
  id: 'walkup-loc',
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

const reservableOnly: CourtStatus = { ...walkupOnly, id: 'reservable-loc', num_reservable: 1, num_walkup: 0 }
const mixed: CourtStatus = { ...walkupOnly, id: 'mixed-loc', name: 'Dolores Park', num_reservable: 3, num_walkup: 3 }

function currentForm(): HTMLFormElement {
  return document.querySelector('.report-form') as HTMLFormElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('openReportModal — single report-type locations (regression: submit used to silently no-op)', () => {
  it('a walk-up-only location renders no reservable-free field, and the form is valid', () => {
    openReportModal(walkupOnly)
    const form = currentForm()
    expect(form.querySelector('.field-reservable_free')).toBeNull()
    expect(form.querySelector('.field-queue_length')).not.toBeNull()
    expect(form.checkValidity()).toBe(true)
  })

  it('a reservable-only location renders no queue-length field, and the form is valid', () => {
    openReportModal(reservableOnly)
    const form = currentForm()
    expect(form.querySelector('.field-queue_length')).toBeNull()
    expect(form.querySelector('.field-reservable_free')).not.toBeNull()
    expect(form.checkValidity()).toBe(true)
  })

  it('submits a queue_length report and closes the modal on success', async () => {
    vi.mocked(submitQueueLength).mockResolvedValueOnce(undefined)
    openReportModal(walkupOnly)
    const form = currentForm()
    ;(form.querySelector('input[name="queue_length"]') as HTMLInputElement).value = '4'
    form.querySelector('button[type="submit"]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(submitQueueLength).toHaveBeenCalled())

    expect(submitQueueLength).toHaveBeenCalledWith('walkup-loc', 4, 'device-123')
    await vi.waitFor(() => expect(document.querySelector('.modal-overlay')).toBeNull())
    expect(courtsStore.refresh).toHaveBeenCalled()
  })
})

describe('openReportModal — mixed locations (both report types)', () => {
  it('defaults to the reservable-free field active and the queue field disabled', () => {
    openReportModal(mixed)
    const form = currentForm()
    const reservableInput = form.querySelector('.field-reservable_free input') as HTMLInputElement
    const queueInput = form.querySelector('.field-queue_length input') as HTMLInputElement
    expect(reservableInput.disabled).toBe(false)
    expect(queueInput.disabled).toBe(true)
    expect(form.checkValidity()).toBe(true)
  })

  it('switching the select flips which field is active/disabled, and stays valid', () => {
    openReportModal(mixed)
    const form = currentForm()
    const select = form.querySelector('select[name="report_type"]') as HTMLSelectElement
    select.value = 'queue_length'
    select.dispatchEvent(new Event('change'))

    const reservableInput = form.querySelector('.field-reservable_free input') as HTMLInputElement
    const queueInput = form.querySelector('.field-queue_length input') as HTMLInputElement
    expect(reservableInput.disabled).toBe(true)
    expect(queueInput.disabled).toBe(false)
    expect(form.checkValidity()).toBe(true)
  })

  it('submits a reservable_free report with the selected count', async () => {
    vi.mocked(submitReservableFree).mockResolvedValueOnce(undefined)
    openReportModal(mixed)
    const form = currentForm()
    ;(form.querySelector('.field-reservable_free input') as HTMLInputElement).value = '2'
    form.querySelector('button[type="submit"]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(submitReservableFree).toHaveBeenCalledWith('mixed-loc', 2, 'device-123'))
  })
})

describe('openReportModal — interaction and error handling', () => {
  it('closes when Cancel is clicked', () => {
    openReportModal(walkupOnly)
    document.querySelector('.cancel-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.querySelector('.modal-overlay')).toBeNull()
  })

  it('closes when the overlay background (not the modal itself) is clicked', () => {
    openReportModal(walkupOnly)
    const overlay = document.querySelector('.modal-overlay') as HTMLElement
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.querySelector('.modal-overlay')).toBeNull()
  })

  it('does not close when clicking inside the modal content', () => {
    openReportModal(walkupOnly)
    document.querySelector('.modal')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.querySelector('.modal-overlay')).not.toBeNull()
  })

  it('shows the server error message and re-enables Submit on failure, without closing', async () => {
    vi.mocked(submitQueueLength).mockRejectedValueOnce(
      new Error('Please wait a couple minutes before reporting on this location again.'),
    )
    openReportModal(walkupOnly)
    const form = currentForm()
    form.querySelector('button[type="submit"]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() =>
      expect(form.querySelector('.form-error')?.textContent).toBe(
        'Please wait a couple minutes before reporting on this location again.',
      ),
    )
    expect(document.querySelector('.modal-overlay')).not.toBeNull()
    expect((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false)
  })
})
