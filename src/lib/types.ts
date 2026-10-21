export type Role = 'high_command' | 'chair' | 'pending';
export type SessionStatus = 'not_started' | 'in_session' | 'suspended' | 'adjourned';
export type Mode = 'formal' | 'moderated' | 'unmoderated' | 'voting';
export type Attendance = 'absent' | 'present' | 'present_and_voting';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Settings {
  id: number;
  conference_name: string;
  short_name: string;
  tagline: string;
  conference_dates: string;
  venue: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  default_speaking_sec: number;
  explanation_points: number;
}

export interface Committee {
  id: string;
  name: string;
  abbreviation: string;
  topic: string;
  description: string | null;
  created_at: string;
}

export interface TimerState {
  duration_ms: number;
  remaining_ms: number;
  running: boolean;
  started_at: string | null;
}

export interface CommitteeState {
  committee_id: string;
  status: SessionStatus;
  mode: Mode;
  current_speaker_id: string | null;
  speaker_timer: TimerState;
  caucus_timer: TimerState;
  speaking_time_sec: number;
  caucus_topic: string | null;
  caucus_speaking_sec: number | null;
  session_started_at: string | null;
  current_session_id: string | null;
  updated_at: string;
}

export interface Delegate {
  id: string;
  committee_id: string;
  name: string;
  country: string;
  attendance: Attendance;
}

export interface SpeakerEntry {
  id: string;
  committee_id: string;
  delegate_id: string;
  position: number;
  status: 'queued' | 'speaking' | 'spoke';
  source: 'gsl' | 'caucus';
  created_at: string;
}

export interface EventRow {
  id: string;
  committee_id: string;
  kind: 'motion' | 'point';
  type: string;
  delegate_id: string | null;
  details: string | null;
  duration_sec: number | null;
  speaking_sec: number | null;
  status: string;
  reason: string | null;
  session_id: string | null;
  created_at: string;
}

export interface VoteRow {
  id: string;
  committee_id: string;
  title: string;
  kind: 'procedural' | 'substantive';
  threshold: 'simple' | 'two_thirds';
  status: 'open' | 'closed';
  result: 'passed' | 'failed' | null;
  final_for: number | null;
  final_against: number | null;
  final_abstain: number | null;
  label: string | null;
  session_id: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface VoteRecord {
  id: string;
  vote_id: string;
  committee_id: string;
  delegate_id: string;
  choice: 'for' | 'against' | 'abstain';
  explanation: 'requested' | 'given' | null;
}

export interface DocRow {
  id: string;
  committee_id: string | null;
  title: string;
  kind: 'draft_resolution' | 'crisis' | 'other';
  file_path: string;
  uploaded_by: string | null;
  archive_id: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  message: string;
  severity: 'info' | 'urgent';
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface CommitteeAnalytics {
  committee_id: string;
  name: string;
  abbreviation: string;
  topic: string;
  status: SessionStatus;
  mode: Mode;
  session_started_at: string | null;
  delegates_total: number;
  delegates_present: number;
  speakers_queued: number;
  speeches_given: number;
  motions_total: number;
  motions_passed: number;
  points_total: number;
  votes_total: number;
  votes_open: number;
  sessions_total: number;
}

export interface ArchiveRecord {
  id: string;
  label: string;
  counts: Record<string, number>;
  created_at: string;
}

export interface SessionRow {
  id: string;
  committee_id: string;
  number: number;
  opened_at: string;
  closed_at: string | null;
}

export interface SessionAttendance {
  id: string;
  session_id: string;
  committee_id: string;
  delegate_id: string;
  attendance: Attendance;
  late: boolean;
}

export interface Absence {
  id: string;
  committee_id: string;
  session_id: string | null;
  delegate_id: string;
  left_at: string;
  returned_at: string | null;
}

export interface ParticipationEntry {
  id: string;
  committee_id: string;
  session_id: string;
  delegate_id: string;
  category: 'sl_speech' | 'sl_question' | 'mc' | 'umc' | 'wp' | 'rp';
  level_key: string;
  score: number;
  label: string | null;
  created_at: string;
}

export interface ParticipationNote {
  committee_id: string;
  session_id: string;
  delegate_id: string;
  note: string;
  updated_at: string;
}

export interface WarningRow {
  id: string;
  committee_id: string;
  session_id: string | null;
  delegate_id: string;
  reason: string;
  created_at: string;
}

export interface AwardRow {
  committee_id: string;
  award: 'best_delegate' | 'outstanding_delegate' | 'honorific_mention' | 'best_position_paper';
  delegate_id: string;
}

export interface RubricLevel {
  id: string;
  category: ParticipationEntry['category'];
  level_key: string;
  label: string;
  description: string;
  score: number;
  sort: number;
}
