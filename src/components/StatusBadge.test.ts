import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { minutesAgo, reservableStatusHtml, walkupStatusHtml } from './StatusBadge'

describe('minutesAgo', () => {
  const NOW = new Date('2026-01-01T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an empty string for null', () => {
    expect(minutesAgo(null)).toBe('')
  })

  it('returns "just now" for under a minute', () => {
    expect(minutesAgo(new Date(NOW.getTime() - 10_000).toISOString())).toBe('just now')
  })

  it('singularizes "1 min ago"', () => {
    expect(minutesAgo(new Date(NOW.getTime() - 60_000).toISOString())).toBe('1 min ago')
  })

  it('pluralizes multiple minutes', () => {
    expect(minutesAgo(new Date(NOW.getTime() - 12 * 60_000).toISOString())).toBe('12 min ago')
  })
})

describe('reservableStatusHtml', () => {
  it('renders nothing for a location with no reservable courts', () => {
    expect(
      reservableStatusHtml({
        numReservable: 0,
        crowdReportable: true,
        maxCountFree: null,
        lastFreeReportAt: null,
        reservationUrl: null,
      }),
    ).toBe('')
  })

  it('shows "no recent report" when there is no unexpired free report', () => {
    const html = reservableStatusHtml({
      numReservable: 3,
      crowdReportable: true,
      maxCountFree: null,
      lastFreeReportAt: null,
      reservationUrl: null,
    })
    expect(html).toContain('3 reservable courts')
    expect(html).toContain('no recent "free" report')
  })

  it('shows the reported free count and how long ago', () => {
    const html = reservableStatusHtml({
      numReservable: 4,
      crowdReportable: true,
      maxCountFree: 2,
      lastFreeReportAt: new Date().toISOString(),
      reservationUrl: null,
    })
    expect(html).toContain('2 of 4 reported free')
    expect(html).toContain('status-free')
  })

  it('distinguishes "0 free reported" (all taken) from "no report at all" (regression: 0 is falsy)', () => {
    const allTaken = reservableStatusHtml({
      numReservable: 3,
      crowdReportable: true,
      maxCountFree: 0,
      lastFreeReportAt: new Date().toISOString(),
      reservationUrl: null,
    })
    expect(allTaken).toContain('all reported taken')
    expect(allTaken).toContain('status-taken')
    expect(allTaken).not.toContain('no recent "free" report')

    const noReport = reservableStatusHtml({
      numReservable: 3,
      crowdReportable: true,
      maxCountFree: null,
      lastFreeReportAt: null,
      reservationUrl: null,
    })
    expect(noReport).toContain('no recent "free" report')
  })

  it('renders a booking link for external (non-crowd-reportable) locations', () => {
    const html = reservableStatusHtml({
      numReservable: 16,
      crowdReportable: false,
      maxCountFree: null,
      lastFreeReportAt: null,
      reservationUrl: 'https://example.com/book',
    })
    expect(html).toContain('status-external')
    expect(html).toContain('href="https://example.com/book"')
    expect(html).not.toContain('Report')
  })

  it('falls back to plain text when an external location has no reservation_url', () => {
    const html = reservableStatusHtml({
      numReservable: 16,
      crowdReportable: false,
      maxCountFree: null,
      lastFreeReportAt: null,
      reservationUrl: null,
    })
    expect(html).toContain('booked through a separate system')
    expect(html).not.toContain('<a')
  })
})

describe('walkupStatusHtml', () => {
  it('renders nothing for a location with no walk-up courts', () => {
    expect(walkupStatusHtml({ numWalkup: 0, avgQueueLength: 3, lastQueueReportAt: new Date().toISOString() })).toBe('')
  })

  it('shows "no recent report" when there is no unexpired queue report', () => {
    const html = walkupStatusHtml({ numWalkup: 1, avgQueueLength: null, lastQueueReportAt: null })
    expect(html).toContain('no recent queue report')
  })

  it('computes an ETA as queueLength / numWalkup rounds of ~60 minutes each', () => {
    // 2 courts turning over in parallel clear a queue of 2 in about one
    // 60-minute round, not the same wait a single court would have.
    const twoCourts = walkupStatusHtml({
      numWalkup: 2,
      avgQueueLength: 2,
      lastQueueReportAt: new Date().toISOString(),
    })
    expect(twoCourts).toContain('queue ~2')
    expect(twoCourts).toContain('est. 60 min wait')

    const oneCourt = walkupStatusHtml({
      numWalkup: 1,
      avgQueueLength: 2,
      lastQueueReportAt: new Date().toISOString(),
    })
    expect(oneCourt).toContain('est. 120 min wait')
  })

  it('rounds the displayed average to one decimal place', () => {
    const html = walkupStatusHtml({
      numWalkup: 1,
      avgQueueLength: 2 / 3,
      lastQueueReportAt: new Date().toISOString(),
    })
    expect(html).toContain('queue ~0.7')
  })
})
