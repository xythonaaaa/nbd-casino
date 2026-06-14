# NBD Casino — Cloudflare Pages Migration Guide

This project runs on **Cloudflare Pages** with **Pages Functions** and **Workers KV**. Netlify Functions (`netlify/functions/`) are kept for reference only; production API routes are served from `functions/api/`.

---

## Architecture

| Route | Pages Function | KV Binding | KV Key |
|-------|----------------|------------|--------|
| `GET/POST /api/chat` | `functions/api/chat.js` | `CHAT_KV` | `messages` |
| `GET/POST /api/leaderboard` | `functions/api/leaderboard.js` | `LEADERBOARD_KV` | `data` |
| `GET/POST /api/wallet` | `functions/api/wallet.js` | `WALLET_KV` | `data` |
| `GET/POST /api/affiliates` | `functions/api/affiliates.js` | `AFFILIATES_KV` | `data` |
| `GET/POST /api/admin-players` | `functions/api/admin-players.js` | all four KV bindings | — |
| `GET /api/stats` | `functions/api/stats.js` | `WALLET_KV` | `data` |

**Netlify Blobs → KV mapping** (for data migration):

| Netlify Blob store | Cloudflare KV binding |
|--------------------|-----------------------|
| `nbd-chat` | `CHAT_KV` |
| `nbd-leaderboard` | `LEADERBOARD_KV` |
| `nbd-wallet` | `WALLET_KV` |
| `nbd-affiliates` | `AFFILIATES_KV` |

Admin username: `ceo` (unchanged from Netlify).

---

## Step 1 — Cloudflare account

