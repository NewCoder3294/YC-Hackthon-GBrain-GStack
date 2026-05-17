import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  real,
  numeric,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
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
  suspectGangId: uuid("suspect_gang_id"),
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

/**
 * signal_events — the shared ingestion substrate (TRD §3.1).
 *
 * Every Layer-1 producer (Caltrans camera detector, 911 transcript
 * generator, citizen report form) writes here. The correlator (Nick)
 * reads from here. Producers never read each other.
 *
 * Hari+Nick hour-1 contract decision: the TRD specifies
 * GEOGRAPHY(POINT,4326); this repo has no PostGIS and `cameras`
 * already uses plain lat/lng doubles, so signal_events follows the
 * same convention. The correlator's 200m proximity check uses a
 * bounding-box / haversine filter instead of ST_DWithin.
 */
export const signalEvents = pgTable(
  "signal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: text("source_type", {
      enum: ["camera_public", "camera_private", "call_911", "citizen_report"],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    payload: jsonb("payload").notNull(),
    confidence: real("confidence"),
    rawClipUri: text("raw_clip_uri"),
  },
  (t) => ({
    occurredAtIdx: index("signal_events_occurred_at_idx").on(
      t.occurredAt.desc(),
    ),
    sourceTypeIdx: index("signal_events_source_type_idx").on(t.sourceType),
  }),
);

// External-source live incidents (SFPD CAD, SF 311, SF Fire/EMS, 511, etc.).
// Kept separate from `incidents` (which is for manual/OpenClaw human-curated
// records that link to camera clips). Each row is one event from one source;
// (source, source_uid) is unique so re-polling upserts.
// Backing migration: packages/db/migrations/0003_live_incidents.sql.
export const liveIncidents = pgTable(
  "live_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    sourceUid: text("source_uid").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    severity: text("severity", { enum: ["low", "med", "high"] })
      .notNull()
      .default("low"),
    priority: text("priority"),
    status: text("status"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    geoPrecision: text("geo_precision", {
      enum: ["exact", "intersection", "neighborhood", "unknown"],
    })
      .notNull()
      .default("unknown"),
    neighborhood: text("neighborhood"),
    address: text("address"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acknowledgedBy: uuid("acknowledged_by"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    raw: jsonb("raw"),
  },
  (t) => ({
    sourceUidUq: uniqueIndex("live_incidents_source_source_uid_unique").on(
      t.source,
      t.sourceUid,
    ),
    sourceTimeIdx: index("idx_live_incidents_source_time").on(
      t.source,
      t.occurredAt,
    ),
    timeIdx: index("idx_live_incidents_time").on(t.occurredAt),
  }),
);

// Per-source sync bookkeeping: when did each source last run, did it succeed,
// and what is the highest `updated_at` we've seen (for incremental polling).
export const liveIncidentSyncs = pgTable("live_incident_syncs", {
  source: text("source").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastStatus: text("last_status").notNull().default("ok"),
  lastError: text("last_error"),
  rowsUpserted: integer("rows_upserted").notNull().default(0),
  lastHighWaterMark: timestamp("last_high_water_mark", { withTimezone: true }),
});

/**
 * news_incidents — geo-tagged news coverage of violent crime in SF.
 *
 * Read-only feed layer for the map. Rows are seeded from real news
 * sources (Mission Local, SF Standard, SFPD press, etc.) and rendered
 * as a clickable layer on /map. Distinct from `live_incidents`
 * (real-time dispatch/911) and `incidents` (analyst-created cases).
 *
 * Additive: existing schema is untouched. No FKs into this table.
 */
export const newsIncidents = pgTable(
  "news_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    title: text("title").notNull(),
    summary: text("summary"),
    crimeType: text("crime_type").notNull(),
    severity: text("severity", { enum: ["low", "med", "high"] })
      .notNull()
      .default("med"),
    neighborhood: text("neighborhood"),
    address: text("address"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    raw: jsonb("raw"),
  },
  (t) => ({
    publishedAtIdx: index("news_incidents_published_at_idx").on(
      t.publishedAt.desc(),
    ),
    crimeTypeIdx: index("news_incidents_crime_type_idx").on(t.crimeType),
    sourceUrlUniq: index("news_incidents_source_url_uniq_idx").on(t.sourceUrl),
  }),
);

export type Camera = typeof cameras.$inferSelect;
export type NewCamera = typeof cameras.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type Clip = typeof clips.$inferSelect;
export type SignalEvent = typeof signalEvents.$inferSelect;
export type NewSignalEvent = typeof signalEvents.$inferInsert;
export type LiveIncident = typeof liveIncidents.$inferSelect;
export type NewLiveIncident = typeof liveIncidents.$inferInsert;
export type LiveIncidentSync = typeof liveIncidentSyncs.$inferSelect;
export type NewsIncident = typeof newsIncidents.$inferSelect;
export type NewNewsIncident = typeof newsIncidents.$inferInsert;
