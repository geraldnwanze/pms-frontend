import type { Metadata } from 'next';
import '@/index.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'PMS — Property Management System',
  description:
    'Property Management System — portfolio, tenants, rent, payments, maintenance and reporting.',
  icons: { icon: '/favicon.svg' },
};

// Applied before hydration so the correct theme paints on first load (no flash).
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem('pms.theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