1. Sign up at [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Add your domain **nbdcasino.com** under **Websites** (or use an existing zone).

---

## Step 2 — Create KV namespaces

In the Cloudflare dashboard:

1. Go to **Workers & Pages → KV**.
2. Create four namespaces (names are labels only; bindings matter in Pages):

   - `nbd-chat`
   - `nbd-leaderboard`
   - `nbd-wallet`
   - `nbd-affiliates`

3. Copy each namespace **ID** (32-character hex string).

4. `wrangler.toml` already contains the production namespace IDs:

   | Namespace | ID |
   |-----------|-----|
   | nbd-chat | `0b67e8914e404f8b8816cbef61879cbf` |
   | nbd-leaderboard | `5c05d5f8bc2947cc8a71bbf9dc059301` |
   | nbd-wallet | `39846045b4234c01afded126eaac3e1d` |
   | nbd-affiliates | `566e3b3628154cddbbaf20a516f48169` |

   For preview/branch deploys you can create separate preview namespaces and update `preview_id`, or reuse production IDs for a small site.

---

## Step 3 — Connect GitHub to Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**.
2. Select repository: `xythonaaaa/nbd-casino`.
3. **Build settings** (Settings → Builds):

   | Setting | Value |
   |---------|-------|
   | Production branch | `main` |
   | Build command | `npm install && npm run build:pages` |
   | Build output directory | `.` (a single dot — repo root, **not** `public/` or `dist/`) |
   | **Deploy command** | **Leave empty / delete any value** |

   **If verify ever fails on CI** (wrong/truncated CSS or JS uploaded), you can temporarily use build command `npm install` only — static files are already in the repo and do not need compilation.

   ### Pages vs Workers — read this if the build keeps failing

   | What you see in the dashboard | Project type | What to do |
   |-------------------------------|--------------|------------|
   | Settings → **Builds** with **Build command**, **Build output directory**, **no Deploy command field** | **Cloudflare Pages** (correct) | Deploy command must stay empty |
   | Settings → **Builds** with **Build command** **and** a **Deploy command** field (e.g. `npx wrangler deploy`) | **Workers Builds** (wrong for this repo) | See [Fix: wrong project type](#fix-wrong-project-type-workers-builds) below |

   Cloudflare **Pages** auto-deploys static files from the build output directory plus the `functions/` folder after the build command finishes. You never run `wrangler deploy` or `wrangler pages deploy` in the dashboard for Git-connected Pages.

   **Typical failure when Deploy command is set:** build succeeds, then the **Deploying** step fails with:

   ```text
   It looks like you've run a Workers-specific command in a Pages project.
   For Pages, please run `wrangler pages deploy` instead.
   ```

   Even if you changed that to `wrangler pages deploy`, you still should **not** use a Deploy command — remove it entirely.

4. Deploy once (KV bindings come next — first deploy may show API errors until bindings are set).

---

## Step 4 — Bind KV namespaces to Pages

After the project is created:

1. **Workers & Pages → nbd-casino → Settings → Functions**.
2. Under **KV namespace bindings**, add:

   | Variable name | KV namespace |
   |---------------|--------------|
   | `CHAT_KV` | nbd-chat |
   | `LEADERBOARD_KV` | nbd-leaderboard |
   | `WALLET_KV` | nbd-wallet |
   | `AFFILIATES_KV` | nbd-affiliates |

3. **Save** and trigger a **Retry deployment** (Deployments → … → Retry).

Binding names must match exactly — the Pages Functions read `env.CHAT_KV`, etc.

---

## Step 5 — Custom domain (nbdcasino.com)

1. **Workers & Pages → nbd-casino → Custom domains → Set up a custom domain**.
2. Enter `nbdcasino.com` and `www.nbdcasino.com`.
3. Cloudflare will add the required DNS records if the zone is on Cloudflare.
4. Wait for SSL certificate provisioning (usually a few minutes).

**If DNS is elsewhere:** point `nbdcasino.com` CNAME to `<project>.pages.dev` (Cloudflare shows the exact target).

HTTP → HTTPS redirects are in `_redirects` (same behavior as the old `netlify.toml` redirects).

Security headers are in `_headers`.

---

## Step 6 — Migrate existing data (optional)

If you have live data in Netlify Blobs, export JSON and import into KV:

```bash
# Example: import chat messages
wrangler kv key put --binding=CHAT_KV messages --path=chat-export.json
```

Keys to import:

- `CHAT_KV` → key `messages` (JSON array)
- `LEADERBOARD_KV` → key `data` (JSON object with `wins`, `bets`, `recentBets`)
- `WALLET_KV` → key `data` (JSON object with `users`, `grants`, `userMeta`, `resetAt`)
- `AFFILIATES_KV` → key `data` (JSON object with `users`, `referralMap`, `affiliates`)

Local dev JSON files under `server/` can seed KV the same way for testing.

---

## Local development

### Option A — Node static server (no KV, file-backed)

Uses JSON files in `server/` — same as before:

```bash
npm start
# http://localhost:8080
```

### Option B — Cloudflare Pages dev (KV-backed, matches production)

```bash
npm install
npm run dev:cf
# http://localhost:8788
```

Requires valid KV namespace IDs in `wrangler.toml`. Wrangler uses local KV simulation with placeholder IDs, or remote KV when configured.

**Node.js:** Wrangler 3 (included) supports Node 18+. For Wrangler 4+, use Node 20+.

---

## Verify deployment

After DNS and bindings are live:

```bash
curl https://nbdcasino.com/api/stats
curl https://nbdcasino.com/api/chat
curl "https://nbdcasino.com/api/wallet?user=testuser"
```

---

## Files reference

| File | Purpose |
|------|---------|
| `wrangler.toml` | Pages output dir + KV bindings for local dev |
| `functions/api/*.js` | API route handlers |
| `_routes.json` | Run Functions only on `/api/*` |
| `_headers` | Security headers |
| `_redirects` | HTTP → HTTPS redirects |
| `netlify.toml` | Legacy Netlify config (not used on Cloudflare) |

---

## Troubleshooting

### Read the failed build log first

1. **Workers & Pages → nbd-casino → Deployments**.
2. Click the **failed** deployment (red status).
3. Open **Build log** and scroll to the **last 20–30 lines** — the real error is almost always there.

| Log symptom | Likely cause | Fix |
|-------------|--------------|-----|
| `Workers-specific command in a Pages project` / `wrangler pages deploy` | Deploy command is `npx wrangler deploy` | Clear Deploy command (Pages) or recreate as Pages — see below |
| `Deploy verification FAILED` / `css/styles.css looks too small` | `npm run verify` failed | Ensure full `css/styles.css`, `css/casino-home.css`, `js/common.js` are committed; or use build command `npm install` only |
| Build OK, site 404 on `/` | Wrong output directory | Set **Build output directory** to `.` (repo root) |
| Build never starts / wrong repo | Wrong branch or disconnected Git | Production branch = `main`, repo = `xythonaaaa/nbd-casino` |

### Fix: wrong project type (Workers Builds)

If your project settings show a **Deploy command** field, you likely created a **Worker** (Workers Builds), not **Pages**. This repo is configured for **Pages + Pages Functions** (`functions/`, `_routes.json`, `pages_build_output_dir = "."` in `wrangler.toml`). Workers Builds expect `wrangler deploy` and a Worker entry point — that will not work here.

**Recommended fix — recreate as Pages:**

1. **Workers & Pages → nbd-casino → Settings → General → Delete project** (or rename the broken Worker project).
2. **Workers & Pages → Create → Pages → Connect to Git**.
3. Repository: `xythonaaaa/nbd-casino`, branch: `main`.
4. Build command: `npm install && npm run build:pages`
5. Build output directory: `.`
6. **Do not set a Deploy command** (Pages has no deploy step).
7. After first deploy: add KV bindings (Step 4 above) and custom domain (Step 5).

**If you already have a Pages project** but someone added a Deploy command:

1. **Settings → Builds → Deploy command** — delete `npx wrangler deploy` (leave blank).
2. **Save** → **Deployments → Retry deployment**.

### Redirects and headers (no `public/` folder)

This site publishes from the **repo root** (`.`), not a `public/` subdirectory. These files are already in the correct place:

- `_redirects` — HTTP → HTTPS for `nbdcasino.com`
- `_headers` — security headers
- `_routes.json` — Pages Functions only on `/api/*`

Do **not** move them into `public/` unless you change the build output directory to `public/`.

### Other issues

| Issue | Fix |
|-------|-----|
| API returns 500 / empty | Check KV bindings in Pages → Settings → Functions |
| `Store busy, try again` | Normal under heavy concurrent writes; client should retry |
| Functions not invoked | Confirm `_routes.json` includes `/api/*` |
| Node version errors | Add environment variable `NODE_VERSION` = `20` under Settings → Environment variables |

---

## Decommission Netlify

After Cloudflare is verified:

1. Remove Netlify DNS records / disconnect the site.
2. Optionally delete the Netlify site to avoid double deploys.

Do **not** remove `netlify/functions/` until you confirm KV data is migrated and Cloudflare is stable.
