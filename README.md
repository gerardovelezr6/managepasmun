# ManagePASMUN

Student-led MUN management for **High Command (Secretariat)** and **Committee Chairs**.
Next.js 14 (App Router) · Tailwind CSS · Supabase (Auth, Postgres + Realtime, Storage).

| Who | What they get |
|---|---|
| Everyone | Must enter the **global conference access code**. Then: committee list by name / topic / live status, and the read-only **projection screen** per committee. |
| Chair | Password login → run their committees: roll call, speakers' list + timer, moderated/unmoderated caucuses, points & motions log, voting, documents. |
| High Command | Everything a chair can do for any committee, plus: users & roles, committees & chair assignment, global announcements, live cross-committee analytics, branding (logo upload), archive + full reset. |

## 1. Supabase setup (once)

1. Create a project at supabase.com.
2. **SQL Editor** → run `supabase/schema.sql`. (Tables, RLS, realtime, storage buckets, reset function.)
3. Optional: run `supabase/seed.sql` for placeholder committees/delegates.
4. **Authentication → Providers → Email**: turn **off** "Allow new users to sign up" (High Command creates all accounts). Turning off "Confirm email" is not required.
5. **Project Settings → API**: copy the URL, anon key and service-role key.

## 2. Configure

```bash
cp .env.example .env.local   # fill in all 5 values
npm install
npm run bootstrap -- you@example.org "a-strong-password" "Secretary-General Placeholder"   # first High Command account (Node 20.6+)
npm run dev                  # http://localhost:3000
```

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public by design; data is protected by RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Used by `/api/admin/users` and the bootstrap script. Never prefix with `NEXT_PUBLIC_`. |
| `CONFERENCE_ACCESS_CODE` | The code everyone types to enter. Changing it logs everyone out of the gate. |
| `ACCESS_COOKIE_SECRET` | Long random string (`openssl rand -hex 32`) that signs the access cookie. |

## 3. Deploy (Bonto or any Node host)

- Build command: `npm run build`  ·  Start command: `npm start` (binds `0.0.0.0` and honours `$PORT`).
- Node 18.18+ (20+ recommended). Add the five environment variables in the host's dashboard.

## Day-of workflow

1. High Command → **Users & roles**: create chair accounts. → **Committees & chairs**: create committees, tick chairs.
2. Chairs add delegates under **Run → Roll call → Manage delegate list** (`Country, Delegate Name` per line).
3. Open the **projection screen** (`/committee/<id>/display`) on the room's laptop; press **F** for fullscreen.
4. Chair: take roll → *Call to order* → run the floor. Passing a caucus / speaking-time / suspension / adjournment motion applies it automatically.
5. After the conference: **High Command → Archive & reset**. An archive (JSON, downloadable) is saved first, then live session data is purged. Tick the extra box to also wipe committees/rosters/chair assignments for the next team. Accounts, branding and uploaded files are kept.

## Sessions, participation grading and the grading log

