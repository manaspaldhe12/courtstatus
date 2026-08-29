import type { CourtStatus } from '../models/Location'
import { createCourtCard } from './CourtCard'

export function renderCourtList(container: HTMLElement, courts: CourtStatus[], error: string | null): void {
  container.innerHTML = ''

  if (error) {
    const errorEl = document.createElement('p')
    errorEl.className = 'load-error'
    errorEl.textContent = `Couldn't load courts: ${error}`
    container.appendChild(errorEl)
    return
  }

  if (courts.length === 0) {
    container.innerHTML = '<p class="loading">Loading courts…</p>'
    return
  }

  for (const court of courts) {
    container.appendChild(createCourtCard(court))
  }
}
