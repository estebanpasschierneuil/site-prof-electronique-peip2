import { intervalsProvider } from './intervals';
import type { TrainingDataProvider } from './provider';
import { stravaProvider } from './strava';

/** Connecteurs opérationnels. En ajouter un = implémenter `TrainingDataProvider` et l'inscrire ici. */
export const PROVIDERS: Record<string, TrainingDataProvider> = {
  strava: stravaProvider,
  intervals: intervalsProvider,
};

export const PROVIDER_LABELS: Record<string, string> = { strava: 'Strava', intervals: 'intervals.icu', garmin: 'Garmin Connect', demo: 'Démo' };
