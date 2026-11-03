# NAMES UNIBEN Electoral Portal — Frontend Preview

Responsive React + Vite frontend for the 2026 NAMES UNIBEN election portal, branded with the provided NAMES/UNIBEN logos.

## Deploy with GitHub Pages

1. Create an empty repository on GitHub, e.g. `names-uniben-election-portal` (no automatic README / license / gitignore).
2. Extract this ZIP, and open a terminal **inside the extracted project folder** (the folder containing `package.json`).
3. Replace `YOUR_GITHUB_USERNAME` below with your actual GitHub username:

```bash
git init
git add .
git commit -m "Initial NAMES electoral portal frontend"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/names-uniben-election-portal.git
git push -u origin main
```

4. Open your GitHub repo > **Settings** > **Pages** > **Build and deployment** > **Source** > select **GitHub Actions**.
5. Open the repo's **Actions** tab and confirm `Deploy NAMES Election Portal Preview` passes. If necessary, click **Run workflow**.
6. Open `https://YOUR_GITHUB_USERNAME.github.io/names-uniben-election-portal/`.

The `.github/workflows/deploy.yml` workflow builds and publishes the site automatically on later pushes to `main`. The Vite `base` path is automatically set from the GitHub repository name during Actions builds, so you don't need to edit it when choosing a different repository name.

**Do not configure Settings > Pages > Deploy from a branch.** Vite source files must be compiled; this repository uses the **GitHub Actions** deployment source.

## Run locally

```bash
npm install
npm run dev
```

## Build locally

```bash
npm run build
npm run preview
```

## Included

- NAMES and University of Benin supplied logos
- Responsive election landing page and voter instructions
- Identity form for matriculation numbers or 100-level registration numbers
- Candidate-selection flow using illustrative placeholders
- Ballot review and demo confirmation
- Footer credit: © Vaultr Technologies 2026

## Important — demonstration only

The frontend **does not** authenticate voters or record real votes. The verification form accepts any non-empty ID and PIN for navigation only. The confirmation screen is not a real voting receipt.

Never publish real student IDs, generated voting PINs, secret keys, voter lists, or election credentials in this repository. GitHub Pages is for **public static preview only**; production voting requires a secured backend, independent authorization, atomic vote handling, ballot secrecy, auditability, testing, and a recovery plan.

Replace placeholder positions and candidates in `src/data.js` with the election committee's approved list. Images are stored under `src/assets/`.
