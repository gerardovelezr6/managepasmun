'use client';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Tabs, useLocalState } from '@/components/ui';
import { Analytics } from '@/components/admin/Analytics';
import { Committees } from '@/components/admin/Committees';
import { CommitteeTypes } from '@/components/admin/CommitteeTypes';
import { Users } from '@/components/admin/Users';
import { Onboarding } from '@/components/admin/Onboarding';
import { Announcements } from '@/components/admin/Announcements';
import { Branding } from '@/components/admin/Branding';
import { System } from '@/components/admin/System';
import { ParticipationOverview } from '@/components/admin/ParticipationOverview';
import { RubricEditor } from '@/components/admin/RubricEditor';
import { Documents } from '@/components/Documents';

function Panel() {
  const [tab, setTab] = useLocalState('mp-admin-tab', 'analytics');
  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">High Command</h1>
        <p className="text-sm text-slate-500">Conference-wide administration</p>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'analytics', label: 'Live analytics' },
          { id: 'committees', label: 'Committees & chairs' },
          { id: 'types', label: 'Types & categories' },
          { id: 'grades', label: 'Participation & grades' },
          { id: 'rubric', label: 'Grading rubric' },
          { id: 'users', label: 'Users & roles' },
          { id: 'onboarding', label: 'Invite & passwords' },
          { id: 'announcements', label: 'Announcements' },
          { id: 'documents', label: 'Global documents' },
          { id: 'branding', label: 'Branding' },
          { id: 'system', label: 'Archive & reset' },
        ]}
      />
      <div className="pt-1">
        {tab === 'analytics' && <Analytics />}
        {tab === 'committees' && <Committees />}
        {tab === 'types' && <CommitteeTypes />}
        {tab === 'grades' && <ParticipationOverview />}
        {tab === 'rubric' && <RubricEditor />}
        {tab === 'users' && <Users />}
        {tab === 'onboarding' && <Onboarding />}
        {tab === 'announcements' && <Announcements />}
        {tab === 'documents' && <Documents committeeId={null} />}
        {tab === 'branding' && <Branding />}
        {tab === 'system' && <System />}
      </div>
    </main>
  );
}

export default function AdminPage() {
  return (
    <>
      <AppHeader />
      <RequireAuth role="high_command">
        <Panel />
      </RequireAuth>
    </>
  );
}
