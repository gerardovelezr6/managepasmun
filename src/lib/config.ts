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

// Ordered roughly from most to least disruptive. Codes follow the PASMUN grading log.
// Edit freely to match your rules of procedure. Stored values never change, so old logs stay valid.
export const MOTION_TYPES = [
  { value: 'suspend_session', code: 'MSS', label: 'Suspend session', needsDuration: false, needsSpeaking: false },
  { value: 'adjourn', code: 'ADJ', label: 'Adjournment of the meeting', needsDuration: false, needsSpeaking: false },
  { value: 'open_session', code: 'MOS', label: 'Open session', needsDuration: false, needsSpeaking: false },
  { value: 'unmoderated_caucus', code: 'MUC', label: 'Unmoderated caucus', needsDuration: true, needsSpeaking: false },
  { value: 'moderated_caucus', code: 'MOC', label: 'Moderated caucus', needsDuration: true, needsSpeaking: true },
  { value: 'finish_reading_pp', code: 'FRP', label: 'Finish reading position papers', needsDuration: false, needsSpeaking: false },
  { value: 'extraordinary_questions', code: 'ESQ', label: 'Extraordinary session of questions', needsDuration: false, needsSpeaking: false },
  { value: 'open_debate', code: 'MD', label: 'Open debate', needsDuration: false, needsSpeaking: false },
  { value: 'close_debate', code: 'MCD', label: 'Close debate', needsDuration: false, needsSpeaking: false },
  { value: 'set_speaking_time', code: 'CST', label: 'Change speaking time', needsDuration: false, needsSpeaking: true },
  { value: 'introduce_draft', code: 'IDR', label: 'Introduce draft resolution', needsDuration: false, needsSpeaking: false },
  { value: 'other', code: 'OTH', label: 'Other motion', needsDuration: false, needsSpeaking: false },
];

export const POINT_TYPES = [
  { value: 'order', code: 'POR', label: 'Point of order' },
  { value: 'parliamentary_inquiry', code: 'PPI', label: 'Point of parliamentary inquiry' },
  { value: 'information', code: 'PIN', label: 'Point of information' },
  { value: 'personal_privilege', code: 'PPP', label: 'Point of personal privilege' },
  { value: 'right_of_reply', code: 'RRP', label: 'Right of reply' },
];

// Participation grading categories (see the Grading Log Rubric). Level lists live in the rubric_levels table.
export const GRADING_CATEGORIES = [
  { value: 'sl_speech', label: "Speakers' list: speech", short: 'SL', hint: 'Position paper, speech and answers to questions' },
  { value: 'sl_question', label: "Speakers' list: question", short: 'SL Q', hint: 'Question asked to a speaker' },
  { value: 'mc', label: 'Moderated caucus', short: 'MC', hint: 'Each contribution in a moderated caucus' },
  { value: 'umc', label: 'Unmoderated caucus', short: 'UMC', hint: 'Overall work in an unmoderated caucus' },
  { value: 'wp', label: 'Working paper', short: 'WP', hint: 'Work on and presentation of working papers' },
  { value: 'rp', label: 'Resolution paper', short: 'RP', hint: 'Work on and presentation of resolution papers' },
] as const;
export type GradingCategory = (typeof GRADING_CATEGORIES)[number]['value'];

export const AWARD_TYPES = [
  { value: 'best_delegate', label: 'Best Delegate' },
  { value: 'outstanding_delegate', label: 'Outstanding Delegate' },
  { value: 'honorific_mention', label: 'Honorific Mention' },
  { value: 'best_position_paper', label: 'Best Position Paper' },
];

// Quick tags for votes on papers (shown as buttons when opening a vote).
export const VOTE_LABEL_PRESETS = ['WP A1', 'WP A2', 'RP Round 1', 'RP Round 2', 'RP Round 3'];

export const DOC_KINDS = [
  { value: 'draft_resolution', label: 'Draft resolution' },
  { value: 'crisis', label: 'Crisis document' },
  { value: 'other', label: 'Other' },
];

export function labelFor(list: { value: string; label: string }[], value: string) {
  return list.find((x) => x.value === value)?.label ?? value;
}

export function codeFor(list: { value: string; code?: string }[], value: string) {
  return list.find((x) => x.value === value)?.code ?? '';
}
