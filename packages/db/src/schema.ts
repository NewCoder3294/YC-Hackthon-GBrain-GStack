import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  numeric,
  boolean,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const cameras = pgTable("cameras", {
  id: uuid("id").primaryKey().defaultRandom(),
  caltransId: text("caltrans_id").notNull().unique(),
  district: integer("district").notNull(),
  route: text("route").notNull(),
  direction: text("direction"),
  mileMarker: numeric("mile_marker"),
  description: text("description").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  streamUrl: text("stream_url").notNull(),
  streamType: text("stream_type", { enum: ["hls", "mjpeg"] }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  notes: text("notes"),
  severity: text("severity", { enum: ["low", "med", "high"] })
    .notNull()
    .default("low"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: uuid("created_by").notNull(),
});

export const clips = pgTable("clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id").references(() => incidents.id, {
    onDelete: "set null",
  }),
  cameraId: uuid("camera_id")
    .notNull()
    .references(() => cameras.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  durationS: integer("duration_s").notNull(),
  storagePath: text("storage_path").notNull(),
  thumbnailPath: text("thumbnail_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clipTags = pgTable(
  "clip_tags",
  {
    clipId: uuid("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.clipId, t.tag] }) }),
);

export const userCameraPins = pgTable(
  "user_camera_pins",
  {
    userId: uuid("user_id").notNull(),
    cameraId: uuid("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    layoutName: text("layout_name").notNull().default("default"),
    position: integer("position").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.cameraId, t.layoutName] }),
  }),
);

export type Camera = typeof cameras.$inferSelect;
export type NewCamera = typeof cameras.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type Clip = typeof clips.$inferSelect;
