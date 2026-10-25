# Outfit Locator / પોશાક શોધક

A free, offline phone app for cataloguing sarees by photo and storage location and finding them with natural-language search.

- Plan: [PLAN.md](./PLAN.md)
- Decisions and progress: [CLAUDE.md](./CLAUDE.md)

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/ (test PWA/offline here)
npm run lint
```

To test on a phone over Wi-Fi: `npm run dev -- --host`, then open the printed network URL in Chrome on Android. Camera and PWA install need HTTPS, so use the deployed URL for those.

## Deploy

**GitHub Pages (configured):** push to `main`, then set Settings → Pages → Source to "GitHub Actions". The workflow sets `BASE_PATH=/<repo-name>/` automatically.

**Cloudflare Pages (alternative):** connect the repo, build command `npm run build`, output `dist`, and no `BASE_PATH` is needed.

Mom's data lives only on her phone (IndexedDB), never in this repo, so the repo can be public.
