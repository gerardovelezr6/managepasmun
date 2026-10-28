'use client';
import { AppHeader } from '@/components/AppHeader';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { CommitteeGrid } from '@/components/CommitteeGrid';
import { useSettings } from '@/components/BrandProvider';

export default function Home() {
  const { settings } = useSettings();
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <section className="bg-gradient-to-br from-brand to-slate-900 p-8 text-white on-dark">
          <h1 className="text-3xl font-extrabold tracking-tight">{settings.conference_name}</h1>
          <p className="mt-2 max-w-2xl text-white/80">{settings.tagline}</p>
          <p className="mt-4 text-sm text-white/70">{settings.conference_dates} · {settings.venue}</p>
        </section>
        <AnnouncementBanner />
        <section>
          <h2 className="mb-3 text-lg font-bold">Committees</h2>
          <CommitteeGrid />
        </section>
      </main>
    </>
  );
}
