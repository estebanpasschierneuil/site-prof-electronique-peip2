import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { ACCEPTED_EXTENSIONS, FileFormatError, parseActivityFile } from '@/integrations/files/parse';
import { ingestActivities, touchAthlete } from '@/integrations/ingest';
import { assertAthleteInOrg } from '@/server/analysis';
import { getCurrentUser } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_FILES = 40;
const MAX_BYTES = 25 * 1024 * 1024;

export interface ImportedFile {
  name: string;
  ok: boolean;
  /** Résumé lisible : ce qui a été importé, ou pourquoi le fichier est refusé. */
  message: string;
}

/**
 * Import de fichiers d'activité (FIT, TCX, GPX) pour un athlète.
 * Réimporter un fichier déjà connu ne crée pas de doublon.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
  // Requête émise par notre propre interface uniquement.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host')) return NextResponse.json({ error: 'Origine refusée.' }, { status: 403 });

  const { id } = await params;
  const athlete = /^[0-9a-f-]{36}$/i.test(id) ? await assertAthleteInOrg(user.org.id, id).catch(() => null) : null;
  if (!athlete) return NextResponse.json({ error: 'Athlète introuvable.' }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'Aucun fichier reçu.' }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `${MAX_FILES} fichiers au maximum par envoi.` }, { status: 400 });

  const db = await getDb();
  const results: ImportedFile[] = [];
  let imported = 0;
  for (const file of files) {
    try {
      if (file.size > MAX_BYTES) throw new FileFormatError('Fichier trop volumineux (25 Mo au maximum).');
      if (!ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) throw new FileFormatError('Format non pris en charge. Formats acceptés : FIT, TCX, GPX.');
      const sessions = parseActivityFile(file.name, new Uint8Array(await file.arrayBuffer()), { lthr: athlete.lthr, timeZone: user.org.timezone }).filter((s) => s.durationS >= 60);
      if (sessions.length === 0) throw new FileFormatError('Aucune séance de plus d’une minute dans ce fichier.');
      imported += await ingestActivities(db, athlete, 'file', sessions);
      const first = sessions[0];
      results.push({ name: file.name, ok: true, message: `${sessions.length > 1 ? `${sessions.length} séances` : first.title} du ${first.date.split('-').reverse().join('/')}, ${Math.round(first.durationS / 60)} min` });
    } catch (error) {
      results.push({ name: file.name, ok: false, message: error instanceof FileFormatError ? error.message : 'Fichier illisible ou endommagé.' });
    }
  }
  if (imported > 0) await touchAthlete(db, athlete.id);
  return NextResponse.json({ imported, files: results });
}
