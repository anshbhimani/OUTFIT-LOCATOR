# Outfit Locator (formerly Saree Locator): Plan

## 1. Problem

Mom has sarees stored all over the house (cupboards, trunks, lofts, suitcases, other bedrooms). She can't remember where a particular saree is, so finding one means opening every storage spot.

**Goal:** one database of every saree and where it is kept, searchable in plain language, e.g.:

- "red silk saree with golden border"
- "the green one I wore at Riya's wedding"
- "cotton sarees in the guest room loft"
- "peacock design" / "લાલ બાંધણી" / "lal patola"

**Hard constraint:** it has to be **free for life**: no subscriptions, no free trials that expire, no free tiers that pause or delete data when idle, and no credit card on file.

## 2. Requirements

### Must have (MVP)
1. Add a saree in under 30 seconds: take a photo, pick a location, add optional notes.
2. A location hierarchy: **Room → Storage unit → Spot** (e.g., Master Bedroom → Godrej Almirah → Shelf 2).
3. Natural-language search that understands meaning, not only exact words ("maroon" should match "dark red").
4. Works on mom's phone (Android/iOS) and looks like an app (big buttons, large text, photos first).
5. Works offline. Lofts and back rooms often have poor signal.
6. Data is never lost: there is a backup she doesn't have to think about.

### Should have
7. Voice search (she speaks instead of typing).
8. Gujarati + English UI (toggle) and queries, including Gujarati typed in English letters.
9. Move a saree (e.g., "gave to Bhabhi", "at the tailor") with a history of where it has been.
10. Printable QR labels for each storage unit. Scanning one shows everything stored inside.

### Nice to have
11. Auto-tagging from the photo (colour, fabric, pattern).
12. Searching by photo ("find sarees that look like this one").
13. Tracking when a saree was last worn, so she can see which ones haven't been worn in years.
14. ~~Several family members using the same database~~: deferred, only Mom uses it for now (D10).

**Target device:** Mom's Android phone with Chrome (D8). Saree count is unknown, so design for up to about 1,000.

## 3. Architecture (chosen)

```
┌────────────────────────────────────────────────────────┐
│  PWA (static site) on Cloudflare Pages / GitHub Pages  │  ← free hosting, no server
│                                                        │
│  UI (React + Vite, mobile-first, large-text theme)     │
│     │                                                  │
│  Search engine (runs in the browser)                   │
│     ├─ Query parser → filters (room, colour, fabric)   │
│     ├─ Keyword search: MiniSearch (fuzzy, typo-safe)   │
│     ├─ Semantic search: transformers.js text embeddings│
│     │     (multilingual-e5-small, ~120 MB, cached)     │
│     └─ (later) image search: CLIP embeddings           │
│     │                                                  │
│  Storage: IndexedDB via Dexie                          │
│     ├─ sarees, locations, history, embeddings          │
│     └─ photos (compressed WebP, ~150 KB each)          │
│     │                                                  │
│  Backup/Sync: Google Drive (mom's own account)         │
│     └─ app-data folder: JSON + photos, auto on change  │
└────────────────────────────────────────────────────────┘
```

**Why this shape:** nothing runs on a server we pay for or that could disappear. The app is static files, all the processing happens on her phone, and the only cloud part is her own Google Drive, which she already has and which doesn't expire. See `CLAUDE.md` → Decision Log for the alternatives we rejected.

## 4. Data model

```ts
Location {
  id: string            // uuid
  name: string          // "Shelf 2"
  parentId: string|null // Room → Unit → Spot tree
  kind: 'room' | 'unit' | 'spot' | 'away'   // 'away' = tailor, lent to someone, etc.
  qrCode?: string
}

Saree {
  id: string
  photos: Blob[]        // 1–4, compressed WebP; first one is the cover
  title?: string        // optional nickname: "Mummy's wedding Patola"
  colors: string[]      // ["red", "gold"]
  fabric?: string       // silk, cotton, georgette, chiffon, banarasi, patola, bandhani...
  pattern?: string      // border, zari, floral, peacock, plain...
  occasion?: string     // wedding, daily, festive
  notes?: string        // free text: "wore at Riya's wedding 2023, blouse in same bag"
  locationId: string
  lastWorn?: Date
  createdAt: Date
  updatedAt: Date
  textEmbedding?: Float32Array   // from a "search document" built out of all the fields
  imageEmbedding?: Float32Array  // phase 4
}

History { id, sareeId, fromLocationId, toLocationId, at: Date, note? }
```

