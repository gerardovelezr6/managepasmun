'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRubric } from '@/lib/hooks';
import { GRADING_CATEGORIES } from '@/lib/config';
import { toast, toastError } from '@/lib/toast';
import { RubricLevel } from '@/lib/types';
import { useSettings } from '../BrandProvider';
import { Empty, Field } from '../ui';

type Cat = RubricLevel['category'];

// High Command edits the participation rubric here. Scores already given keep the score and wording
// they had when they were awarded, so editing the rubric never changes past grades.
export function RubricEditor() {
  const { levels, reload } = useRubric();
  const { settings, reload: reloadSettings } = useSettings();
  const [cat, setCat] = useState<Cat>('sl_speech');
  const [draft, setDraft] = useState({ level_key: '', label: '', description: '', score: '' });
  const [pts, setPts] = useState<string>(String(settings.explanation_points ?? 1));

  const list = levels.filter((l) => l.category === cat).sort((a, b) => a.sort - b.sort);
  const info = GRADING_CATEGORIES.find((c) => c.value === cat)!;

  async function patch(l: RubricLevel, p: Partial<RubricLevel>) {
    const { error } = await supabase().from('rubric_levels').update(p).eq('id', l.id);
    if (error) return toastError(error);
    reload();
  }
  async function remove(l: RubricLevel) {
    if (!window.confirm(`Remove level “${l.level_key}” from ${info.label}? Scores already given are kept.`)) return;
    const { error } = await supabase().from('rubric_levels').delete().eq('id', l.id);
    if (error) return toastError(error);
    reload();
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const score = Number(draft.score);
    if (!draft.level_key.trim() || !Number.isFinite(score)) return toastError('A button label and a numeric score are required.');
    const { error } = await supabase()
      .from('rubric_levels')
      .insert({ category: cat, level_key: draft.level_key.trim(), label: draft.label.trim() || draft.level_key.trim(), description: draft.description.trim(), score, sort: (list[list.length - 1]?.sort || 0) + 1 });
    if (error) return toastError(error.message.includes('duplicate') ? 'That button label already exists in this category.' : error);
    setDraft({ level_key: '', label: '', description: '', score: '' });
    reload();
  }
  async function savePts() {
    const n = Number(pts);
    if (!Number.isFinite(n) || n < 0) return toastError('Enter a number of points (0 or more).');
    const { error } = await supabase().from('settings').update({ explanation_points: n }).eq('id', 1);
    if (error) return toastError(error);
    reloadSettings();
    toast('Saved', 'success');
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <label className="label" htmlFor="expl-pts">Points per right of explanation given</label>
        <div className="flex items-center gap-3">
          <input id="expl-pts" type="number" min={0} step="0.5" className="input w-28" value={pts} onChange={(e) => setPts(e.target.value)} />
          <button className="btn btn-primary" onClick={savePts}>Save</button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Added to a delegate's total each time an explanation (In favor / Against) is marked given.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {GRADING_CATEGORIES.map((c) => (
          <button key={c.value} onClick={() => setCat(c.value)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${cat === c.value ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">{info.label}: {info.hint}. Each level becomes one tap-button on the Participation tab.</p>

      {list.length === 0 ? <Empty>No levels yet for this category.</Empty> : (
        <div className="space-y-2">
          {list.map((l) => (
            <div key={l.id} className="card grid gap-3 p-4 sm:grid-cols-12">
              <Field label="Button">
                <input className="input" defaultValue={l.level_key} disabled title="The button label can't be changed because past scores refer to it. Remove and re-add to rename." />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Score">
                  <input type="number" step="0.5" className="input" defaultValue={l.score} onBlur={(e) => Number(e.target.value) !== l.score && Number.isFinite(Number(e.target.value)) && patch(l, { score: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="sm:col-span-4">
                <Field label="Short wording">
                  <input className="input" defaultValue={l.label} onBlur={(e) => e.target.value !== l.label && patch(l, { label: e.target.value })} />
                </Field>
              </div>
              <div className="sm:col-span-4">
                <Field label="Full rubric description">
                  <textarea className="input h-20" defaultValue={l.description} onBlur={(e) => e.target.value !== l.description && patch(l, { description: e.target.value })} />
                </Field>
              </div>
              <div className="flex items-end sm:col-span-1">
                <button className="btn btn-ghost btn-sm text-red-600" onClick={() => remove(l)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add} className="card grid gap-3 sm:grid-cols-12">
        <div className="sm:col-span-2"><Field label="Button label"><input className="input" value={draft.level_key} onChange={(e) => setDraft({ ...draft, level_key: e.target.value })} placeholder="e.g. 3" /></Field></div>
        <div className="sm:col-span-2"><Field label="Score"><input type="number" step="0.5" className="input" value={draft.score} onChange={(e) => setDraft({ ...draft, score: e.target.value })} /></Field></div>
        <div className="sm:col-span-3"><Field label="Short wording"><input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></Field></div>
        <div className="sm:col-span-4"><Field label="Full description"><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field></div>
        <div className="flex items-end sm:col-span-1"><button className="btn btn-primary w-full">Add</button></div>
      </form>
    </div>
  );
}
