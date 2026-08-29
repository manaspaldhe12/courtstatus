import { describe, it, expect, beforeEach } from 'vitest'
import { getDeviceId } from './deviceId'

describe('getDeviceId', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('generates and persists a device id on first call', () => {
    const id = getDeviceId()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(localStorage.getItem('courtstatus_device_id')).toBe(id)
  })

  it('returns the same id on subsequent calls', () => {
    const first = getDeviceId()
    const second = getDeviceId()
    expect(second).toBe(first)
  })

  it('reuses an id already present in localStorage', () => {
    localStorage.setItem('courtstatus_device_id', 'existing-id')
    expect(getDeviceId()).toBe('existing-id')
  })
})
