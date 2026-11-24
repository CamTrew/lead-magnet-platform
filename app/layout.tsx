import type { Metadata, Viewport } from "next";
import { Suspense } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { NavigationProgress } from '@/components/navigation-progress';
import { AppThemeBoundary } from '@/components/app-theme-boundary';
import { ThemeProvider } from '@/components/theme-provider';
import { DARK_FLOW_ROUTES } from '@/lib/app-route-theme';
import { SITE_SOCIAL_IMAGE, SITE_SOCIAL_TITLE, SITE_SOCIAL_DESCRIPTION } from '@/lib/site-social';
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';
const SITE_NAME = 'Magnets';
const DEFAULT_TITLE = SITE_SOCIAL_TITLE;
const DEFAULT_DESCRIPTION = SITE_SOCIAL_DESCRIPTION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: '%s. Magnets',
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: 'Magnets', url: SITE_URL }],
  creator: 'Magnets',
  publisher: 'Magnets',
  referrer: 'origin-when-cross-origin',
  formatDetection: { email: false, telephone: false, address: false },
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [SITE_SOCIAL_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [SITE_SOCIAL_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [{ url: '/brand/magnets-mark-dark.png', type: 'image/png', sizes: '1024x1024' }],
    apple: [{ url: '/brand/magnets-mark-dark.png', type: 'image/png', sizes: '1024x1024' }],
  },
  manifest: '/manifest.json',
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { 'msvalidate.01': [process.env.BING_SITE_VERIFICATION] }
      : undefined,
  },
  category: 'productivity',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F5F1' },
    { media: '(prefers-color-scheme: dark)', color: '#111111' },
  ],
};

const themeScript = `
  var path = window.location.pathname;
  document.documentElement.toggleAttribute('data-magnets-flow',
    ${JSON.stringify(DARK_FLOW_ROUTES)}.some(function(route) {
      return path === route || (route !== '/' && path.indexOf(route + '/') === 0);
    })
  );
  try {
    var saved = localStorage.getItem('magnets-theme');
    var theme = saved === 'light' || saved === 'dark'
      ? saved
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <style>{`html[data-magnets-flow],html[data-magnets-flow] body{background:#111111!important;color-scheme:dark!important}`}</style>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased font-sans">
        <ThemeProvider>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <AppThemeBoundary>{children}</AppThemeBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
