import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { logout } from '@/app/actions';
import { NavLinks } from '@/components/nav-links';
import { Wordmark } from '@/components/wordmark';
import { requireUser } from '@/server/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <a href="#contenu" className="btn btn-primary absolute left-2 top-2 z-50 -translate-y-16 focus-visible:translate-y-0">
        Aller au contenu
      </a>
      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[84rem] items-stretch gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center" aria-label="Affût, revue de la semaine">
            <Wordmark />
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight md:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-ink-3">{user.org.name}</div>
            </div>
            <form action={logout}>
              <button type="submit" className="btn btn-quiet px-2" aria-label="Se déconnecter" title="Se déconnecter">
                <LogOut size={16} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </header>
      {user.org.isDemo ? (
        <p className="no-print border-b border-line bg-sunken px-4 py-1.5 text-center text-sm text-ink-2">Démonstration : athlètes et données fictifs, générés pour illustrer l’analyse.</p>
      ) : null}
      <main id="contenu" className="mx-auto w-full max-w-[84rem] px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
