import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  DATABASE_URL: z.string().url().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  FIRECRAWL_API_KEY: z.string().min(8).optional(),
  ZEROENTROPY_API_KEY: z.string().min(8).optional(),
  ANTHROPIC_API_KEY: z.string().min(8).optional(),
});

const blank = (v: string | undefined) => (v && v.length > 0 ? v : undefined);

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: blank(process.env.SUPABASE_SERVICE_ROLE_KEY),
  DATABASE_URL: blank(process.env.DATABASE_URL),
  CRON_SECRET: blank(process.env.CRON_SECRET),
  FIRECRAWL_API_KEY: blank(process.env.FIRECRAWL_API_KEY),
  ZEROENTROPY_API_KEY: blank(process.env.ZEROENTROPY_API_KEY),
  ANTHROPIC_API_KEY: blank(process.env.ANTHROPIC_API_KEY),
});