- **Sessions:** *Call to order* / *Resume* / a passed *Open session* motion starts the next numbered session. Roll call is saved per session (on time / late / missed). Suspending or adjourning closes the session and the next one starts with a fresh roll call.
- **Participation tab:** tap a rubric score per contribution (speakers' list speech or question, moderated caucus, unmoderated caucus, working or resolution paper). Add notes and warnings per delegate. Session totals, grand totals and rank are automatic.
- **Right of explanation:** only delegates who voted *In favor* or *Against* can have one. Each one marked *given* adds points (default 1, High Command → Grading rubric).
- **Grading log tab / High Command → Participation & grades:** standings, attendance per session, warnings, winners, and **Export (.xlsx)** in the original five-tab layout.
- Grades, warnings and notes are visible only to that committee's chairs and High Command. They are never shown on the projection screen and are not readable with the public key.
- **Rubric:** High Command → Grading rubric edits levels, wording and the explanation points. Past scores keep the score they were given.

## Upgrading a database that already exists

Run the files in `supabase/migrations/` that you haven't run yet, in order, in the Supabase SQL Editor (`001` then `002`). They only add things, can be re-run safely, and keep your data. A brand-new project just runs `supabase/schema.sql`, which already includes everything.

## Customising

- **Branding** (name, logo, colours, dates, venue): High Command → Branding. Logo upload slot is there.
- **Placeholder wording, motion & point types, quorum fractions, timer presets, upload limit**: `src/lib/config.ts`.
- **Vote rules** (abstentions don't count; 2/3 = for ≥ ⅔ of for+against): `src/lib/session.ts`.

## How the live sync works

Each committee has one `committee_state` row. Timers store *remaining time + start timestamp*, so no per-second writes: every device (chair, projector) computes the countdown locally from the database server clock (`server_now()` offset). Tables are in the `supabase_realtime` publication; the UI subscribes with `postgres_changes` and refetches on change.

## Security notes (read these)

- The access code is an **application-level gate** (signed, expiring, httpOnly cookie, enforced in middleware). Committee floor data (rosters, speakers' list, motions, votes) is readable with the public anon key, because the projection screen needs it without a login. Documents, users, archives and all writes are protected by RLS and require a chair/High Command login. If you need the floor data hidden from anyone with the anon key, move the projection reads behind a server route.
- Roles are only granted by High Command through the server API; `raw_user_meta_data` is never trusted, and new auth users default to `pending` (no access).
- Access-code attempts are throttled per server instance (best effort, in memory).

## Inviting users (Invite & passwords tab)

High Command → **Invite & passwords** creates an account and gives you a one-time link. Hand it to the person privately; they open it, choose their own password on `/set-password` and are signed in. **Copy link** makes a fresh link for anyone later (first-time setup or a forgotten password). No email is sent, so no email provider is needed. Passwords people choose are hashed by Supabase and can't be viewed by anyone.

One-time Supabase setup so links don't point to `localhost:3000`:

1. **Authentication → URL Configuration → Site URL**: your live address, e.g. `https://managepasmun.vercel.app`.
2. **Redirect URLs**: add `https://managepasmun.vercel.app/set-password` (or `https://managepasmun.vercel.app/**`).
3. Vercel → Settings → Environment Variables: `NEXT_PUBLIC_SITE_URL` = the same address, then redeploy.

## Advisor role

Advisors can do everything High Command can. Only advisors can run the **full administrative reset** and create, change or remove other advisors (High Command can still save archives and manage chairs and High Command accounts).

Run `supabase/migrations/005_advisor_role.sql` in the SQL Editor, then make the first advisor, either:
- `npm run bootstrap -- you@example.org "Password" "Name" advisor` (creates a new account), or
- in the SQL Editor: `update public.profiles set role = 'advisor' where email = 'you@example.org';` (promotes an existing account). Run it before any other advisors exist or after, the SQL Editor is always allowed.

## Calls of attention, Spanish committees and flags

Run `supabase/migrations/006_calls_languages_flags.sql` in the SQL Editor. It is safe to re-run.

- **Call of attention**: a second button next to Warning in the Participation tab. It is counted separately and has its own column in the exported spreadsheet.
- **Spanish committees**: pick the language when creating a committee (or edit it later). Chair screens, the projection screen and the export are then in Mexican Spanish for that committee only. Missing translations fall back to English. Rubric wording in Spanish is edited in Grading rubric.
- **Flags**: shown beside country names, chosen automatically from the name. Ambiguous names ("Congo", "Korea") get none until set by hand with the flag menu in Roll call, Manage delegate list.

## Committee types, categories and crisis topics

Run `supabase/migrations/007_committee_types.sql` in the SQL Editor (safe to re-run).

- **Categories**: General Assembly, Security Council, ECOSOC, Specialized. Committees are grouped by category on the dashboard, Committees tab and Live analytics.
- **Types**: Standard, Specialized (tag only), US Senate (Democrat / Republican, state flags), Senado de México (MORENA, PVEM, PAN, PT, MC, PRI), ICC (Prosecution / Defense / Judges, country flag found inside the text) and Crisis (confidential topic).
- **Everything is editable** in High Command → *Types & categories*: names (English and Spanish), categories, field names, flag source, parties/sides with colours and uploaded logos, bulk-add column order and the confidential-topic switch. New types can be added there with no code change.
- **Adding delegates** (Roll call → Manage delegate list) uses the columns of the type, e.g. `Texas, Name, Republican` (Senate) or `Prosecution, Name, Federal Republic of Germany` (ICC).
- **Crisis topic**: stored in a separate table the public key cannot read. High Command and advisors always see it; assigned chairs only once half of all committees have been in session (latched; *Lock again* in the Committees tab resets it). The projection screen never shows it.

Run `supabase/migrations/008_order_junior_high.sql` after 007. It adds the Junior High category (ECOSOC listed first), the "Senator (State), Party, Delegate name" columns for the US Senate, "Entidad, Partido, Nombre del delegado" for the Senado de México, and the manual committee order. Committees and categories are reordered by dragging ⋮⋮ (Committees tab and Types & categories tab). Party logos are uploaded per party under Types & categories (square or wide PNG/SVG, about 128 px high works well).

Run `supabase/migrations/009_party_logo_slot.sql` too: the Senado de México now shows each party's logo in the same slot where the US Senate shows a state flag. Until a logo is uploaded under Types & categories, the party's coloured badge is all that shows.

## Flag sources

Country flags come from the `flag-icons` package. US state and territory flags in `public/flags/us/` come from the `region-flags` collection (public-domain Wikimedia files, optimised with svgo).