**Search document:** for embeddings we join the fields into one sentence:
`"red and gold silk banarasi saree with zari border, wedding. Notes: wore at Riya's wedding. Kept in Master Bedroom > Godrej Almirah > Shelf 2"`.
Including the location means queries like "sarees in the guest room" work through semantic search without any special code.

## 5. How the natural-language search works

1. **Parse** the query with simple rules and a dictionary (colours, fabrics, room names, including Gujarati synonyms in both scripts: લાલ / lal → red, પીળો / pilo → yellow). Anything that matches strongly becomes a **filter** (e.g., room = Guest Room).
2. **Keyword score** with MiniSearch (fuzzy, so "banarsi" matches "banarasi").
3. **Semantic score**: embed the query on the device and compare it with the cosine similarity of each saree's embedding.
4. **Blend** the scores (`0.6·semantic + 0.4·keyword`, tuned later), apply the filters, and show the results as photo cards with the location in large text.
5. **Voice:** the Web Speech API (free, built into Chrome on Android) fills the search box, with `gu-IN` and `en-IN` selectable.

With 100–1,000 sarees, a brute-force vector comparison takes under 10 ms, so no vector database is needed.

## 6. Phases

### Phase 0: Setup
- [x] Vite + React + TypeScript project, PWA plugin, Dexie
- [x] GitHub Pages deploy workflow (Cloudflare Pages as the alternative)
- [ ] First deploy and install on Mom's phone
- [x] Mobile-first theme: base font 20px, tap targets 56px+, high contrast, dark mode
- [x] GU/EN language toggle

### Phase 1: Catalogue (MVP)
- [x] Location manager (add room/unit/spot, tree view)
- [x] Add saree: camera capture → compress → pick location → tags as chips → save
- [x] Browse by location ("what's in this almirah?")
- [x] Edit, move (writes history), delete
- [x] Manual export/import (zip) as a safety net
- [x] Batch mode: the place is kept between saves
- [x] Interim plain-word search (replaced in Phase 2)

### Phase 2: Search
- [x] Search engine: custom, on device (replaced MiniSearch, see CLAUDE.md D19)
- [x] Synonym dictionary (EN/GU, Gujarati script and Gujarati in English letters) plus related colours and cross-language place words
- [x] Voice input (gu-IN / en-IN)
- [x] Evaluation set: 20 sarees × 43 queries, 100% top-3, ~14 ms per query at 1,000 sarees
- [ ] Mom's own ~30 real queries added to the eval
- [ ] ~~transformers.js embeddings~~: deferred until real misses justify it (D20)

### Phase 3: Backup and multi-device
- [ ] Google Drive sync (appDataFolder, OAuth on the client side only)
- [ ] Automatic background backup after changes; restore on a new phone
- [ ] QR labels: generate a printable PDF sheet for each storage unit

### Phase 4: Smart extras
- [x] CLIP photo search (MobileCLIP-S0, opt-in, offline): text query finds untagged sarees by how they look (CLAUDE.md D22)
- [ ] Colour/fabric suggestions from the photo when adding a saree
- [ ] "Not worn in 2+ years" view

### Backlog
- [ ] Shared family access (shared Drive folder), deferred per D10

### Bulk onboarding (practical tip)
The first data entry is the hardest part. Plan: do one storage unit at a time, take one photo per saree, set the location once for the whole batch ("batch mode"), and fill in tags later, or let Phase 4 suggest them.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The phone is lost or reset, so the IndexedDB data is gone | Manual zip export in Phase 1, automatic Drive backup in Phase 3 |
| The browser evicts storage | Call `navigator.storage.persist()`; install as a PWA |
| The embedding model is too heavy for an old phone | Fall back to keyword search plus synonyms; use the quantized model |
| The free host disappears | The app is plain static files, so it can be moved to any host in minutes (GitHub Pages, Netlify, Cloudflare) |
| Google changes Drive API terms | Data is also exportable as a zip; the app keeps working fully offline |
| Too fiddly for mom | Photos come first, tags are optional, big buttons, voice search; test with her after each phase |
