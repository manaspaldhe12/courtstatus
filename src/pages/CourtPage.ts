import type { CourtStatus, ReportHistoryEntry } from '../models/Location'
import { courtsStore } from '../state/courtsStore'
import { fetchReportHistory } from '../api/courts'
import { courtStatusBodyHtml } from '../components/CourtCard'
import { openReportModal } from '../components/ReportModal'
import { minutesAgo } from '../components/StatusBadge'

export function historyEntryHtml(entry: ReportHistoryEntry): string {
  const when = minutesAgo(entry.created_at) || 'just now'
  if (entry.report_type === 'reservable_free') {
    const count = entry.count_free ?? 0
    return `<li>${count} court${count === 1 ? '' : 's'} reported free — ${when}</li>`
  }
  return `<li>Queue length ${entry.queue_length} reported — ${when}</li>`
}

export function mountCourtPage(container: HTMLElement, slug: string): () => void {
  let historyToken = 0

  async function renderHistoryFor(location: CourtStatus): Promise<void> {
    const token = ++historyToken
    const listEl = container.querySelector('#report-history')
    if (!listEl) return
    try {
      const history = await fetchReportHistory(location.id)
      if (token !== historyToken) return // superseded by a newer poll tick
      listEl.innerHTML = history.length
        ? history.map(historyEntryHtml).join('')
        : '<li class="muted">No reports in the last 7 days.</li>'
    } catch {
      if (token !== historyToken) return
      listEl.innerHTML = '<li class="muted">Couldn’t load report history.</li>'
    }
  }

  function render(courts: CourtStatus[], error: string | null): void {
    const location = courts.find((c) => c.slug === slug)

    if (!location) {
      container.innerHTML = `
        <p class="back-link"><a href="#/">← All courts</a></p>
        <p>${error ? `Couldn't load courts: ${error}` : 'Court not found.'}</p>
      `
      return
    }

    const showReportButton = location.crowd_reportable && (location.num_reservable > 0 || location.num_walkup > 0)

    container.innerHTML = `
      <p class="back-link"><a href="#/">← All courts</a></p>
      <article class="court-card court-detail">
        ${courtStatusBodyHtml(location, `<h2>${location.name}</h2>`)}
        ${showReportButton ? '<button type="button" class="btn-primary report-btn">Report status</button>' : ''}
      </article>
      <section class="report-history-section">
        <h3>Recent reports</h3>
        <ul id="report-history" class="report-history">
          <li class="muted">Loading…</li>
        </ul>
      </section>
    `

    container.querySelector('.report-btn')?.addEventListener('click', () => openReportModal(location))
    void renderHistoryFor(location)
  }

  return courtsStore.subscribe(render)
}
