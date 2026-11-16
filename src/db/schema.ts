import { relations, sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { WeeklyAnalysis } from '@/core/types';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Une organisation = un coach indépendant, un club ou une structure de coaching. */
export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan', { enum: ['trial', 'solo', 'team'] }).notNull().default('trial'),
  isDemo: boolean('is_demo').notNull().default(false),
  timezone: text('timezone').notNull().default('Europe/Paris'),
  createdAt: createdAt(),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['owner', 'coach'] }).notNull().default('coach'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_unique').on(sql`lower(${t.email})`), index('users_org_idx').on(t.orgId)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 du jeton : le jeton lui-même ne vit que dans le cookie. */
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const athletes = pgTable(
  'athletes',
  {
    id: id(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    coachId: uuid('coach_id').references(() => users.id, { onDelete: 'set null' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    sex: text('sex', { enum: ['F', 'M'] }),
    birthYear: integer('birth_year'),
    distance: text('distance', { enum: ['S', 'M', 'L', 'XL'] }),
    weeklyHours: real('weekly_hours'),
    ftpW: integer('ftp_w'),
    runThresholdPaceS: integer('run_threshold_pace_s'),
    swimCssS: integer('swim_css_s'),
    lthr: integer('lthr'),
    maxHr: integer('max_hr'),
    restHr: integer('rest_hr'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /** Dernière modification des données sources : invalide les analyses mises en cache. */
    dataUpdatedAt: timestamp('data_updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('athletes_org_idx').on(t.orgId)],
);

export const races = pgTable(
  'races',
  {
    id: id(),
    athleteId: uuid('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    name: text('name').notNull(),
    distance: text('distance', { enum: ['S', 'M', 'L', 'XL'] }).notNull(),
    priority: text('priority', { enum: ['A', 'B', 'C'] }).notNull().default('B'),
  },
  (t) => [index('races_athlete_idx').on(t.athleteId, t.date)],
);

/** Lien entre un athlète et une plateforme source (jetons chiffrés au repos). */
export const connections = pgTable(
  'connections',
  {
    id: id(),
    athleteId: uuid('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    externalAthleteId: text('external_athlete_id'),
    accessTokenEnc: text('access_token_enc'),
    refreshTokenEnc: text('refresh_token_enc'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    status: text('status', { enum: ['active', 'error', 'revoked'] }).notNull().default('active'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('connections_athlete_provider_unique').on(t.athleteId, t.provider)],
);

export const activities = pgTable(
  'activities',
  {
    id: id(),
    athleteId: uuid('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    /** Jour local de l'athlète : c'est l'unité de raisonnement du moteur. */
    date: date('date', { mode: 'string' }).notNull(),
    startAt: timestamp('start_at', { withTimezone: true }),
    sport: text('sport', { enum: ['swim', 'bike', 'run', 'strength', 'other'] }).notNull(),
    title: text('title').notNull(),
    durationS: integer('duration_s').notNull(),
    distanceM: real('distance_m'),
    elevationM: real('elevation_m'),
    avgHr: integer('avg_hr'),
    avgPowerW: integer('avg_power_w'),
    normalizedPowerW: integer('normalized_power_w'),
    rpe: integer('rpe'),
    zoneSeconds: jsonb('zone_seconds').$type<number[]>(),
    load: real('load').notNull(),
    intensityFactor: real('intensity_factor'),
    loadMethod: text('load_method', { enum: ['power', 'pace', 'hr', 'rpe', 'duration'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('activities_source_unique').on(t.athleteId, t.source, t.externalId), index('activities_athlete_date_idx').on(t.athleteId, t.date)],
);

export const plannedWorkouts = pgTable(
  'planned_workouts',
  {
    id: id(),
    athleteId: uuid('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    sport: text('sport', { enum: ['swim', 'bike', 'run', 'strength', 'other'] }).notNull(),
    kind: text('kind', { enum: ['recovery', 'endurance', 'long', 'tempo', 'threshold', 'vo2', 'technique', 'strength', 'brick', 'race'] }).notNull(),
    title: text('title').notNull(),
    durationS: integer('duration_s').notNull(),
    load: real('load').notNull(),
    isKey: boolean('is_key').notNull().default(false),
  },
  (t) => [index('planned_athlete_date_idx').on(t.athleteId, t.date)],
);

export const wellnessDays = pgTable(
  'wellness_days',
  {
    athleteId: uuid('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    hrv: real('hrv'),
    restingHr: integer('resting_hr'),
    sleepH: real('sleep_h'),
    fatigue: integer('fatigue'),
    soreness: integer('soreness'),
    mood: integer('mood'),
  },
  (t) => [primaryKey({ columns: [t.athleteId, t.date] })],
);

/** Analyse d'une semaine, calculée une fois puis servie telle quelle à la revue. */
export const weeklyAnalyses = pgTable(
  'weekly_analyses',
  {
    athleteId: uuid('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    status: text('status', { enum: ['action', 'watch', 'ok'] }).notNull(),
    priority: integer('priority').notNull(),
    engineVersion: integer('engine_version').notNull(),
    asOf: date('as_of', { mode: 'string' }).notNull(),
    payload: jsonb('payload').$type<WeeklyAnalysis>().notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.athleteId, t.weekStart] })],
);

/** Trace du travail du coach : semaine revue, note, message envoyé. */
export const weeklyReviews = pgTable(
  'weekly_reviews',
  {
    athleteId: uuid('athlete_id').notNull().references(() => athletes.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    note: text('note').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.athleteId, t.weekStart] })],
);

export const athletesRelations = relations(athletes, ({ one, many }) => ({
  coach: one(users, { fields: [athletes.coachId], references: [users.id] }),
  connections: many(connections),
  races: many(races),
}));
export const connectionsRelations = relations(connections, ({ one }) => ({ athlete: one(athletes, { fields: [connections.athleteId], references: [athletes.id] }) }));
export const racesRelations = relations(races, ({ one }) => ({ athlete: one(athletes, { fields: [races.athleteId], references: [athletes.id] }) }));
