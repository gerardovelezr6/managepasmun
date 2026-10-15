import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { BrandProvider } from '@/components/BrandProvider';
import { Toaster } from '@/components/Toaster';

export const metadata: Metadata = {
  title: 'ManagePASMUN',
  description: 'Live committee management for High Command and Chairs',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <BrandProvider>
            {children}
            <Toaster />
          </BrandProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
