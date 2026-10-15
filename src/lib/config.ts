// Central place for placeholder names and tunable defaults.
// Branding (name, logo, colors) lives in the database and is edited in Admin > Branding;
// everything below is the fallback used before the database answers.

export const APP_CONFIG = {
  appName: 'ManagePASMUN',
  fallbackConferenceName: 'PASMUN 2026 (Placeholder Name)',
  fallbackShortName: 'PASMUN',
  fallbackTagline: 'Placeholder tagline',
  fallbackPrimary: '#1e40af',
  fallbackAccent: '#f59e0b',
  defaultSpeakingSec: 90,
  maxUploadMb: 25,
  // Quorum rules shown on the roll call tab. Adjust to your conference's rules of procedure.
  quorum: { debateFraction: 1 / 3, majorityFraction: 1 / 2 },
  // Quick time presets (seconds) for timers.
  speakingPresets: [30, 45, 60, 90, 120],
  caucusPresetsMin: [3, 5, 10, 15, 20],
};

export const SESSION_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_session: 'In session',
  suspended: 'Suspended',
  adjourned: 'Adjourned',
};

export const MODE_LABEL: Record<string, string> = {
  formal: 'Formal debate',
  moderated: 'Moderated caucus',
  unmoderated: 'Unmoderated caucus',
  voting: 'Voting procedure',
};

export const ATTENDANCE_LABEL: Record<string, string> = {
  absent: 'Absent',
  present: 'Present',
  present_and_voting: 'Present & voting',
};

// Ordered roughly from most to least disruptive. Edit freely to match your rules of procedure.
export const MOTION_TYPES = [
  { value: 'suspend_session', label: 'Suspension of the meeting', needsDuration: false, needsSpeaking: false },
  { value: 'adjourn', label: 'Adjournment of the meeting', needsDuration: false, needsSpeaking: false },
  { value: 'unmoderated_caucus', label: 'Unmoderated caucus', needsDuration: true, needsSpeaking: false },
  { value: 'moderated_caucus', label: 'Moderated caucus', needsDuration: true, needsSpeaking: true },
  { value: 'set_speaking_time', label: 'Change speaking time', needsDuration: false, needsSpeaking: true },
  { value: 'close_debate', label: 'Closure of debate', needsDuration: false, needsSpeaking: false },
  { value: 'introduce_draft', label: 'Introduce draft resolution', needsDuration: false, needsSpeaking: false },
  { value: 'other', label: 'Other motion', needsDuration: false, needsSpeaking: false },
];

export const POINT_TYPES = [
  { value: 'order', label: 'Point of order' },
  { value: 'personal_privilege', label: 'Point of personal privilege' },
  { value: 'parliamentary_inquiry', label: 'Point of parliamentary inquiry' },
  { value: 'information', label: 'Point of information' },
];

export const DOC_KINDS = [
  { value: 'draft_resolution', label: 'Draft resolution' },
  { value: 'crisis', label: 'Crisis document' },
  { value: 'other', label: 'Other' },
];

export function labelFor(list: { value: string; label: string }[], value: string) {
  return list.find((x) => x.value === value)?.label ?? value;
}
