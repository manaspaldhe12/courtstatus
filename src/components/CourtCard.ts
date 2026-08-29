import type { CourtStatus } from '../models/Location'
import { reservableStatusHtml, walkupStatusHtml } from './StatusBadge'
import { openReportModal } from './ReportModal'

export function createCourtCard(court: CourtStatus): HTMLElement {
  const card = document.createElement('article')
  card.className = 'court-card'

  const meta: string[] = []
  if (court.zip) meta.push(court.zip)
  if (court.lights) meta.push('lights')
  if (court.restrooms) meta.push('restrooms')

  card.innerHTML = `
    <div class="court-card-header">
      <h2>${court.name}</h2>
      <div class="court-meta">${meta.join(' · ')}</div>
    </div>
    ${reservableStatusHtml({
      numReservable: court.num_reservable,
      crowdReportable: court.crowd_reportable,
      maxCountFree: court.max_count_free,
      lastFreeReportAt: court.last_free_report_at,
      reservationUrl: court.reservation_url,
    })}
    ${walkupStatusHtml({
      numWalkup: court.num_walkup,
      avgQueueLength: court.avg_queue_length,
      lastQueueReportAt: court.last_queue_report_at,
    })}
  `

  if (court.crowd_reportable && (court.num_reservable > 0 || court.num_walkup > 0)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'btn-primary report-btn'
    button.textContent = 'Report status'
    button.addEventListener('click', () => openReportModal(court))
    card.appendChild(button)
  }

  return card
}
