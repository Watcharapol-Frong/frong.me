# Historical Sanity exports

Relocated from `backups/` without changing bytes. These are not runtime inputs,
current D1/R2 backups, or evidence of a tested restore. No new export was made.

| File | SHA-256 |
| --- | --- |
| `production-2026-09-01.tar.gz` | `ec84513bc87212ab581c941d606aeb22bcc9fe594624d3d72c8914de31901380` |
| `production-2026-09-07.tar.gz` | `788a9fbc9754ee62c1161a9b180ff463fb59021f22c3fbe2976e7aab7ba78daf` |
| `production-2026-09-14.tar.gz` | `c1f493c8a9ccac2ed3b4164c072e729276479f9d855d2414f3eac9f6a95e2820` |

Treat exports as potentially sensitive. Never extract into public assets,
fixtures, logs or PRs. This move does not change access or historical repository
exposure. The owner must choose durable retention and verify recovery before
deleting these copies or the source dataset. Git history is not a backup policy.

See [the retirement record](../../docs/legacy-retirement.md).
