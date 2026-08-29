const STORAGE_KEY = 'courtstatus_device_id'

// Anonymous per-browser id, sent with reports only for server-side throttling
// (see reports_before_insert in the migration) — never displayed or read back.
export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}
