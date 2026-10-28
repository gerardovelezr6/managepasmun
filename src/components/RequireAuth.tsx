'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useT } from '@/lib/i18n';
import { Spinner } from './ui';

export function RequireAuth({ role, children }: { role?: 'high_command'; children: React.ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();
  const t = useT();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace(`/login?next=${encodeURIComponent(path || '/dashboard')}`);
  }, [loading, session, router, path]);

  if (loading || !session) return <Spinner label={t('Checking your login…')} />;

  if (!profile || profile.role === 'pending') {
    return (
      <div className="mx-auto mt-16 max-w-md card text-center">
        <h2 className="text-lg font-bold">{t('No access yet')}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t('This account has not been given a role. Ask High Command to make you a Chair or High Command member.')}
        </p>
        <button className="btn btn-secondary mt-4" onClick={() => signOut()}>{t('Sign out')}</button>
      </div>
    );
  }
  if (role === 'high_command' && profile.role !== 'high_command' && profile.role !== 'advisor') {
    return (
      <div className="mx-auto mt-16 max-w-md card text-center">
        <h2 className="text-lg font-bold">{t('High Command only')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('Your account does not have access to this page.')}</p>
        <Link href="/dashboard" className="btn btn-primary mt-4">{t('Back to dashboard')}</Link>
      </div>
    );
  }
  return <>{children}</>;
}
