# CLAUDE.md: Outfit Locator (પોશાક શોધક)

This file holds context for Claude and anyone else working on this repo. **Keep it updated.** When a decision is made, add it to the Decision Log. When a task is finished, update Progress.

## Project in one line
A free-for-life, offline-first phone app (PWA) where Mom catalogues every saree in the house with a photo and its storage location, then finds any of them with natural-language or voice search.

Full plan: [PLAN.md](./PLAN.md)

## Non-negotiable constraints
1. **Free for life.** No paid services, no trials, no free tiers that pause or delete data when idle, and no credit card required anywhere.
2. **The primary user is non-technical.** Large text, big tap targets, photos first, as few required fields as possible.
3. **Her data is never lost.** Every storage change has to be recoverable through export or backup.
4. **Offline first.** Everything except backup sync works with no network.

## Stack
- React + Vite + TypeScript, `vite-plugin-pwa`
- IndexedDB via **Dexie**
- Search: **custom on-device engine** in `src/search/` (D19). Semantic embeddings (transformers.js) are deferred (D20)
- Voice: browser Web Speech API (`gu-IN` / `en-IN`)
- Unit tests: **Vitest** (`npm test`)
- Image search (Phase 4): CLIP through transformers.js
- Hosting: Cloudflare Pages or GitHub Pages (static)
- Backup: Google Drive `appDataFolder` (mom's own account)

## Code map
- `src/db.ts`: Dexie schema (`Saree`, `Location`, `History`), `newId()`, `requestPersistentStorage()`. **Never edit a published `db.version(n)`; add a new version with an upgrade.**
- `src/strings.ts`: all UI text, EN + GU (the `gu` object is typed against `en`, so a missing key fails the build)
- `src/i18n.tsx`: `LangProvider` / `useLang()` → `{ lang, t, toggle }`
- `src/data.ts`: **all writes**: `addSaree`, `updateSaree`, `moveSaree`, `markWorn`, `deleteSaree`, `addLocation`, `renameLocation`, `deleteLocation`. Also the path helpers `subtreeIds`, `locationPath`, `pathText`, and `CHILD_KIND`.
- `src/vocab.ts`: tag vocabulary (colours with swatches, fabrics, designs, occasions) in EN/GU, plus `termLabel`, `sareeName`
- `src/photos.ts`: `compressPhoto()` (WebP, 1280px; JPEG fallback on Safari)
- `src/backup.ts`: zip export (Android share sheet, or download) and restore (replaces everything)
- `src/search/engine.ts`: `buildIndex(items)` and `search(index, query)` → `{ best, more, understood }`. Pure, with no DOM or DB access.
- `src/search/lexicon.ts`: **the file to edit when Mom's searches miss**: `ALIASES` (tag synonyms in EN / GU / Latin-typed GU), `PHRASES`, `NEIGHBOURS` (related colours), `WORD_GROUPS` (cross-language place/relation words), `STOP_WORDS`, `GU_SUFFIXES`
- `src/search/translit.ts`: Gujarati→Latin transliteration, `phonetic()` keys, consonant `skeleton()`
- `src/search/engine.test.ts`: evaluation set (20 sarees, 43 real-style queries) plus behaviour tests. **Add every real miss here first, then fix the lexicon.**
- `src/speech.ts`: `useSpeech(lang, onText)` voice input with friendly error states
- `src/hooks.ts`: `useData()` (live sarees + locations), `useObjectUrl()`, last-used location for batch entry
- `src/nav.ts` + `src/App.tsx`: stack navigation; each push adds a browser history entry so Android's back button works
- `src/screens/`: `SearchScreen`, `SareeForm` (add/edit), `SareeDetail`, `PlacesScreen` (+ backup section)
- `src/components/`: `SareeGrid`/`Photo`, `Chips`, `LocationPicker` (drill-down overlay), `PlaceSteps` (place as stacked Room → Cupboard → Shelf), `Dialog.tsx` (`useDialog()` → bottom-sheet `prompt`/`confirm`/`alert` + `toast`), `icons.tsx` (`KIND_ICON`, `BrandMark`), `places.ts` (add-place sheet)
- `src/index.css`: design tokens (colours, shadows, radii, fonts), light/dark, all component styles
- `vite.config.ts`: PWA manifest and service worker; `BASE_PATH` env for sub-path hosting
- `public/`: icons (`icon.svg` is the source; PNGs were generated with ImageMagick)

Commands: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`, `npm test`.

## Conventions
- **Design system (D16):** use the tokens in `index.css` (`--brand`, `--gold`, `--surface-2`, `--shadow-*`, `--radius*`) and **lucide-react** icons only. Never use emoji in the UI, never call native `window.prompt/confirm/alert` (use `useDialog()`), and use `.card`, `.row`, `.btn-primary/-quiet/-dashed` instead of one-off styles.
- Uppercase and letter-spacing go **only under `:lang(en)`**, because tracking breaks Gujarati conjuncts.
- Show stored photos with `<Photo cacheKey={photoKey(saree, i)}>` so object URLs are reused across live-query refreshes.
- Mobile-first. Test at a 360px width. Base font ≥ 18px, tap targets ≥ 48px.
- Compress every photo to WebP at ≤ 1280px on the long edge (about 150 KB) before storing it.
- Any change to a saree's location goes through one `moveSaree()` function, which also writes `History`.
- Recompute a saree's `textEmbedding` whenever any of its searchable fields or its location changes (already done in `data.ts`; only matters if D20 is revisited).
- Search changes must keep `npm test` at ≥ 90% top-3, and should stay at 100%.
- UI strings live in one file, ready for Hindi/Gujarati later.
- No backend code. If a feature seems to need a server, stop and log a decision first.

## Decision Log
Format: **D# · date · decision**, then *Why* and *Rejected alternatives*.

**D1 · 2026-10-25 · Build a PWA (web app installable to the home screen), not a native app**
- *Why:* one codebase works on Android and iOS, there are no Play Store/App Store fees (the Apple developer account is $99/yr), updates ship instantly, and it can be hosted for free.
- *Rejected:* native Android/Flutter (store hassle, iOS costs money); a Google Sheets/Notion-only setup (no proper photo-first UI, weak NL search).

**D2 · 2026-10-25 · Keep the data on the device (IndexedDB), with no cloud database**
- *Why:* free tiers are what threaten "free for life." Supabase pauses idle projects, Firebase Storage now needs the paid Blaze plan, Cloudflare R2 needs a card on file, and Render/Railway free tiers have been cut before. Data on the phone costs nothing, works offline, and stays private.
- *Rejected:* Supabase, Firebase, MongoDB Atlas, Cloudflare D1/R2 (each one is a dependency whose terms could change or that needs a card).

**D3 · 2026-10-25 · Run natural-language search on the device (transformers.js embeddings plus keyword search), not through an LLM API**
- *Why:* LLM APIs cost money, or their free tiers (Gemini and similar) are rate-limited and can change at any time. A roughly 120 MB multilingual embedding model is downloaded once, cached, and then free forever, even offline. With fewer than 1,000 items, brute-force cosine similarity is instant, so no vector database is needed.
- *Why hybrid:* embeddings handle meaning ("maroon" ≈ "dark red", "the wedding one"), while keyword/fuzzy search handles exact names and typos ("banarsi"). A rule-based parser turns clear room or colour mentions into hard filters.
- *Rejected:* OpenAI/Claude/Gemini API (cost or rate limits), Pinecone/Qdrant cloud (overkill, another free tier), keyword-only search (doesn't understand meaning).

**D4 · 2026-10-25 · Use the multilingual embedding model (`multilingual-e5-small`)**
- *Why:* Mom may type or speak in Hindi or Gujarati. An English-only MiniLM would miss those queries. The extra size is acceptable.

**D5 · 2026-10-25 · Back up to mom's own Google Drive (`appDataFolder`), with manual zip export as a fallback**
- *Why:* every Google account comes with 15 GB free that doesn't expire, there is no server for us to run, OAuth happens on the client side, and the data belongs to her. 1,000 sarees × 150 KB ≈ 150 MB, which fits easily. The zip export means we don't depend on Google either.
- *Rejected:* our own sync server (costs money and needs upkeep), GitHub as storage (not suitable for photos or for mom).

**D6 · 2026-10-25 · Use a three-level location tree (Room → Unit → Spot) plus an "away" kind**
- *Why:* this matches how she thinks ("bedroom almirah, top shelf"). The "away" kind covers sarees at the tailor, at the dry cleaner, or lent to someone. QR labels go on the units.

**D7 · 2026-10-25 · Host on Cloudflare Pages or GitHub Pages**
- *Why:* both host static sites for free with HTTPS, which PWAs and camera access require. Because the app is plain static files, moving to another host is trivial if one of them changes its terms.

**D8 · 2026-10-25 · Target Android with Chrome as the primary platform**
- *Why:* Mom uses an Android phone. On Chrome for Android, the PWA install prompt, camera capture, `navigator.storage.persist()` and Web Speech voice input all work well. iOS Safari is best-effort only.
- *Implication:* we can rely on Web Speech with `lang='gu-IN'` and `'en-IN'`. The phone's age is unknown, so keep the keyword-plus-synonym fallback for when the embedding model is too slow (measure on her device in Phase 2).

**D9 · 2026-10-25 · Make the UI bilingual in Gujarati and English, with a toggle (Hindi dropped for now)**
- *Why:* those are the languages Mom uses. Search synonyms cover EN and GU, including Gujarati words typed in English letters, e.g. "lal", "bandhani", "patola". `multilingual-e5-small` stays, because it covers Gujarati.
- *Rejected:* Hindi in the UI or the synonym list (not needed; easy to add later because strings live in one file).

**D10 · 2026-10-25 · Single user only, so no family sharing for now**
- *Why:* only Mom will use it. There are no accounts, roles or shared Drive folder, and Drive backup goes to her account alone. Family sharing moves out of Phase 4 into the Backlog.

**D11 · 2026-10-25 · Use GitHub Pages through GitHub Actions as the default deploy, with a public repo**
- *Why:* the deploy setup lives in the repo (`.github/workflows/deploy.yml`) and there's no extra account beyond GitHub. Pages is free for public repos, and the repo holds no personal data because Mom's data lives only on her phone. `BASE_PATH` handles the `/<repo>/` sub-path, so moving to Cloudflare Pages at `/` needs no code change.
- *Rejected for now:* Cloudflare Pages (just as good, but needs a second account; it remains the fallback, and README has the steps).

**D12 · 2026-10-25 · Phase 0 tooling: Vite 8, React 19, TS 6, oxlint, vite-plugin-pwa 2 (`autoUpdate`), Dexie 4 + dexie-react-hooks**
- *Why:* these are the scaffold defaults at current versions. `autoUpdate` means Mom always gets the latest version without being asked "update?". `useLiveQuery` keeps the UI in sync with IndexedDB with no state-management library.
- *Default language:* Gujarati, with an English toggle (remembered in `localStorage`, which is a per-device convenience only).

**D13 · 2026-10-25 · Phase 1 UX choices for a non-technical user**
- *Batch entry:* after saving, the Add form resets but **keeps the last place**, so she can photograph a whole almirah in one go. The last place is remembered in `localStorage`.
- *Tags are tap-chips, not typing:* colours (multi-select, with swatches), plus single-select fabric, design and occasion. Only the place is required. Photo, tags, name and notes are all optional.
- *Native `prompt`/`confirm`/`alert`* for place names and confirmations: large and familiar on Android, and less code. These could be replaced with custom dialogs later if they feel off.
- *Places can't be deleted while they still contain sarees or shelves,* which prevents losing track of sarees.
- *The location picker allows creating a place on the spot,* so she never has to leave the Add form.
- *Tags store English keys* (`red`, `silk`), so labels can be translated and the Phase 2 synonym and embedding work has stable terms.

**D14 · 2026-10-25 · Interim plain-word search in Phase 1**
- *Why:* gives her a working search right away. It matches title, notes, tag labels in both languages and the place path, ignoring filler words ("saree", "સાડી"). Phase 2 swaps in hybrid semantic search behind the same screen.

**D15 · 2026-10-25 · Manual backup is a zip (data.json + photos/) sent through the Android share sheet**
- *Why:* she can send it to herself on WhatsApp or save it to Drive with familiar taps. On browsers without file sharing it downloads instead. Restore **replaces** all data after a confirmation (merging is not needed for a single user). Embeddings are left out of the zip because they can be recomputed.

**D16 · 2026-10-25 · Visual redesign: warm heritage theme instead of a generic flat look**
- *Why:* feedback that the app felt cheap. The causes were emoji icons (they render differently on every phone), grey native browser dialogs, system fonts, and a heavy flat header.
- *What:* ivory background, deep kumkum maroon, antique gold. **Noto Serif Gujarati** for headings and **Noto Sans Gujarati** for body text, bundled through `@fontsource` so they're precached and work offline (Google Fonts would break offline). **lucide-react** line icons. Soft cards with shadows. Bottom-sheet dialogs and a toast. A raised centre "Add" button. A ગુ/EN segmented switch. The place is shown as icon steps (Room → Cupboard → Shelf). The app icon was recoloured to match.
- *Usability kept:* base font 19px, tap targets ≥ 44px (most are 56px+), photo-first Add form with one big "Take photo" button, and Move as the main action on the detail screen.
- *Rejected:* a UI kit such as MUI or shadcn (heavier, looks generic, fights the Gujarati typography); Google Fonts CDN (not offline).
- *Bug found during the redesign:* live queries return new Blob objects on every DB change, so every photo got a new object URL and re-decoded (flicker, wasted battery, console errors). Fixed with a ref-counted URL cache keyed by `photoKey()`.

**D17 · 2026-10-25 · Colour palette changed to Banarasi emerald and old gold (replaces D16's maroon)**
- *Why:* the user didn't like the maroon/ivory palette. We rendered four options on the real screens (peacock teal, royal indigo, rose & plum, emerald & gold) and **the user picked emerald & gold**.
- *Light:* bg `#f6f8f4`, brand `#1e6b45` / strong `#154f33` / soft `#e2f1e8`, gold `#8a6e1f` (darkened from the previewed `#a98a2c` so small labels reach 4.85:1 on white), text `#18261c`, muted `#5d6b60`.
- *Dark:* bg `#0f1511`, surface `#18201b`, brand `#5cc492` with dark ink `#08200f`, gold `#d8bb5e`.
- *Contrast (WCAG):* all text pairs ≥ 4.5:1 in both modes. Gold on gold-soft is 4.17:1, used only for icons (needs ≥ 3:1).
- The app icon, BrandMark, `theme-color` and manifest colours were all recoloured to match. **Change colours only through the tokens in `index.css`.**

**D18 · 2026-10-25 · App renamed to "Outfit Locator" / "પોશાક શોધક"**
- *What changed:* the UI app name (EN/GU), page title, PWA manifest (`short_name` is Gujarati because it's the label under Mom's home-screen icon) and the backup file name (`outfit-backup-*.zip`).
- *Deliberately unchanged:* the IndexedDB name `saree-locator`, because renaming it would make the app open empty. The folder, package and repo names are also unchanged. The rest of the UI still says "saree" (e.g. "Add a saree"); widening it to other clothing would be a separate decision.

**D19 · 2026-10-25 · Custom search engine instead of MiniSearch**
- *Why:* the hard parts of Mom's searches are specific to this app. Gujarati script ↔ Latin letters ("bedroom" ↔ "બેડરૂમ"), gendered/inflected Gujarati (પીળો/પીળી, માળિયું→માળિયામાં), "સાડી" (saree) vs "સાદી" (plain) sounding alike, related colours, and cross-language place words (shelf ↔ ખાનું). A generic full-text library handles none of these. With ≤ 1,000 sarees, a scan per query takes about 14 ms, so no index structure is needed.
- *How it scores:* each query word gets its best match across tag facets (3), title (2.5), place (2), tag labels (2), notes (1.5). Match levels: exact/phonetic 1, prefix/stem 0.75, consonant skeleton or 1–2 typos 0.6. A related colour gives 1.2. **Best** = every word matched strongly (≥ 1.5); **Other close matches** = the rest. Recognised tags are shown as "Looking for: …" chips so Mom sees what the app understood.
- *Result:* 43/43 top-3 on the eval set. A probe of 21 extra queries found no wrong saree in "best". Two gaps the probe found ("border", "shelf") were fixed and added to the eval.
- *Rejected:* MiniSearch (installed then removed); keeping the Phase 1 substring search.

**D20 · 2026-10-25 · Semantic embedding search deferred (was Phase 2 item 4, D3/D4)**
- *Why:* the word engine already scores 100% on the eval set, so a 120 MB model download, a dependency on Hugging Face hosting and possible slowness on an older phone would buy no measured gain. **Revisit when real queries from Mom miss** and the miss can't be fixed with a lexicon entry (e.g. vague descriptions like "the heavy one I wore in Pune").
- *Kept ready:* the `Saree.textEmbedding` field and invalidation on edit/move/rename remain in place.

**D21 · 2026-10-25 · Voice search through the Web Speech API**
- *Why:* free, built into Chrome on Android, supports `gu-IN`. The language follows the ગુ/EN switch. Interim results show words as she speaks.
- *Limits:* Chrome sends audio to Google's recogniser, so **voice needs internet** (typed search works offline). The mic button is hidden on browsers without support. Errors show plain-language messages (mic not allowed / no internet / didn't hear).

