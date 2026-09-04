import { supabase } from './supabaseClient'
import type { CourtStatus, ReportHistoryEntry } from '../models/Location'

const HISTORY_LIMIT = 20

export async function fetchCourtStatuses(): Promise<CourtStatus[]> {
  const { data, error } = await supabase
    .from('court_status')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data as CourtStatus[]
}

export async function fetchReportHistory(locationId: string): Promise<ReportHistoryEntry[]> {
  const { data, error } = await supabase
    .from('court_report_history')
    .select('report_type, count_free, queue_length, created_at')
    .eq('location_id', locationId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  if (error) throw error
  return data as ReportHistoryEntry[]
}

export async function submitReservableFree(locationId: string, countFree: number, deviceId: string): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    location_id: locationId,
    report_type: 'reservable_free',
    count_free: countFree,
    device_id: deviceId,
  })
  if (error) throw error
}

export async function submitQueueLength(locationId: string, queueLength: number, deviceId: string): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    location_id: locationId,
    report_type: 'queue_length',
    queue_length: queueLength,
    device_id: deviceId,
  })
  if (error) throw error
}
