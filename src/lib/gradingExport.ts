// Builds the grading-log workbook (same five tabs as the PASMUN spreadsheet) from live data.
// exceljs is imported lazily so it never weighs down the normal pages.
import { supabase } from './supabase';
import { AWARD_TYPES, GRADING_CATEGORIES } from './config';
import { computeStandings } from './grading';
import {
  AwardRow,
  Committee,
  Delegate,
  ParticipationEntry,
  ParticipationNote,
  RubricLevel,
  SessionAttendance,
  SessionRow,
  VoteRecord,
  VoteRow,
  WarningRow,
} from './types';

export interface LogData {
  conference: string;
  committee: Committee;
  delegates: Delegate[];
  sessions: SessionRow[];
  attendance: SessionAttendance[];
  entries: ParticipationEntry[];
  notes: ParticipationNote[];
  warnings: WarningRow[];
  votes: VoteRow[];
  records: VoteRecord[];
  awards: AwardRow[];
  rubric: RubricLevel[];
  explanationPoints: number;
}

export async function fetchLogData(committeeId: string): Promise<LogData> {
  const sb = supabase();
  const by = (t: string, col = 'committee_id') => sb.from(t).select('*').eq(col, committeeId);
  const [committee, settings, delegates, sessions, attendance, entries, notes, warnings, votes, records, awards, rubric] = await Promise.all([
    sb.from('committees').select('*').eq('id', committeeId).single(),
    sb.from('settings').select('conference_name, explanation_points').eq('id', 1).single(),
    by('delegates').order('country'),
    by('sessions').order('number'),
    by('session_attendance'),
    by('participation_entries').order('created_at'),
    by('participation_notes'),
    by('warnings').order('created_at'),
    by('votes').order('created_at'),
    by('vote_records'),
    by('awards'),
    sb.from('rubric_levels').select('*').order('sort'),
  ]);
  const err = [committee, settings, delegates, sessions, attendance, entries, notes, warnings, votes, records, awards, rubric].find((r: any) => r.error);
  if (err) throw new Error((err as any).error.message);
  return {
    conference: (settings.data as any)?.conference_name || '',
    committee: committee.data as Committee,
    delegates: (delegates.data || []) as Delegate[],
    sessions: (sessions.data || []) as SessionRow[],
    attendance: (attendance.data || []) as SessionAttendance[],
    entries: (entries.data || []) as ParticipationEntry[],
    notes: (notes.data || []) as ParticipationNote[],
    warnings: (warnings.data || []) as WarningRow[],
    votes: (votes.data || []) as VoteRow[],
    records: (records.data || []) as VoteRecord[],
    awards: (awards.data || []) as AwardRow[],
    rubric: (rubric.data || []) as RubricLevel[],
    explanationPoints: Number((settings.data as any)?.explanation_points ?? 1),
  };
}

