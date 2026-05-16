CREATE TABLE IF NOT EXISTS "cameras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caltrans_id" text NOT NULL,
	"district" integer NOT NULL,
	"route" text NOT NULL,
	"direction" text,
	"mile_marker" numeric,
	"description" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"stream_url" text NOT NULL,
	"stream_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cameras_caltrans_id_unique" UNIQUE("caltrans_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clip_tags" (
	"clip_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "clip_tags_clip_id_tag_pk" PRIMARY KEY("clip_id","tag")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid,
	"camera_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_s" integer NOT NULL,
	"storage_path" text NOT NULL,
	"thumbnail_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"severity" text DEFAULT 'low' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_camera_pins" (
	"user_id" uuid NOT NULL,
	"camera_id" uuid NOT NULL,
	"layout_name" text DEFAULT 'default' NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "user_camera_pins_user_id_camera_id_layout_name_pk" PRIMARY KEY("user_id","camera_id","layout_name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clip_tags" ADD CONSTRAINT "clip_tags_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clips" ADD CONSTRAINT "clips_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clips" ADD CONSTRAINT "clips_camera_id_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_camera_pins" ADD CONSTRAINT "user_camera_pins_camera_id_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
