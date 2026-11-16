import { intervalsProvider } from './intervals';
import { ouraProvider } from './oura';
import { polarProvider } from './polar';
import type { TrainingDataProvider } from './provider';
import { stravaProvider } from './strava';
import { wahooProvider } from './wahoo';
import { whoopProvider } from './whoop';

/** Connecteurs opérationnels. En ajouter un = implémenter `TrainingDataProvider` et l'inscrire ici. */
export const PROVIDERS: Record<string, TrainingDataProvider> = {
  intervals: intervalsProvider,
  strava: stravaProvider,
  polar: polarProvider,
  wahoo: wahooProvider,
  whoop: whoopProvider,
  oura: ouraProvider,
};

export const PROVIDER_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.values(PROVIDERS).map((p) => [p.id, p.label])),
  garmin: 'Garmin Connect',
  file: 'Fichiers importés',
};

/** Plateformes que l'athlète peut autoriser lui-même depuis son lien d'invitation. */
export const oauthProviders = () => Object.values(PROVIDERS).filter((p) => p.auth === 'oauth');
