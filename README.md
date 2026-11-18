# GAP Permit Tracker

Green Anode Plant's work-permit tracker. **GitHub Pages hosts the website; Google Sheets stores the records through Google Apps Script.**

## Included

Permit entry, MA/M1–M4 format validation, sections and units, online/isolation controls, approvals, shift handover audits, range reports, order history, filtered CSV and unique exports, PNG capture, print/PDF, and browser-based permit-photo recognition. A clearly labeled sample mode uses fictional records only in page memory.

## Connect Google Sheets

Follow [SETUP.md](public/setup/SETUP.md). The complete service is [Code.gs](public/setup/Code.gs); its manifest is [appsscript.json](public/setup/appsscript.json).

Only the Apps Script deployment address belongs in `public/config.js`. **Never commit owner setup keys, plant access codes, or browser keys.**

A new browser generates a random 256-bit key. Apps Script keeps its hash, status and role in the Devices sheet. The owner connects once with a consumed setup key. Staff need the plant access code to request approval. Roles are checked on every service action. There are no client-side issuer flags or hardcoded delete passwords. The website itself is public; permit records require an approved browser.

## Development

Node 22.13+ is required. Run `npm ci`, then `npm run dev` (localhost:5174). `npm test` runs the domain and actual Apps Script service tests with in-memory Google adapters. `npm run build` checks TypeScript and builds `dist-pages/`. `npm run preview` serves that build.

The tests cover unit-aware handovers, overnight India shifts, historical snapshots, filtered exports, safe CSV fields, owner activation, device approvals, role enforcement, duplicates, retry, approval, stale versions, validation and soft archive. Live Google authorization and deployment are separate steps.

## GitHub Pages

Source lives on main. Run `npm test`, commit and push source, then run `npm run deploy` to build and publish the gh-pages branch. Choose **Deploy from a branch > gh-pages > / (root)** in Pages settings. The publishing helper preserves branch history and uses the signed-in GitHub CLI credentials without copying tokens into files. Assets use relative paths. The Google Sheet stays private even when website source is public.
