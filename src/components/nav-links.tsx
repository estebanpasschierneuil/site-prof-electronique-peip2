'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Revue', match: (p: string) => p === '/' },
  { href: '/athletes', label: 'Athlètes', match: (p: string) => p.startsWith('/athletes') },
  { href: '/integrations', label: 'Intégrations', match: (p: string) => p.startsWith('/integrations') },
  { href: '/methode', label: 'Méthode', match: (p: string) => p.startsWith('/methode') },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex h-full items-stretch gap-1 overflow-x-auto">
      {LINKS.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center border-b-2 px-3 text-base transition-colors duration-[var(--dur-micro)] ${active ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
