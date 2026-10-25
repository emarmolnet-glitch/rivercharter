ALTER TABLE "barges" ADD COLUMN "latitude" numeric(10,6);--> statement-breakpoint
ALTER TABLE "barges" ADD COLUMN "longitude" numeric(10,6);--> statement-breakpoint
ALTER TABLE "barges" ADD COLUMN "last_telemetry_at" timestamp with time zone;