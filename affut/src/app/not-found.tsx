import Link from 'next/link';
import { Wordmark } from '@/components/wordmark';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <Wordmark />
      <h1 className="mt-8 text-2xl">Page introuvable</h1>
      <p className="mt-2 text-ink-2">Cette adresse ne correspond à aucune page, ou l’athlète n’appartient pas à votre structure.</p>
      <Link href="/" className="btn btn-primary mt-6 self-start">
        Revenir à la revue
      </Link>
    </main>
  );
}