## Testing
- An end-to-end Playwright script (kept outside the repo, in the session scratchpad) covers: the empty state, the place tree through bottom sheets, adding with photo and place, the missing-place error, batch-keep place, search (EN, GU, notes, place), move + history, last worn, the back button, edit, place counts, delete protection, rename, backup → wipe → restore, and **no native dialogs or console errors**. **33/33 pass** against the dev server on the redesigned UI (twice in a row).
- Mobile check (Pixel 7 emulation at 320, 360 and 412px, 7 screens each): no horizontal overflow, no controls under 44px, base font 19px. Re-run after the redesign: all clean. It found and fixed a detail photo that pushed the place below the fold (now 42vh) and a gap between the save bar and the tab bar (`--tabbar-h` token).
- Phase 2 browser check (`search-e2e.js` in the scratchpad): Latin-typed GU, understood chips, best/more sections, Latin ↔ Gujarati place names, notes, the no-result hint, and **voice with a mocked recogniser** (gu-IN/en-IN, transcript fills the box, mic-denied message). 15/15 pass. The main suite is still 33/33.
- **Not yet verified on a real phone:** real speech recognition in Gujarati, camera capture, share-sheet backup, PWA install, offline mode, speed on an older device.
- TODO: move it into the repo as `e2e/` with `@playwright/test` once the UI settles.

