import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal-page';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://magnets.so';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms covering use of Magnets, the free lead-magnet platform.',
  alternates: { canonical: `${SITE_URL}/terms` },
  openGraph: {
    title: 'Magnets — Terms of Service',
    description: 'The terms covering use of Magnets, the free lead-magnet platform.',
    url: `${SITE_URL}/terms`,
  },
};

const EFFECTIVE = 'June 13, 2026';

export default function TermsPage() {
  return (
    <LegalPage effective={EFFECTIVE} subtitle="Legal" title="Terms of Service">
      <p>
        These Terms govern your use of Magnets (the &ldquo;Service&rdquo;), a free lead-magnet platform operated by the
        Magnets team (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using the Service you agree to
        these Terms. If you do not agree, do not use the Service.
      </p>

      <LegalSection title="1. What Magnets is">
        <p>
          Magnets lets you build branded landing pages that collect an email address in exchange for a downloadable
          resource. We deliver the resource to the subscriber by email and, if you ask us to, forward the subscriber to
          a third-party newsletter (such as Beehiiv or Substack). The Service is provided free of charge.
        </p>
      </LegalSection>

      <LegalSection title="2. The account is yours">
        <p>
          You are responsible for the email address, password, and integration credentials (such as your Resend,
          Beehiiv, or Substack API keys) you connect to your account. Keep them confidential and use them only with
          accounts you own or have permission to use. You are responsible for everything that happens under your
          account.
        </p>
      </LegalSection>

      <LegalSection title="2.1 Magnets product newsletter">
        <p>
          When you register, we add your email address to the Magnets product newsletter. We use it for product
          updates, occasional tips, and important changes that affect your account. You can unsubscribe at any time
          from the link in the footer of any email, or by emailing{' '}
          <a className="text-ink-900 underline-offset-4 hover:underline" href="mailto:hello@magnets.so">hello@magnets.so</a>
          . Unsubscribing from the newsletter does not delete your account or stop transactional emails (password
          resets, security alerts, etc.).
        </p>
      </LegalSection>

      <LegalSection title="3. Bring your own keys">
        <p>
          Magnets does not provide email sending or newsletter accounts. To send the resource email you must connect
          your own Resend API key. To forward subscribers to a newsletter you must connect your own Beehiiv key or
          Substack publication. We pass requests to those third parties using the credentials you provide; their terms
          and pricing apply to your use of their services.
        </p>
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Send unsolicited bulk email or violate anti-spam laws (CAN-SPAM, CASL, GDPR, PECR, etc.).</li>
          <li>Distribute malware, phishing material, illegal content, or content that infringes someone else&apos;s rights.</li>
          <li>Collect personal data without a lawful basis, or in violation of any applicable privacy law.</li>
          <li>Abuse our infrastructure: scraping, mass automation, attempts to circumvent rate limits, and so on.</li>
          <li>Resell the Service or rebrand it as your own.</li>
        </ul>
        <p>
          We may suspend or terminate any account that we reasonably believe is being used in violation of these Terms
          or in a way that endangers the Service or other users.
        </p>
      </LegalSection>

      <LegalSection title="5. Your content">
        <p>
          You own the pages, copy, images, and resources you upload to the Service, and the email addresses you
          collect. You grant us the limited rights needed to host them, deliver them, and operate the Service. We
          don&apos;t claim ownership and we don&apos;t use your content to train models or sell to third parties.
        </p>
      </LegalSection>

      <LegalSection title="6. Free service — no warranties">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind,
          either express or implied, including the implied warranties of merchantability, fitness for a particular
          purpose, non-infringement, or uninterrupted operation. We do not promise that the Service will be error-free,
          secure, or available at any particular time.
        </p>
      </LegalSection>

      <LegalSection title="7. Limitation of liability">
        <p>
          To the maximum extent permitted by law, in no event will we be liable for any indirect, incidental, special,
          consequential, or punitive damages, or any loss of profits, revenue, data, or goodwill, arising out of or
          related to your use of the Service. Our total cumulative liability for any claim arising out of or relating
          to the Service is limited to one hundred US dollars (USD&nbsp;$100), even if we have been advised of the
          possibility of such damages.
        </p>
        <p>
          Because the Service is provided free of charge, you understand that we accept a much lower level of risk than
          a paid service might.
        </p>
      </LegalSection>

      <LegalSection title="8. Third-party services">
        <p>
          The Service relies on third-party providers (such as Vercel for hosting, Neon for the database, Resend for
          email sending, and Beehiiv or Substack for newsletter forwarding). Their availability, terms, and privacy
          practices are outside our control. We are not responsible for outages, data loss, or charges caused by those
          third parties.
        </p>
      </LegalSection>

      <LegalSection title="9. Termination">
        <p>
          You can stop using the Service at any time. You can delete your account from the dashboard; on deletion we
          will remove your account record and the lead-magnet pages you created within thirty (30) days. We may
          suspend or terminate the Service, or any account, at our discretion, with or without notice, for any reason
          (including non-use or violation of these Terms).
        </p>
      </LegalSection>

      <LegalSection title="10. Changes">
        <p>
          We may update these Terms from time to time. If the changes are material we will give reasonable notice
          (for example, by email or a notice in the dashboard) before they take effect. Continued use of the Service
          after a change means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection title="11. Governing law">
        <p>
          These Terms are governed by the laws of England and Wales, without regard to its conflict-of-laws principles.
          Any dispute will be resolved exclusively in the courts located in London, England, unless required otherwise
          by mandatory law.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          Reach us at <a className="text-ink-900 underline-offset-4 hover:underline" href="mailto:hello@magnets.so">hello@magnets.so</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
