import type { Metadata, Viewport } from "next";
import { Suspense } from 'react';
import localFont from 'next/font/local';
import { GeistMono } from 'geist/font/mono';
import { NavigationProgress } from '@/components/navigation-progress';
import { AppThemeBoundary } from '@/components/app-theme-boundary';
import { ThemeProvider } from '@/components/theme-provider';
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';
const SITE_NAME = 'Magnets';
const DEFAULT_TITLE = 'Magnets. Lead magnets that bring in leads';
const DEFAULT_DESCRIPTION =
  'Build branded lead-magnet landing pages, deliver the resource by email, collect signups, and follow up from one place.';

const MagnetsGeist = localFont({
  src: './fonts/geist-vf.ttf',
  display: 'swap',
  variable: '--font-magnets-geist',
  weight: '100 900',
});

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
    images: [
      {
        url: '/landing-dashboard.png',
        width: 1280,
        height: 720,
        alt: 'Magnets lead magnet builder dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ['/landing-dashboard.png'],
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
    { media: '(prefers-color-scheme: dark)', color: '#0f0f11' },
  ],
};

const themeScript = `
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
      className={`${MagnetsGeist.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
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
