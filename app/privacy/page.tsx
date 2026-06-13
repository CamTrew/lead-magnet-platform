import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal-page';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Magnets handles account and subscriber data. We never sell, never train AI on it.',
  alternates: { canonical: `${SITE_URL}/privacy` },
  openGraph: {
    title: 'Magnets — Privacy Policy',
    description: 'How Magnets handles account and subscriber data. We never sell, never train AI on it.',
    url: `${SITE_URL}/privacy`,
  },
};

const EFFECTIVE = 'June 13, 2026';

export default function PrivacyPage() {
  return (
    <LegalPage effective={EFFECTIVE} subtitle="Legal" title="Privacy Policy">
      <p>
        This Policy explains what data we collect when you use Magnets, why we collect it, and what we don&apos;t do
        with it. It applies to both Magnets account holders and the subscribers who sign up on a Magnets page.
      </p>

      <LegalSection title="1. The short version">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We collect only what we need to run the Service.</li>
          <li>We never sell your data, never share it with advertisers, never use it to train AI models.</li>
          <li>Subscriber data belongs to the account holder who built the page, not to us.</li>
          <li>Integration API keys you connect are encrypted at rest with AES-256-GCM.</li>
          <li>You can delete your account and the data we hold for it at any time.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Data we collect — account holders">
        <p>When you create a Magnets account we store:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your name, email address, and a hashed password (never the plaintext password).</li>
          <li>Account configuration: brand, sending domain, subdomain, logo, color choices.</li>
          <li>
            Integration credentials you choose to connect (Resend API key, Beehiiv API key + publication ID, Substack
            publication). API keys are encrypted at rest.
          </li>
          <li>The pages and email copy you create.</li>
          <li>Standard operational metadata: timestamps, IP addresses for rate limiting, error logs.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Data we collect — subscribers">
        <p>
          When someone signs up on a Magnets-hosted page, we collect the name and email address they submit, the
          lead-magnet page they signed up on, and the timestamp. We store this against the account that owns the page,
          deduplicated by email address.
        </p>
        <p>
          We act as a <strong>data processor</strong> for the subscriber data on behalf of the account holder. The
          account holder is the <strong>data controller</strong> and is responsible for having a lawful basis to
          collect that data and for any further communication with the subscriber.
        </p>
      </LegalSection>

      <LegalSection title="4. How we use the data">
        <p>We use the data we collect to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Operate, maintain, and secure the Service.</li>
          <li>Send the lead-magnet email to the subscriber (via the account holder&apos;s connected Resend key).</li>
          <li>
            Forward the subscriber to the newsletter the account holder has chosen (Beehiiv or Substack), if any.
          </li>
          <li>Authenticate account holders and prevent abuse (rate limiting, anti-spam).</li>
          <li>Respond to support requests.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. What we don&apos;t do">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>We don&apos;t sell or rent your data, or your subscribers&apos; data, to anyone.</li>
          <li>We don&apos;t use your content or subscriber data to train AI models.</li>
          <li>We don&apos;t place advertising in the Service or in the emails we send on your behalf.</li>
          <li>We don&apos;t email your subscribers ourselves — only via the account holder&apos;s sender setup.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Sub-processors">
        <p>
          To run the Service, we rely on the following sub-processors. They have their own privacy policies and process
          data on our behalf under data-processing agreements:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Vercel</strong> — application hosting and CDN.</li>
          <li><strong>Neon</strong> — managed Postgres database.</li>
          <li><strong>Resend</strong> — email delivery (using each account holder&apos;s own key).</li>
          <li><strong>Beehiiv</strong> — newsletter forwarding (optional, account holder&apos;s own key).</li>
          <li><strong>Substack</strong> — newsletter forwarding (optional, account holder&apos;s own publication).</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Retention">
        <p>
          We retain account data while the account is active. If you delete your account we delete your account record,
          lead-magnet pages, and subscriber list within thirty (30) days, except where we need to keep specific records
          to comply with a legal obligation, resolve a dispute, or enforce our agreements. Backups roll off
          automatically within a further thirty (30) days.
        </p>
      </LegalSection>

      <LegalSection title="8. Security">
        <p>
          We use industry-standard measures to protect data in transit (HTTPS) and at rest (AES-256-GCM for stored
          integration secrets, hashed passwords). No system is perfectly secure; if we ever experience a breach that
          affects you, we will notify you without undue delay.
        </p>
      </LegalSection>

      <LegalSection title="9. Your rights">
        <p>
          Depending on where you live, you may have rights under privacy laws such as the GDPR or the UK GDPR,
          including the right to access, correct, port, or delete your personal data. To exercise these rights, email{' '}
          <a className="text-ink-900 underline-offset-4 hover:underline" href="mailto:hello@magnets.so">hello@magnets.so</a>.
          If you are a subscriber, please first contact the account holder whose page you signed up on — they are the
          controller of your data.
        </p>
      </LegalSection>

      <LegalSection title="10. International transfers">
        <p>
          Our sub-processors operate in various countries, including the United States and the European Union. Where
          required, transfers rely on Standard Contractual Clauses or equivalent safeguards.
        </p>
      </LegalSection>

      <LegalSection title="11. Children">
        <p>
          The Service is not directed at children under 16. We do not knowingly collect personal data from children
          under 16. If you believe we have, contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes">
        <p>
          We may update this Policy from time to time. If the changes are material we will give reasonable notice
          before they take effect.
        </p>
      </LegalSection>

      <LegalSection title="13. Contact">
        <p>
          Email <a className="text-ink-900 underline-offset-4 hover:underline" href="mailto:hello@magnets.so">hello@magnets.so</a>{' '}
          with any privacy questions.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
