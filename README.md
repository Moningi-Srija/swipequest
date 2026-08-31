# SwipeQuest

**Brain dump. Swipe. Lock in.**

SwipeQuest turns an overwhelming brain dump into a deck of playable side quests. Swipe past what is not the vibe, match with one move, lock in for a timed session, and keep receipts for every W.

**Live app:** [swipequest.onrender.com](https://swipequest.onrender.com)

## What works in Phase 1

- Tinder-style task deck: left to pass, right to begin
- Touch-friendly phone swipes with a start-timer confirmation after every yes
- Persistent Cherry Editorial / After Dark theme switch
- Confirmed task deletion that preserves completed focus receipts
- Searchable waiting, active, and completed task lists
- Focus timer with pause, finish, and partial-session logging
- Completion history and daily focus stats
- Browser-local persistence with JSON backup and restore
- Private, local-only WhatsApp `.txt` import with task suggestions and a review screen
- Mobile-friendly layout and keyboard controls

## Privacy

Task data stays unencrypted in the browser's `localStorage`, so anyone with access to that browser profile could read it. WhatsApp exports are parsed locally and are never uploaded by the app. The raw chat is not stored; only tasks explicitly selected in the review screen are saved. Heuristic filters skip sensitive-looking entries, media-only messages, and link-only messages, but users should still review every selection.

This repository intentionally excludes personal exports and backup files.

## Run locally

No installation is required. Serve the folder with any static file server, for example:

```bash
python3 -m http.server 8792 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8792/`.

## Tests

```bash
node tests/import-parser.test.js
```

## Roadmap

- Optional sign-in and cross-device sync
- Installable PWA and mobile wrapper
- Smarter opt-in task extraction
- Custom categories and richer analytics

Built one side quest at a time.
