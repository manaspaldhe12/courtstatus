import './style.css'
import { courtsStore } from './state/courtsStore'
import { renderCourtList } from './components/CourtList'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header class="site-header">
    <h1>SF Court Status</h1>
    <p class="tagline">Crowd-reported tennis court availability, updated by players like you.</p>
  </header>
  <main id="court-list" class="court-list"></main>
  <footer class="site-footer">
    <p>
      Reports are anonymous and self-reported — treat as a helpful guess, not ground truth.
      Court directory data from
      <a href="https://www.sfrecpark.org/1446/Tennis-Court-Directory" target="_blank" rel="noopener">SF Rec &amp; Park</a>.
    </p>
  </footer>
`

const listEl = document.querySelector<HTMLDivElement>('#court-list')!
courtsStore.subscribe((courts, error) => renderCourtList(listEl, courts, error))
courtsStore.startPolling()
