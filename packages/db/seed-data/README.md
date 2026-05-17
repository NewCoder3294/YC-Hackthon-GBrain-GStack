# SF crime news seed

`sf-crime-news.json` — ~50 real geo-tagged news articles about violent crime in
San Francisco between Jan 2025 and May 2026. Sources: SFPD press releases,
Mission Local, SF Standard, SFist, CBS Bay Area, KQED, KRON4, KTVU, ABC7, NBC
Bay Area.

Schema matches `news_incidents` (snake_case keys). Coordinates are within SF
city limits (37.70–37.84 N, -122.52–-122.35 W).

## Apply the migration

```bash
psql "$DATABASE_URL" -f packages/db/migrations/0005_news_incidents.sql
```

The migration is idempotent. RLS is enabled with read policies for `anon` and
`authenticated`.

## Load the seed

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/seed/crime-news
```

The route upserts on `source_url`, so re-running is safe.

## Map

`/map` reads from `news_incidents` server-side and renders the rows as a
clickable "News" layer (diamond markers). Toggle visibility from the top bar.
Clicking a marker opens a panel with title, summary, location, and a link to
the original article.
