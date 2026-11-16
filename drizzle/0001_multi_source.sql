CREATE TABLE "wellness_samples" (
	"athlete_id" uuid NOT NULL,
	"date" date NOT NULL,
	"source" text NOT NULL,
	"hrv" real,
	"resting_hr" integer,
	"sleep_h" real,
	"fatigue" integer,
	"soreness" integer,
	"mood" integer,
	CONSTRAINT "wellness_samples_athlete_id_date_source_pk" PRIMARY KEY("athlete_id","date","source")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "duplicate_of" uuid;--> statement-breakpoint
ALTER TABLE "wellness_samples" ADD CONSTRAINT "wellness_samples_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_duplicate_of_activities_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;