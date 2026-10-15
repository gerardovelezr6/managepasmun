'use client';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { CommitteeGrid } from '@/components/CommitteeGrid';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/components/AuthProvider';

function Inner() {
  const { profile, isHC } = useAuth();
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {profile?.full_name || profile?.email}</h1>
          <p className="text-sm text-slate-500">{isHC ? 'High Command: you can run any committee.' : 'Your committees'}</p>
        </div>
        {isHC && <Link href="/admin" className="btn btn-primary">Open High Command panel</Link>}
      </div>
      <AnnouncementBanner />
      <CommitteeGrid onlyMine />
    </main>
  );
}

export default function Dashboard() {
  return (
    <>
      <AppHeader />
      <RequireAuth>
        <Inner />
      </RequireAuth>
    </>
  );
}
