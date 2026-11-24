import { notFound } from 'next/navigation';
import { SignupFieldsPreview } from './signup-fields-preview';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Signup fields preview | Magnets', robots: { index: false, follow: false } };

export default function SignupFieldsPage() {
  if (process.env.MAGNETS_STAGING_PREVIEW !== '1') notFound();
  return <SignupFieldsPreview />;
}
