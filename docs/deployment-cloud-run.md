# Deployment — Option D: Google Cloud Run + managed Postgres

> **Nothing in this document has been executed.** No GCP project, billing
> account, or Cloud Run service exists. This is a step-by-step runbook for
> the operator to follow when they decide to launch.

## Why this option

- **Hosting is free**: Cloud Run Always Free = 2M requests + 180k
  vCPU-seconds + 360k GiB-seconds per month — far more than an MVP needs.
- **Database stays free**: Cloud SQL (Google's managed Postgres) has **no**
  free tier (bills from creation, ~$10–15/mo), so the DB remains Supabase or
  Neon free tier ($0), same as Options A/B.
- **Region**: `asia-south1` (Mumbai) — lowest latency for India users.
- **Total expected cost: ₹0/month** + the domain (~₹850–1,000/year).

### Trade-offs vs Option A (Cloudflare Pages)

- Google requires a **billing account with a card on file** even for
  free-tier use. Cloudflare Pages free needs no card — if you want zero
  payment details anywhere, prefer Option A.
- Cloud Run needs the app **containerised** (`apps/web/Dockerfile` is ready;
  Cloud Build builds it so you don't need Docker locally).
- Cloud Run free quota is **per billing account** (all projects share it).

## Prerequisites (operator)

1. A Google account.
2. A GCP project with **billing enabled** (card required — see trade-off).
3. `gcloud` CLI installed and logged in (`gcloud auth login`).
4. A free Postgres: Supabase or Neon project (same as Options A/B).
5. The domain you bought (DNS access at the registrar).

Set these for the session:

```bash
export PROJECT_ID=<your-gcp-project>
export REGION=asia-south1
gcloud config set project $PROJECT_ID
```

## 1. Create the container image (no local Docker needed)

```bash
# One-time: create an Artifact Registry repo for the image
gcloud artifacts repositories create biocatalyst \
  --repository-format=docker --location=$REGION

# Build from the repo root (uses apps/web/Dockerfile)
gcloud builds submit \
  --tag $REGION-docker.pkg.dev/$PROJECT_ID/biocatalyst/web:latest .
```

Cloud Build's free tier (120 build-minutes/day) covers this comfortably.

## 2. Store secrets

```bash
# Generate once, keep somewhere safe (password manager)
export ADMIN_TOKEN=$(openssl rand -hex 32)

echo -n "$ADMIN_TOKEN" | gcloud secrets create admin-token \
  --data-file=-
# Paste your Supabase/Neon connection string when prompted (least-privilege role)
gcloud secrets create database-url --data-file=-

# Let Cloud Run read them
for s in admin-token database-url; do
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:$PROJECT_ID-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

## 3. Deploy

```bash
gcloud run deploy biocatalyst-web \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/biocatalyst/web:latest \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --max-instances 3 \
  --memory 512Mi \
  --set-secrets "DATABASE_URL=database-url:latest,ADMIN_TOKEN=admin-token:latest"
```

`--max-instances 3` is the cost guardrail: traffic spikes queue instead of
spending. The app reads `$PORT` automatically.

Note the service URL it prints, e.g.
`https://biocatalyst-web-abc123.asia-south1.run.app`.

## 4. Database migrations

From your local machine, pointed at the **managed** DB (not localhost):

```bash
cd ~/workspace/biocatalyst-india
DATABASE_URL='<your-supabase-or-neon-connection-string>' pnpm db:migrate
```

Migrations are 001–009; verify with:

```bash
curl -sf https://<service-url>/api/v1/admin/health
```

## 5. Custom domain

```bash
gcloud run domain-mappings create \
  --service biocatalyst-web \
  --domain <your-domain> \
  --region $REGION
```

Then add the DNS records it tells you at your registrar and verify domain
ownership in the GCP console (one-time). TLS is automatic.

## 6. Scheduled ingestion (Cloud Scheduler)

Runs the ingestion pipeline daily at 2am IST, authenticated:

```bash
gcloud scheduler jobs create http biocatalyst-ingest \
  --location $REGION \
  --schedule="0 2 * * *" \
  --time-zone="Asia/Kolkata" \
  --uri="https://<your-domain>/api/v1/admin/ingestion/run" \
  --http-method=POST \
  --headers="Authorization=Bearer $ADMIN_TOKEN"
```

Check health any time via the `ingestion_runs` table or
`GET /api/v1/admin/health` (read-only by design).

## 7. Billing guardrails (do this on day one)

```bash
# Alert the moment any spend occurs (free tier should keep it at $0)
gcloud billing budgets create \
  --billing-account=<BILLING_ACCOUNT_ID> \
  --display-name="biocatalyst-zero-spend" \
  --budget-amount=1USD \
  --threshold-rule=percent=100 \
  --all-updates-rule-pubsub-topic=<optional>
```

Simpler alternative: create the budget in the GCP console
(Billing → Budgets & alerts) with email notifications to your new address
`bio1941999@gmail.com` at 50%, 100% of $1.

## 8. Verify launch

- [ ] `GET https://<your-domain>/api/v1/admin/health` → all sources healthy
- [ ] Homepage, catalyst feed, search load; no console errors
- [ ] Sign-up → watchlist → alert flow works against the managed DB
- [ ] `/privacy` shows `bio1941999@gmail.com`
- [ ] Cloud Scheduler ran ingestion once (check `ingestion_runs`)

## Rollback / kill-switch

```bash
# Roll back to the previous revision (instant)
gcloud run services update-traffic biocatalyst-web \
  --to-revisions <PREVIOUS_REVISION>=100 --region $REGION

# Full stop (takes the site offline, keeps data)
gcloud run services update biocatalyst-web \
  --no-allow-unauthenticated --region $REGION

# Rotate ADMIN_TOKEN if abuse is suspected
echo -n "$(openssl rand -hex 32)" | gcloud secrets versions add admin-token --data-file=-
gcloud run services update biocatalyst-web --region $REGION \
  --set-secrets "DATABASE_URL=database-url:latest,ADMIN_TOKEN=admin-token:latest"
```

## Updating the app later

```bash
gcloud builds submit \
  --tag $REGION-docker.pkg.dev/$PROJECT_ID/biocatalyst/web:$(date +%Y%m%d) .
gcloud run deploy biocatalyst-web \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/biocatalyst/web:$(date +%Y%m%d) \
  --region $REGION
```

Migrations first if the schema changed (`pnpm db:migrate` against the
managed DB), then deploy.

## Privacy notes

- No telemetry or analytics was added for this path; the container makes
  zero third-party network calls (same `no-external-requests` guarantee).
- Cloud Build/Artifact Registry/Cloud Run are first-party GCP services, not
  third-party trackers — but they do require the billing account above.
- Logs live in Cloud Logging (first 50 GiB/month free); nothing is shipped
  to an external vendor.
