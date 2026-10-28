'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { BrandMark, useSettings } from './BrandProvider';
import { useT } from '@/lib/i18n';

export function AppHeader() {
  const { profile, session, isHC, signOut } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();
  const t = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <BrandMark size={34} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold text-slate-900">{settings.conference_name}</div>
            <div className="truncate text-xs text-slate-500">{settings.tagline}</div>
          </div>
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link href="/" className="btn btn-ghost btn-sm">{t('Committees')}</Link>
          {session && <Link href="/dashboard" className="btn btn-ghost btn-sm">{t('Dashboard')}</Link>}
          {isHC && <Link href="/admin" className="btn btn-ghost btn-sm">{t('High Command')}</Link>}
          {session ? (
            <>
              <span className="hidden px-2 text-xs text-slate-500 sm:inline">{profile?.full_name || profile?.email}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  await signOut();
                  router.push('/login');
                }}
              >
                {t('Sign out')}
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm">{t('Chair / HC login')}</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
