CREATE TABLE "barges" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"barge_number" varchar(100),
	"barge_type" varchar(50) DEFAULT 'HOPPER' NOT NULL,
	"capacity" numeric(12,2) NOT NULL,
	"dynamic_draft" numeric(6,2) NOT NULL,
	"iot_tracking_id" varchar(100) UNIQUE,
	"status" varchar(50) DEFAULT 'AVAILABLE' NOT NULL,
	"current_location" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barges_capacity_positive_check" CHECK ("capacity" > 0),
	CONSTRAINT "barges_dynamic_draft_positive_check" CHECK ("dynamic_draft" > 0)
);
--> statement-breakpoint
CREATE TABLE "river_voyages" (
	"id" serial PRIMARY KEY,
	"voyage_number" varchar(100) NOT NULL UNIQUE,
	"tugboat_id" integer NOT NULL,
	"river_name" varchar(150) NOT NULL,
	"origin_terminal" varchar(255) NOT NULL,
	"destination_terminal" varchar(255) NOT NULL,
	"min_water_level" numeric(6,2) NOT NULL,
	"current_water_level" numeric(6,2),
	"departure_date" timestamp with time zone,
	"estimated_arrival_date" timestamp with time zone,
	"actual_arrival_date" timestamp with time zone,
	"status" varchar(50) DEFAULT 'PLANNED' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "river_voyages_min_water_level_positive_check" CHECK ("min_water_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tugboats" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"motor" varchar(255) NOT NULL,
	"engine_power_hp" integer,
	"daily_opex" numeric(12,2) NOT NULL,
	"mmsi" varchar(20),
	"bollard_pull_tons" numeric(8,2),
	"status" varchar(50) DEFAULT 'OPERATIONAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tugboats_daily_opex_positive_check" CHECK ("daily_opex" >= 0)
);
--> statement-breakpoint
CREATE TABLE "voyage_barges" (
	"id" serial PRIMARY KEY,
	"voyage_id" integer NOT NULL,
	"barge_id" integer NOT NULL,
	"coupling_point" varchar(255) NOT NULL,
	"decoupling_point" varchar(255),
	"coupled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decoupled_at" timestamp with time zone,
	"cargo_description" varchar(255),
	"cargo_weight_tons" numeric(12,2),
	"loaded_draft_meters" numeric(6,2),
	"status" varchar(50) DEFAULT 'COUPLED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "barges_iot_tracking_id_idx" ON "barges" ("iot_tracking_id");--> statement-breakpoint
CREATE INDEX "river_voyages_tugboat_id_idx" ON "river_voyages" ("tugboat_id");--> statement-breakpoint
CREATE INDEX "river_voyages_voyage_number_idx" ON "river_voyages" ("voyage_number");--> statement-breakpoint
CREATE INDEX "tugboats_mmsi_idx" ON "tugboats" ("mmsi");--> statement-breakpoint
CREATE INDEX "voyage_barges_voyage_id_idx" ON "voyage_barges" ("voyage_id");--> statement-breakpoint
CREATE INDEX "voyage_barges_barge_id_idx" ON "voyage_barges" ("barge_id");--> statement-breakpoint
CREATE INDEX "voyage_barges_status_idx" ON "voyage_barges" ("status");--> statement-breakpoint
ALTER TABLE "river_voyages" ADD CONSTRAINT "river_voyages_tugboat_id_tugboats_id_fkey" FOREIGN KEY ("tugboat_id") REFERENCES "tugboats"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "voyage_barges" ADD CONSTRAINT "voyage_barges_voyage_id_river_voyages_id_fkey" FOREIGN KEY ("voyage_id") REFERENCES "river_voyages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "voyage_barges" ADD CONSTRAINT "voyage_barges_barge_id_barges_id_fkey" FOREIGN KEY ("barge_id") REFERENCES "barges"("id") ON DELETE CASCADE;