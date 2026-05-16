# CalTrans CCTV Dashboard

## One-time Supabase setup

1. Create a new project at https://supabase.com (region: us-west).
2. From the project Settings → Database → Connection string, copy the **Transaction Pooler** URL → `DATABASE_URL`.
3. From Settings → API, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose)
4. Create a Storage bucket named `clips` (private). Add a second bucket `thumbnails` (public).
5. Apply migrations:
   ```bash
   DATABASE_URL=... pnpm db:migrate
   ```
6. Generate a strong CRON secret: `openssl rand -hex 32` → `CRON_SECRET`.

## Local development

```bash
cp apps/web/.env.example apps/web/.env.local
# fill in values from Supabase
pnpm dev
```

## Manual sync trigger

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/sync-cameras
```

Expected JSON: `{ "count": <int>, "syncedAt": "<iso>" }`
