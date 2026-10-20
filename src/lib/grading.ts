import { Delegate, ParticipationEntry, SessionRow, VoteRecord } from './types';

export interface Standing {
  delegate: Delegate;
  bySession: Record<string, number>;
  entriesPoints: number;
  explanations: number; // number of explanations given
  explanationPoints: number;
  total: number;
}

// Total = sum of all participation scores + explanationPoints for every right of explanation given
// (only In favor / Against votes carry the right of explanation)
// (this is the same formula as the grading-log spreadsheet).
export function computeStandings(
  delegates: Delegate[],
  sessions: Pick<SessionRow, 'id'>[],
  entries: Pick<ParticipationEntry, 'delegate_id' | 'session_id' | 'score'>[],
  records: Pick<VoteRecord, 'delegate_id' | 'explanation' | 'choice'>[],
  explanationPointsEach: number
): Standing[] {
  const sessionIds = sessions.map((s) => s.id);
  const rows = new Map<string, Standing>();
  for (const d of delegates) {
    rows.set(d.id, {
      delegate: d,
      bySession: Object.fromEntries(sessionIds.map((id) => [id, 0])),
      entriesPoints: 0,
      explanations: 0,
      explanationPoints: 0,
      total: 0,
    });
  }
  for (const e of entries) {
    const r = rows.get(e.delegate_id);
    if (!r) continue;
    r.bySession[e.session_id] = (r.bySession[e.session_id] || 0) + Number(e.score);
    r.entriesPoints += Number(e.score);
  }
  for (const rec of records) {
    if (rec.explanation !== 'given' || rec.choice === 'abstain') continue; // abstentions have no right of explanation
    const r = rows.get(rec.delegate_id);
    if (!r) continue;
    r.explanations += 1;
    r.explanationPoints += explanationPointsEach;
  }
  const list = Array.from(rows.values());
  for (const r of list) r.total = r.entriesPoints + r.explanationPoints;
  return list.sort((a, b) => b.total - a.total || a.delegate.country.localeCompare(b.delegate.country));
}

export const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
