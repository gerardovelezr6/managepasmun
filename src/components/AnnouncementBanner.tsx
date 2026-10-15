'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveReload } from '@/lib/hooks';
import { Announcement } from '@/lib/types';

export function useActiveAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  useLiveReload(['announcements'], async () => {
    const { data } = await supabase().from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
    const now = Date.now();
    setItems(((data || []) as Announcement[]).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > now));
  });
  return items;
}

export function AnnouncementBanner({ max = 3 }: { max?: number }) {
  const items = useActiveAnnouncements().slice(0, max);
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div
          key={a.id}
          className={`flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${
            a.severity === 'urgent' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <span className="mt-0.5 text-xs font-bold uppercase tracking-wide">{a.severity === 'urgent' ? 'Urgent' : 'Announcement'}</span>
          <span className="flex-1">{a.message}</span>
        </div>
      ))}
    </div>
  );
}
