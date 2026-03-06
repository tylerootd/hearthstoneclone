# Deploy to GitHub Pages

## One-time setup

1. Go to your repo: **Settings → Pages**
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**
3. Select branch **gh-pages** and folder **/ (root)**
4. Save

## Deploy (latest version)

Whenever you want the live site updated:

1. Run `npm run deploy` (builds the project)
2. Commit and push to `main`:
   ```bash
   git add -A
   git commit -m "Deploy latest"
   git push origin main
   ```

The GitHub Action runs on every push to `main` and deploys the built `dist/` folder to the `gh-pages` branch. Your site at `https://tylerootd.github.io/hearthstoneclone/` will reflect the latest version within a few minutes.
