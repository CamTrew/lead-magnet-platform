import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Magnets',
  description: 'Sign in to manage your Magnets lead magnets.',
};

export default function HomePage() {
  redirect('/login');
}
