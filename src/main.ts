import './style.css'
import { courtsStore } from './state/courtsStore'
import { parseRoute } from './router'
import { mountHomePage } from './pages/HomePage'
import { mountCourtPage } from './pages/CourtPage'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header class="site-header">
    <h1><a href="#/">SF Court Status</a></h1>
  </header>
  <div id="page"></div>
  <footer class="site-footer">
    <p>
      Reports are anonymous and self-reported — treat as a helpful guess, not ground truth.
      Court directory data from
      <a href="https://www.sfrecpark.org/1446/Tennis-Court-Directory" target="_blank" rel="noopener">SF Rec &amp; Park</a>.
    </p>
  </footer>
`

const pageEl = document.querySelector<HTMLDivElement>('#page')!
let unmountCurrentPage: (() => void) | null = null

function render(): void {
  unmountCurrentPage?.()
  const route = parseRoute(location.hash)
  unmountCurrentPage = route.name === 'court' ? mountCourtPage(pageEl, route.slug) : mountHomePage(pageEl)
}

window.addEventListener('hashchange', render)
courtsStore.startPolling()
render()
