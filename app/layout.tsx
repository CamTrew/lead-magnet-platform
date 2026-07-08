import type { Metadata, Viewport } from "next";
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { NavigationProgress } from '@/components/navigation-progress';
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';
const SITE_NAME = 'Magnets';
const DEFAULT_TITLE = 'Magnets. free lead-magnet pages on your own domain';
const DEFAULT_DESCRIPTION =
  'Build branded lead-magnet landing pages, deliver the resource by email, and collect signups. Free forever. Bring your own Resend, Beehiiv, and Substack keys.';
const DEFAULT_KEYWORDS = [
  'lead magnet',
  'lead magnet platform',
  'free lead magnet builder',
  'email capture page',
  'landing page builder',
  'newsletter signup',
  'beehiiv integration',
  'substack integration',
  'resend integration',
  'custom domain landing page',
  'opt-in form',
  'free email collection tool',
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: '%s. Magnets',
  },
  description: DEFAULT_DESCRIPTION,
  keywords: DEFAULT_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: 'Magnets' }],
  creator: 'Magnets',
  publisher: 'Magnets',
  formatDetection: { email: false, telephone: false, address: false },
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
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
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  manifest: '/manifest.json',
  category: 'productivity',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
  themeColor: '#F7F5F1',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased font-sans">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
