-- 006: calls of attention, Spanish committees, delegate flags, Spanish rubric wording.
-- Additive and safe to re-run.

-- Warnings can now be a "warning" or a "call of attention".
alter table public.warnings add column if not exists kind text not null default 'warning';
alter table public.warnings drop constraint if exists warnings_kind_check;
alter table public.warnings add constraint warnings_kind_check check (kind in ('warning', 'call_of_attention'));

-- Per-committee language: 'en' or 'es' (Mexican Spanish). Chosen when the committee is created.
alter table public.committees add column if not exists language text not null default 'en';
alter table public.committees drop constraint if exists committees_language_check;
alter table public.committees add constraint committees_language_check check (language in ('en', 'es'));

-- Flag override. null = automatic from the country name, 'none' = no flag, otherwise a lowercase ISO code (e.g. 'eg').
alter table public.delegates add column if not exists flag text;

-- Spanish wording for the rubric (used by Spanish committees). Edited in Grading rubric.
alter table public.rubric_levels add column if not exists label_es text;
alter table public.rubric_levels add column if not exists description_es text;

update public.rubric_levels r set label_es = v.label_es, description_es = v.description_es
from (values
  ('sl_speech', '6', 'Clara, bien estructurada, sólida respuesta a preguntas', 'El documento de postura y el discurso son coherentes, claros y eficaces para describir con precisión la postura del país y su relevancia para las soluciones propuestas. Las soluciones están bien alineadas con la política nacional. El delegado responde con solidez y buena estructura a las preguntas y demuestra dominio total del tema.'),
  ('sl_speech', '5', 'Lectura clara, poca profundidad, sólida respuesta', 'El documento de postura y el discurso son coherentes y eficaces, pero: (a) las soluciones propuestas no son del todo relevantes o representativas de la postura del país, o (b) las soluciones son totalmente relevantes, pero el discurso carece de claridad o eficacia. El delegado responde con eficacia a las preguntas.'),
  ('sl_speech', '4', 'Lectura clara, solución regular (poco concreta), algunas respuestas a preguntas', 'El documento de postura y el discurso carecen de claridad, pero las soluciones propuestas se relacionan en cierta medida con el tema y son pertinentes. El delegado responde la mayoría de las preguntas, aunque las respuestas pueden ser incompletas o poco profundas.'),
  ('sl_speech', '3s', 'No es claro, incompleto, no pudo responder / evitó responder', 'El documento de postura y el discurso no son claros, y las soluciones propuestas no son relevantes, están poco desarrolladas o no se presentan. El delegado no responde las preguntas o evita contestarlas.'),
  ('sl_question', '3q', 'Pregunta bien estructurada (+ réplica)', 'Preguntas bien estructuradas, incluidas preguntas de seguimiento pertinentes.'),
  ('sl_question', '2', 'Pregunta coherente', 'Pregunta coherente que contribuye a la discusión.'),
  ('sl_question', '1', 'Mala estructura, sin relación con el tema', 'Mala estructura; la intervención no tiene relación con el tema.'),
  ('mc', '3', 'Idea sólida / aporta contexto / pregunta completa', 'Aportación muy pertinente que introduce información, datos o análisis nuevos que hacen avanzar el debate al ayudar a redactar nuevas soluciones o a perfeccionar de forma significativa las existentes.'),
  ('mc', '2', 'Pregunta pertinente / idea sólida pero sin contexto o información', 'Aportación pertinente que ayuda a perfeccionar soluciones ya existentes, pero carece de profundidad o de análisis detallado, o no introduce información realmente nueva.'),
  ('mc', '1', 'Irrelevante / sin impacto', 'Intervención irrelevante, repetitiva o sin impacto que aporta poco o nada al debate.'),
  ('umc', '3', 'Dirige la discusión / participación activa', 'Dirige activamente o hace avanzar de forma sustancial la discusión al introducir información, datos o propuestas concretas que ayudan a crear o mejorar de manera significativa las soluciones.'),
  ('umc', '2', 'Participación activa', 'Participa y contribuye activamente a perfeccionar u organizar ideas o propuestas existentes, pero no introduce información nueva o sustancial, o carece de profundidad analítica.'),
  ('umc', '1', 'No participa / poca aportación', 'Participación casi nula o involucramiento que no contribuye de manera significativa a la discusión ni al proceso de redacción.'),
  ('wp', '16', 'Dirige la discusión / trabajo activo / presenta el documento / sólida respuesta a preguntas', 'Dirige la discusión y el trabajo activo; presenta el documento y responde con solidez a las preguntas.'),
  ('wp', '15', 'Dirige / trabajo activo / presenta / responde la mayoría de las preguntas', 'Dirige o trabaja activamente en los documentos; presenta y responde con eficacia la mayoría de las preguntas.'),
  ('wp', '7', 'Dirige / redacta / organiza propuestas', 'Dirige, redacta y organiza propuestas.'),
  ('wp', '6', 'Trabajo activo / aporta puntos e ideas valiosos', 'Trabajo activo; aporta puntos e ideas valiosos.'),
  ('wp', '5', 'Ayuda activa / participación constante', 'Ayuda activa y participación constante.'),
  ('wp', '4', 'Participación limitada en la redacción o la colaboración', 'Participación limitada en la redacción o la colaboración.'),
  ('wp', '3', 'Muy poca participación', 'Muy poca participación.'),
  ('wp', '2', 'Involucramiento mínimo en el proceso de trabajo', 'Involucramiento mínimo en el proceso de trabajo.'),
  ('wp', '1', 'Sin participación significativa', 'Sin participación significativa.'),
  ('rp', '16', 'Dirige la discusión / trabajo activo / presenta el documento / sólida respuesta a preguntas', 'Dirige la discusión y el trabajo activo; presenta el documento y responde con solidez a las preguntas.'),
  ('rp', '15', 'Dirige / trabajo activo / presenta / responde la mayoría de las preguntas', 'Dirige o trabaja activamente en los documentos; presenta y responde con eficacia la mayoría de las preguntas.'),
  ('rp', '7', 'Dirige / redacta / organiza propuestas', 'Dirige, redacta y organiza propuestas.'),
  ('rp', '6', 'Trabajo activo / aporta puntos e ideas valiosos', 'Trabajo activo; aporta puntos e ideas valiosos.'),
  ('rp', '5', 'Ayuda activa / participación constante', 'Ayuda activa y participación constante.'),
  ('rp', '4', 'Participación limitada en la redacción o la colaboración', 'Participación limitada en la redacción o la colaboración.'),
  ('rp', '3', 'Muy poca participación', 'Muy poca participación.'),
  ('rp', '2', 'Involucramiento mínimo en el proceso de trabajo', 'Involucramiento mínimo en el proceso de trabajo.'),
  ('rp', '1', 'Sin participación significativa', 'Sin participación significativa.')
) as v(category, level_key, label_es, description_es)
where r.category = v.category and r.level_key = v.level_key and r.label_es is null;
