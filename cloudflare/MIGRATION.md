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
   | Build command | `npm install && npm run verify` |
   | Build output directory | `.` |
   | **Deploy command** | **Leave empty** (do not set `npx wrangler deploy`) |

   **Important:** Cloudflare **Pages** auto-deploys static files from the build output directory plus the `functions/` folder. A **Deploy command** is only for standalone **Workers** projects. If you set `npx wrangler deploy`, the build succeeds but deployment fails at the "Deploying" stage.

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

| Issue | Fix |
|-------|-----|
| Build succeeds, deploy fails at "Deploying" | Remove Deploy command in Settings → Builds (must be empty for Pages) |
| API returns 500 / empty | Check KV bindings in Pages → Settings → Functions |
| `Store busy, try again` | Normal under heavy concurrent writes; client should retry |
| Static files 404 | Build output directory must be `.` (repo root) |
| Functions not invoked | Confirm `_routes.json` includes `/api/*` |

---

## Decommission Netlify

After Cloudflare is verified:

1. Remove Netlify DNS records / disconnect the site.
2. Optionally delete the Netlify site to avoid double deploys.

Do **not** remove `netlify/functions/` until you confirm KV data is migrated and Cloudflare is stable.
