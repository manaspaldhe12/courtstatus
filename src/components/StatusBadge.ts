export function minutesAgo(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  return mins === 1 ? '1 min ago' : `${mins} min ago`
}

const MINUTES_PER_GROUP = 15

export function reservableStatusHtml(params: {
  numReservable: number
  crowdReportable: boolean
  maxCountFree: number | null
  lastFreeReportAt: string | null
  reservationUrl: string | null
}): string {
  const { numReservable, crowdReportable, maxCountFree, lastFreeReportAt, reservationUrl } = params
  if (numReservable === 0) return ''
  const label = `${numReservable} reservable court${numReservable > 1 ? 's' : ''}`

  if (!crowdReportable) {
    const link = reservationUrl
      ? ` — <a href="${reservationUrl}" target="_blank" rel="noopener">book here</a>`
      : ' — booked through a separate system'
    return `<div class="status status-external">${label}${link}</div>`
  }

  if (maxCountFree != null) {
    if (maxCountFree === 0) {
      return `<div class="status status-taken">${label} — all reported taken (${minutesAgo(lastFreeReportAt)})</div>`
    }
    return `<div class="status status-free">${maxCountFree} of ${numReservable} reported free (${minutesAgo(lastFreeReportAt)})</div>`
  }
  return `<div class="status status-unknown">${label} — no recent "free" report</div>`
}

export function walkupStatusHtml(params: {
  numWalkup: number
  avgQueueLength: number | null
  lastQueueReportAt: string | null
}): string {
  const { numWalkup, avgQueueLength, lastQueueReportAt } = params
  if (numWalkup === 0) return ''
  const label = `${numWalkup} walk-up court${numWalkup > 1 ? 's' : ''}`

  if (avgQueueLength != null) {
    const avg = Math.round(avgQueueLength * 10) / 10
    const etaMin = Math.round(avgQueueLength * MINUTES_PER_GROUP)
    return `<div class="status status-queue">${label} — queue ~${avg} (est. ${etaMin} min wait, ${minutesAgo(lastQueueReportAt)})</div>`
  }
  return `<div class="status status-unknown">${label} — no recent queue report</div>`
}
