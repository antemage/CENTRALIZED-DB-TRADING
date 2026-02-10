# Scheduled ingest workflows

- **Scheduled runs only use the default branch** (e.g. `main`). The workflow files must be on the default branch for cron to run. If you develop on another branch, merge to `main` so the schedule can run.
- **Cron times are in UTC.** GitHub may delay runs by several minutes.
- **15m:** runs at :08, :16, :23, :31, :38, :46, :53 every hour (UTC).
- **Hourly:** runs at :01 past every hour (UTC) (1h + 15m + funding).

To run manually: Actions → choose workflow → "Run workflow".
