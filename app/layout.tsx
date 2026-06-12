import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lead Magnet Platform",
  description: "Create branded lead magnet landing pages with your own domain, email, and newsletter integrations.",
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
