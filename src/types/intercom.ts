export interface IntercomAttendance {
  id: string;
  intercom_id: string;
  date: string;
  id_user: string;
  name: string;
  email: string;
  away_mode_enabled: number;
  away_mode_reassign: number;
  away_status_reason: string | null;
  away_time_minutes: number | null;
  created_at: string;
}

export interface TimelineEvent {
  timestamp: string;
  type: 'entry' | 'exit';
  reason: string | null;
  durationMinutes?: number;
}

export interface AttendanceSummary {
  id_user: string;
  name: string;
  email: string;
  totalPresentMinutes: number;
  totalAwayMinutes: number;
  currentStatus: 'online' | 'away';
  currentReason: string | null;
  availabilityPercent: number;
  timeline: TimelineEvent[];
}
