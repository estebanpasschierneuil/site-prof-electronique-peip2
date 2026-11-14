import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AthleteForm } from '@/components/athlete-form';
import { requireUser } from '@/server/auth';

export const metadata: Metadata = { title: 'Nouvel athlète' };

export default async function NewAthletePage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/athletes" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden="true" />
        Athlètes
      </Link>
      <div>
        <h1 className="text-2xl">Nouvel athlète</h1>
        <p className="mt-1 text-ink-2">Vous pourrez connecter sa plateforme d’entraînement à l’étape suivante.</p>
      </div>
      <div className="panel p-5">
        <AthleteForm />
      </div>
    </div>
  );
}
