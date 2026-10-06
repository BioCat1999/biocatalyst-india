# Biocatalyst India — run it on your Mac

The app runs entirely on your machine. Nothing is uploaded or shared.

## Steps

1. **Extract** this folder (double-click the `.tar.gz`, or in Terminal:
   `tar -xzf biocatalyst-india-mac.tar.gz`)
2. **Open Terminal**, go into the extracted folder:
   `cd biocatalyst-india-mac`
3. **Run the setup** (one command, takes ~5–10 minutes the first time):
   `./SETUP-MAC.sh`
   - It installs Node (if needed) and PostgreSQL 16 via Homebrew,
     creates a local database, and builds the app.
   - Homebrew may ask for your Mac password once.
4. **Open** http://localhost:3000 in your browser.

Keep the Terminal window open while you use the app. Press `Ctrl+C` to stop
the server. To start it again later, just run `./SETUP-MAC.sh` again
(setup steps are idempotent — it skips what's already done and starts the app).

## Notes

- The demo data (companies, drugs, trials, events) is fictional fixture data
  for appearance review, not real market data.
- The admin API token is printed at the end of setup and saved in
  `apps/web/.env` as `ADMIN_TOKEN`.
- To fully remove everything later: `./SETUP-MAC.sh` only adds; uninstalling
  is `brew uninstall postgresql@16 node` and deleting the folder (plus
  `brew services stop postgresql@16` first).
