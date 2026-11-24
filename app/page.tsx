import type { Metadata } from 'next';
import { CreationLanding } from '@/components/landing/creation-landing';
import { safeJsonLd } from '@/lib/lead-magnet-metadata';
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so').replace(/\/$/, '');
export const metadata: Metadata = {
  title: 'Turn your knowledge into your next customer',
  description: 'Create a lead magnet, grow your email list, and give your next customer a reason to find you. Start with one idea.',
  alternates: { canonical: SITE_URL },
};
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Magnets',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/brand/magnets-mark-dark.png`,
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Magnets',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en',
    },
    {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/#webpage`,
      name: 'Lead Magnet Builder for Landing Pages and Email Capture',
      description:
        'Create lead magnet landing pages, capture emails, deliver resources instantly, and follow up automatically.',
      url: SITE_URL,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#software` },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'Magnets',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      description:
        'A lead magnet builder for landing pages, email capture, resource delivery, and follow-up email sequences.',
      provider: { '@id': `${SITE_URL}/#organization` },
      featureList: [
        'Lead magnet landing pages',
        'Email capture forms',
        'Instant resource delivery',
        'Follow-up email sequences',
        'Custom domains',
        'Beehiiv, Kit, Slack, Pipedrive, and Zapier integrations',
      ],
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
  ],
};
export default function HomePage() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }} /><CreationLanding designPreview={process.env.MAGNETS_STAGING_PREVIEW === '1'} /></>;
}