const CHOICE_TEXT = { for: 'In favor', against: 'Against', abstain: 'Abstention' } as const;
const FILL = {
  green: 'FFC6EFCE',
  amber: 'FFFFEB9C',
  red: 'FFFFC7CE',
  head: 'FF1E293B',
  sub: 'FFE2E8F0',
};

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function buildWorkbook(d: LogData): Promise<ArrayBuffer> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ManagePASMUN';
  wb.created = new Date();

  const delegates = d.delegates;
  const sessions = d.sessions;
  const standings = computeStandings(delegates, sessions, d.entries, d.records, d.explanationPoints);
  const standingBy = new Map(standings.map((s) => [s.delegate.id, s]));
  const headStyle = (cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.head } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  };

  // ───────── Voting tabs first (the Participations tab references the RP tab) ─────────
  const isRp = (v: VoteRow) => /^rp/i.test((v.label || '').trim());
  const closedVotes = d.votes.filter((v) => v.status === 'closed' || d.records.some((r) => r.vote_id === v.id));
  const wpVotes = closedVotes.filter((v) => !isRp(v));
  const rpVotes = closedVotes.filter(isRp);
  const recBy = new Map<string, VoteRecord>();
  for (const r of d.records) recBy.set(`${r.vote_id}:${r.delegate_id}`, r);

  function votingSheet(name: string, title: string, votes: VoteRow[], withPoints: boolean) {
    const ws = wb.addWorksheet(name);
    ws.getCell('A1').value = `${title} · ${d.committee.name}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    const fixed = 2;
    ws.getCell(3, 1).value = '#';
    ws.getCell(3, 2).value = 'Delegation';
    ws.mergeCells(3, 1, 4, 1);
    ws.mergeCells(3, 2, 4, 2);
    votes.forEach((v, i) => {
      const c0 = fixed + 1 + i * 4;
      ws.mergeCells(3, c0, 3, c0 + 3);
      ws.getCell(3, c0).value = `${v.label ? v.label + ' · ' : ''}${v.title}${v.result ? ` (${v.result})` : ''}`;
      ['In favor', 'Against', 'Abstention', 'Explanation'].forEach((h, k) => {
        ws.getCell(4, c0 + k).value = h;
      });
    });
    let pointsCol = 0;
    if (withPoints) {
      pointsCol = fixed + votes.length * 4 + 1;
      ws.mergeCells(3, pointsCol, 4, pointsCol);
      ws.getCell(3, pointsCol).value = 'Points for right of explanation';
    }
    for (const r of [3, 4]) for (let c = 1; c <= (pointsCol || fixed + votes.length * 4); c++) headStyle(ws.getCell(r, c));
    delegates.forEach((dl, idx) => {
      const row = 5 + idx;
      ws.getCell(row, 1).value = idx + 1;
      ws.getCell(row, 2).value = dl.country;
      votes.forEach((v, i) => {
        const c0 = fixed + 1 + i * 4;
        const rec = recBy.get(`${v.id}:${dl.id}`);
        ws.getCell(row, c0).value = rec?.choice === 'for';
        ws.getCell(row, c0 + 1).value = rec?.choice === 'against';
        ws.getCell(row, c0 + 2).value = rec?.choice === 'abstain';
        ws.getCell(row, c0 + 3).value = rec?.explanation && rec.choice !== 'abstain' ? (rec.explanation === 'given' ? 'given' : 'requested') : '';
      });
    });
    ws.getColumn(2).width = 30;
    for (let c = 3; c <= (pointsCol || fixed + votes.length * 4); c++) ws.getColumn(c).width = 14;
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
    return { ws, pointsCol };
  }

  // Explanation points are computed over every vote so nothing is lost if a paper is untagged.
  votingSheet('Voting Process WP', 'Working Paper voting', wpVotes, false);
  const rp = votingSheet('Voting Process RP', 'Resolution Paper voting', rpVotes, true);
  const pointsCol = rp.pointsCol;
  const expPoints = new Map<string, number>();
  for (const r of d.records) {
    if (r.explanation === 'given' && r.choice !== 'abstain') expPoints.set(r.delegate_id, (expPoints.get(r.delegate_id) || 0) + d.explanationPoints);
  }
  delegates.forEach((dl, idx) => {
    rp.ws.getCell(5 + idx, pointsCol).value = expPoints.get(dl.id) || 0;
  });

  // ───────── Participations ─────────
  const pt = wb.addWorksheet('Participations', { properties: { tabColor: { argb: 'FF1E40AF' } } });
  pt.getCell('A1').value = `Participations · ${d.committee.name} · ${d.conference}`;
  pt.getCell('A1').font = { bold: true, size: 14 };
  pt.getCell(3, 1).value = '#';
  pt.getCell(3, 2).value = 'Delegation';
  pt.mergeCells(3, 1, 4, 1);
  pt.mergeCells(3, 2, 4, 2);
  sessions.forEach((s, i) => {
    const c0 = 3 + i * 2;
    pt.mergeCells(3, c0, 3, c0 + 1);
    pt.getCell(3, c0).value = `Session ${s.number}`;
    pt.getCell(4, c0).value = 'Log (score//rubric text, then notes)';
    pt.getCell(4, c0 + 1).value = 'P';
  });
  const expCol = 3 + sessions.length * 2;
  const totalCol = expCol + 1;
  pt.mergeCells(3, expCol, 4, expCol);
  pt.getCell(3, expCol).value = 'Right of explanation';
  pt.mergeCells(3, totalCol, 4, totalCol);
  pt.getCell(3, totalCol).value = 'Points';
  for (const r of [3, 4]) for (let c = 1; c <= totalCol; c++) headStyle(pt.getCell(r, c));

  delegates.forEach((dl, idx) => {
    const row = 5 + idx;
    pt.getCell(row, 1).value = idx + 1;
    pt.getCell(row, 2).value = dl.country;
    const pCells: string[] = [];
    let total = 0;
    sessions.forEach((s, i) => {
      const c0 = 3 + i * 2;
      const mine = d.entries.filter((e) => e.session_id === s.id && e.delegate_id === dl.id);
      const note = d.notes.find((n) => n.session_id === s.id && n.delegate_id === dl.id)?.note?.trim() || '';
      const warns = d.warnings.filter((w) => w.session_id === s.id && w.delegate_id === dl.id);
      const lines = mine.map((e) => `${GRADING_CATEGORIES.find((c) => c.value === e.category)?.short || e.category} ${e.level_key}//${e.label || ''}`);
      const tail = [...warns.map((w) => `- Warning: ${w.reason}`), ...(note ? [note] : [])];
      const text = [...lines, ...(tail.length ? ['---', ...tail] : [])].join('\n');
      const sum = mine.reduce((a, e) => a + Number(e.score), 0);
      total += sum;
      const logCell = pt.getCell(row, c0);
      logCell.value = text;
      logCell.alignment = { wrapText: true, vertical: 'top' };
      pt.getCell(row, c0 + 1).value = sum;
      pCells.push(`${colLetter(c0 + 1)}${row}`);
    });
    const exp = expPoints.get(dl.id) || 0;
    pt.getCell(row, expCol).value = { formula: `'Voting Process RP'!${colLetter(pointsCol)}${5 + idx}`, result: exp };
    pt.getCell(row, totalCol).value = { formula: `${pCells.length ? pCells.join('+') + '+' : ''}${colLetter(expCol)}${row}`, result: total + exp };
    pt.getCell(row, totalCol).font = { bold: true };
    pt.getRow(row).alignment = { vertical: 'top' };
  });
  pt.getColumn(1).width = 5;
  pt.getColumn(2).width = 30;
  sessions.forEach((_s, i) => {
    pt.getColumn(3 + i * 2).width = 60;
    pt.getColumn(4 + i * 2).width = 7;
  });
  pt.getColumn(expCol).width = 14;
  pt.getColumn(totalCol).width = 10;
  pt.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

  // ───────── Basic info ─────────
  const bi = wb.addWorksheet('Basic info', { properties: { tabColor: { argb: 'FF16A34A' } } });
  bi.getCell('A1').value = `Committee: ${d.committee.name}`;
  bi.getCell('A1').font = { bold: true, size: 14 };
  bi.getCell('A2').value = d.conference;
  bi.getCell(4, 1).value = '#';
  bi.getCell(4, 2).value = 'Delegation';
  sessions.forEach((s, i) => (bi.getCell(4, 3 + i).value = `Session ${s.number}`));
  const wCol = 3 + sessions.length;
  bi.getCell(4, wCol).value = 'Warnings';
  bi.getCell(4, wCol + 1).value = 'Notes';
  bi.getCell(4, wCol + 2).value = 'Points';
  bi.getCell(4, wCol + 3).value = 'Rank';
  for (let c = 1; c <= wCol + 3; c++) headStyle(bi.getCell(4, c));
  const rankBy = new Map(standings.map((s, i) => [s.delegate.id, i + 1]));
  delegates.forEach((dl, idx) => {
    const row = 5 + idx;
    bi.getCell(row, 1).value = idx + 1;
    bi.getCell(row, 2).value = dl.country;
    sessions.forEach((s, i) => {
      const a = d.attendance.find((x) => x.session_id === s.id && x.delegate_id === dl.id);
      const cell = bi.getCell(row, 3 + i);
      const missed = !a || a.attendance === 'absent';
      cell.value = missed ? 'Missed' : a!.late ? 'Late' : 'On time';
      cell.alignment = { horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: missed ? FILL.red : a!.late ? FILL.amber : FILL.green } };
    });
    const ws_ = d.warnings.filter((w) => w.delegate_id === dl.id);
    bi.getCell(row, wCol).value = ws_.length;
    bi.getCell(row, wCol + 1).value = ws_.map((w) => w.reason).filter(Boolean).join('; ');
    bi.getCell(row, wCol + 2).value = { formula: `Participations!${colLetter(totalCol)}${row}`, result: standingBy.get(dl.id)?.total || 0 };
    bi.getCell(row, wCol + 3).value = rankBy.get(dl.id) || '';
  });
  // Key + winners
  const kc = wCol + 5;
  bi.getCell(4, kc).value = 'Key';
  headStyle(bi.getCell(4, kc));
  [['On time', FILL.green], ['Late', FILL.amber], ['Missed', FILL.red]].forEach(([t, argb], i) => {
    const c = bi.getCell(5 + i, kc);
    c.value = t;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  });
  bi.getCell(9, kc).value = 'Winners';
  headStyle(bi.getCell(9, kc));
  AWARD_TYPES.forEach((a, i) => {
    const w = d.awards.find((x) => x.award === a.value);
    const dl = w ? delegates.find((x) => x.id === w.delegate_id) : null;
    bi.getCell(10 + i, kc).value = `${a.label}: ${dl ? dl.country : ''}`;
  });
  bi.getColumn(2).width = 30;
  bi.getColumn(wCol + 1).width = 50;
  bi.getColumn(kc).width = 44;
  for (let i = 0; i < sessions.length; i++) bi.getColumn(3 + i).width = 12;
  bi.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

  // ───────── Rubric ─────────
  const rb = wb.addWorksheet('Grading Log Rubric');
  rb.getCell('A1').value = 'Grading Log Rubric';
  rb.getCell('A1').font = { bold: true, size: 14 };
  GRADING_CATEGORIES.forEach((cat, i) => {
    const c0 = 1 + i * 3;
    rb.getCell(3, c0).value = cat.label;
    rb.mergeCells(3, c0, 3, c0 + 1);
    rb.getCell(4, c0).value = 'Points';
    rb.getCell(4, c0 + 1).value = 'Description';
    headStyle(rb.getCell(3, c0));
    headStyle(rb.getCell(3, c0 + 1));
    headStyle(rb.getCell(4, c0));
    headStyle(rb.getCell(4, c0 + 1));
    d.rubric
      .filter((l) => l.category === cat.value)
      .sort((a, b) => a.sort - b.sort)
      .forEach((l, k) => {
        rb.getCell(5 + k, c0).value = l.level_key;
        const dc = rb.getCell(5 + k, c0 + 1);
        dc.value = l.description || l.label;
        dc.alignment = { wrapText: true, vertical: 'top' };
      });
    rb.getColumn(c0).width = 8;
    rb.getColumn(c0 + 1).width = 55;
  });

  // Order tabs like the original workbook.
  const order = ['Basic info', 'Participations', 'Voting Process WP', 'Voting Process RP', 'Grading Log Rubric'];
  order.forEach((name, i) => {
    const sheet = wb.getWorksheet(name);
    if (sheet) sheet.orderNo = i;
  });
  return wb.xlsx.writeBuffer();
}

export function downloadXlsx(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportCommitteeLog(committeeId: string) {
  const data = await fetchLogData(committeeId);
  const buf = await buildWorkbook(data);
  const safe = (data.committee.abbreviation || data.committee.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  downloadXlsx(buf, `grading-log-${safe}.xlsx`);
}
