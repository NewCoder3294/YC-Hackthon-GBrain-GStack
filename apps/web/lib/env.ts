import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  DATABASE_URL: z.string().url().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(10).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(10).optional(),
  TWILIO_FROM_NUMBER: z.string().regex(/^\+\d{10,15}$/).optional(),
  FIRECRAWL_API_KEY: z.string().min(8).optional(),
  ZEROENTROPY_API_KEY: z.string().min(8).optional(),
  ANTHROPIC_API_KEY: z.string().min(8).optional(),
  // 511.org Open Data API key — required for traffic/transit sync.
  // Get one (free, instant) at https://511.org/open-data/token.
  SF_511_API_KEY: z.string().min(8).optional(),
  // DataSF Socrata app token — optional, raises rate limit from
  // ~1k/hr to ~10k/hr per IP. Register at https://data.sfgov.org/profile/edit/developer_settings.
  SOCRATA_APP_TOKEN: z.string().min(8).optional(),
  // PurpleAir AQI sensors — free tier requires an API key.
  // Request one at https://api.purpleair.com/. Without this the cron
  // /api/cron/sync-env returns `disabled: true` for the AQI source.
  PURPLEAIR_API_KEY: z.string().min(8).optional(),
  // OpenSky Network ADS-B — OAuth2 client credentials (the API moved off
  // basic auth in 2025). Setting both lifts the per-IP rate cap. Either
  // alone is ignored. https://opensky-network.org/data/api
  OPENSKY_CLIENT_ID: z.string().min(1).optional(),
  OPENSKY_CLIENT_SECRET: z.string().min(1).optional(),
  // AISStream.io websocket key — required for the marine vessel layer.
  // Free tier at https://aisstream.io/. Without it the AIS source
  // degrades to `disabled: true`.
  AISSTREAM_API_KEY: z.string().min(8).optional(),
  // BART BSA — falls back to the documented public sample key if unset.
  // Set this to your own key for production traffic. https://api.bart.gov/api/register.aspx
  BART_API_KEY: z.string().min(8).optional(),
  // Windy webcams API key — optional curated public camera source.
  WINDY_WEBCAMS_API_KEY: z.string().min(8).optional(),
});

const blank = (v: string | undefined) => (v && v.length > 0 ? v : undefined);

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: blank(process.env.SUPABASE_SERVICE_ROLE_KEY),
  DATABASE_URL: blank(process.env.DATABASE_URL),
  CRON_SECRET: blank(process.env.CRON_SECRET),
  TWILIO_ACCOUNT_SID: blank(process.env.TWILIO_ACCOUNT_SID),
  TWILIO_AUTH_TOKEN: blank(process.env.TWILIO_AUTH_TOKEN),
  TWILIO_FROM_NUMBER: blank(process.env.TWILIO_FROM_NUMBER),
  FIRECRAWL_API_KEY: blank(process.env.FIRECRAWL_API_KEY),
  ZEROENTROPY_API_KEY: blank(process.env.ZEROENTROPY_API_KEY),
  ANTHROPIC_API_KEY: blank(process.env.ANTHROPIC_API_KEY),
  SF_511_API_KEY: blank(process.env.SF_511_API_KEY),
  SOCRATA_APP_TOKEN: blank(process.env.SOCRATA_APP_TOKEN),
  PURPLEAIR_API_KEY: blank(process.env.PURPLEAIR_API_KEY),
  OPENSKY_CLIENT_ID: blank(process.env.OPENSKY_CLIENT_ID),
  OPENSKY_CLIENT_SECRET: blank(process.env.OPENSKY_CLIENT_SECRET),
  AISSTREAM_API_KEY: blank(process.env.AISSTREAM_API_KEY),
  BART_API_KEY: blank(process.env.BART_API_KEY),
  WINDY_WEBCAMS_API_KEY: blank(process.env.WINDY_WEBCAMS_API_KEY),
});
