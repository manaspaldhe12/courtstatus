export interface CourtStatus {
  id: string
  slug: string
  name: string
  zip: string | null
  num_reservable: number
  num_walkup: number
  lights: boolean
  restrooms: boolean
  reservation_url: string | null
  crowd_reportable: boolean
  active: boolean
  max_count_free: number | null
  last_free_report_at: string | null
  avg_queue_length: number | null
  last_queue_report_at: string | null
}

export interface ReportHistoryEntry {
  report_type: 'reservable_free' | 'queue_length'
  count_free: number | null
  queue_length: number | null
  created_at: string
}
