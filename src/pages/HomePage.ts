import { courtsStore } from '../state/courtsStore'
import { renderCourtList } from '../components/CourtList'

export function mountHomePage(container: HTMLElement): () => void {
  container.innerHTML = `
    <p class="tagline">Crowd-reported tennis court availability, updated by players like you.</p>
    <main id="court-list" class="court-list"></main>
  `
  const listEl = container.querySelector('#court-list') as HTMLElement
  return courtsStore.subscribe((courts, error) => renderCourtList(listEl, courts, error))
}