## Progress
Status key: ⬜ not started · 🟨 in progress · ✅ done

| Phase | Item | Status |
|---|---|---|
| Planning | Problem statement, architecture, decisions | ✅ |
| 0 | Project scaffold, PWA, Dexie, theme, i18n, deploy workflow | ✅ live at https://anshbhimani.github.io/OUTFIT-LOCATOR/ |
| 1 | Locations, add/edit/move saree, browse, zip export | ✅ (tested in a desktop browser; still needs a try on Mom's phone) |
| 2 | Smart search (synonyms, typos, GU↔Latin, related colours, places), voice (gu-IN/en-IN), eval set | ✅ (semantic model deferred, D20; needs real-phone voice test and Mom's real queries) |
| 3 | Google Drive backup/restore, QR labels | ⬜ |
| 4 | CLIP photo search and auto-tags, "not worn" view | ⬜ |
| Backlog | Family sharing (see D10) | ⬜ |

## Open questions
- How many sarees? Unknown. Design for up to about 1,000 (≈150 MB of photos). Count them during the first bulk entry.
- What model and age is Mom's Android phone? Check in Phase 2 whether the embedding model runs fast enough.

## Resolved questions
- Hosting → repo made **public**, GitHub Pages enabled (D11 stands). The user confirmed after we checked that no personal data is in the repo; only the commit author email is public.
- Phone platform → Android (D8)
- Who edits → only Mom (D10)
- UI language → Gujarati + English (D9)

## Session log
- **2026-10-25:** Defined the problem, chose a local-first PWA with on-device hybrid search and Google Drive backup. Wrote PLAN.md and CLAUDE.md. Next: Phase 0 scaffold.
- **2026-10-25:** Answered the open questions: Android, only Mom uses it, Gujarati + English, saree count unknown. Added D8–D10 and moved family sharing to the Backlog.
- **2026-10-25:** Phase 0: scaffolded Vite + React + TS, added the PWA (manifest, service worker, icons), the Dexie schema, a GU/EN toggle, the large-text theme and the tab shell. Build and lint pass, and the production build serves `sw.js` and the manifest. Added the GitHub Pages workflow (D11) and ran `git init` (no commits yet). Next: create the GitHub repo, push, enable Pages, install on Mom's phone, then Phase 1.
- **2026-10-25:** Phase 1 built: place tree (room → cupboard/box → shelf, plus outside places), add/edit saree with camera or gallery photos (compressed), tag chips, batch entry, detail view (move, wore today, history, delete), interim search, zip backup/restore. Decisions D13–D15. E2E: 34/34 pass. Next: deploy and let Mom try it, then Phase 2 (smart search).
- **2026-10-25:** Phase 2: custom search engine (D19), voice search (D21), Vitest eval at 43/43 top-3 and ~14 ms per query at 1,000 sarees. Semantic model deferred (D20). Next: collect Mom's real searches, add misses to the eval, then decide Phase 3 (Drive backup) vs D20.
- **2026-10-25:** Pushed to github.com/anshbhimani/OUTFIT-LOCATOR on top of its starter README. The first deploy failed (repo private, Pages unavailable on GitHub Free). The user made the repo public and Pages was enabled (`build_type=workflow`); the app is live at https://anshbhimani.github.io/OUTFIT-LOCATOR/. Renamed the app to Outfit Locator / પોશાક શોધક (D18).
- **2026-10-25:** Palette switched to emerald & gold after a 4-way visual comparison (D17). Tests 33/33, mobile checks clean, contrast verified in light and dark.
- **2026-10-25:** Visual redesign (D16): heritage theme, bundled Gujarati fonts, lucide icons, bottom-sheet dialogs, toast, place steps, empty state. Fixed the photo object-URL churn. E2E 33/33 and the mobile checks are clean.
