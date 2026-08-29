import type { CourtStatus } from '../models/Location'
import { submitReservableFree, submitQueueLength } from '../api/courts'
import { getDeviceId } from '../state/deviceId'
import { courtsStore } from '../state/courtsStore'

type ReportType = 'reservable_free' | 'queue_length'

export function openReportModal(location: CourtStatus): void {
  const availableTypes: ReportType[] = []
  if (location.num_reservable > 0) availableTypes.push('reservable_free')
  if (location.num_walkup > 0) availableTypes.push('queue_length')
  if (availableTypes.length === 0) return

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const closeModal = () => overlay.remove()

  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Report status for ${location.name}">
      <h3>Report status — ${location.name}</h3>
      <form class="report-form">
        ${
          availableTypes.length > 1
            ? `<label>What are you reporting?
                <select name="report_type">
                  ${availableTypes.includes('reservable_free') ? '<option value="reservable_free">A reserved court is free</option>' : ''}
                  ${availableTypes.includes('queue_length') ? '<option value="queue_length">Walk-up queue length</option>' : ''}
                </select>
              </label>`
            : `<input type="hidden" name="report_type" value="${availableTypes[0]}" />`
        }
        <div class="field field-reservable_free">
          <label>Reservable courts free right now
            <input type="number" name="count_free" min="0" max="${location.num_reservable}" value="1" />
          </label>
        </div>
        <div class="field field-queue_length">
          <label>People/groups waiting for a walk-up court
            <input type="number" name="queue_length" min="0" max="30" value="0" />
          </label>
        </div>
        <p class="form-error" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary cancel-btn">Cancel</button>
          <button type="submit" class="btn-primary">Submit</button>
        </div>
      </form>
    </div>
  `

  const form = overlay.querySelector('.report-form') as HTMLFormElement
  const select = form.querySelector('select[name="report_type"]') as HTMLSelectElement | null
  const reservableField = form.querySelector('.field-reservable_free') as HTMLElement
  const queueField = form.querySelector('.field-queue_length') as HTMLElement
  const errorEl = form.querySelector('.form-error') as HTMLElement

  const syncFields = () => {
    const type = (select?.value ?? availableTypes[0]) as ReportType
    reservableField.style.display = type === 'reservable_free' ? '' : 'none'
    queueField.style.display = type === 'queue_length' ? '' : 'none'
  }
  syncFields()
  select?.addEventListener('change', syncFields)

  overlay.querySelector('.cancel-btn')?.addEventListener('click', closeModal)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal()
  })
  document.addEventListener('keydown', function onKeydown(event) {
    if (event.key === 'Escape') {
      closeModal()
      document.removeEventListener('keydown', onKeydown)
    }
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorEl.textContent = ''
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement
    submitBtn.disabled = true

    const formData = new FormData(form)
    const type = String(formData.get('report_type')) as ReportType
    const deviceId = getDeviceId()

    try {
      if (type === 'reservable_free') {
        await submitReservableFree(location.id, Number(formData.get('count_free')), deviceId)
      } else {
        await submitQueueLength(location.id, Number(formData.get('queue_length')), deviceId)
      }
      closeModal()
      void courtsStore.refresh()
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : 'Failed to submit report.'
      submitBtn.disabled = false
    }
  })

  document.body.appendChild(overlay)
  ;(form.querySelector('input, select') as HTMLElement | null)?.focus()
}
