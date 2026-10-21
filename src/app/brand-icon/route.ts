import { NextResponse } from 'next/server';

// Browser-tab icon = the logo uploaded in the Branding tab. Falls back to a plain brand-colored badge.
export const revalidate = 300;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let logo: string | null = null;
  let color = '#1e40af';
  let short = 'P';
  if (url && key) {
    try {
      const r = await fetch(`${url}/rest/v1/settings?select=logo_url,primary_color,short_name&id=eq.1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 300 },
      });
      const row = (await r.json())?.[0];
      logo = row?.logo_url || null;
      color = /^#[0-9a-f]{6}$/i.test(row?.primary_color || '') ? row.primary_color : color;
      short = (row?.short_name || 'P').trim().charAt(0).toUpperCase() || 'P';
    } catch {}
  }
  if (logo) {
    try {
      const img = await fetch(logo);
      if (img.ok) {
        return new NextResponse(await img.arrayBuffer(), {
          headers: { 'Content-Type': img.headers.get('content-type') || 'image/png', 'Cache-Control': 'public, max-age=300, s-maxage=300' },
        });
      }
    } catch {}
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="45" font-family="Arial,sans-serif" font-size="38" font-weight="700" text-anchor="middle" fill="#fff">${short}</text></svg>`;
  return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300, s-maxage=300' } });
}
