# GAP Google Sheets setup

## Prepare the service

1. In Google Apps Script create **GAP Permit Tracker**, paste `Code.gs`, and use the supplied `appsscript.json` manifest.
2. Run **setupGap** and review Google's spreadsheet/account-email authorization yourself. The execution log gives the new **GAP Permit Register — Green Anode Plant** sheet link. No ARS records are imported.
3. The service creates **Permits**, **Requests**, **Devices**, **Members** (the initial owner roster), and **AuditLog**. Keep the spreadsheet and script project private. Only authorized sheet editors should change device roles or source.
4. Default sections are Mechanical, Electrical and Operation. The initial unit is GAP. Configure actual subdivisions in the **GAP_UNITS** script property, a JSON list such as `["GAP-1","GAP-2"]`.

## Publish the Google service

1. Use **Deploy > New deployment > Web app**. Choose **Execute as: Me** and **Who has access: Anyone**. Review that audience before deploying: it makes the service address reachable, while the service rejects record access from unapproved browser keys. Its public GET endpoint returns service information only.
2. Copy the deployment URL ending in `/exec` into `public/config.js` as `apiUrl`. This URL is not a secret. Never put a setup key, access code or browser key in that file.
3. Publish the website with GitHub Pages. Run npm test and npm run deploy; choose Deploy from a branch, gh-pages, root as the Pages source.

## Connect the owner browser

1. On the published tracker open **Settings > I own this register**.
2. In the Google script's **Project Settings > Script Properties**, copy **GAP_OWNER_SETUP_KEY**.
3. Enter your name and that one-time key in the tracker. The service activates this browser as administrator and consumes the setup key. Do not paste the key into chat or a repository.
4. The owner browser can now read and write the GAP sheet. Settings shows the plant access code and pending browser requests.

If you lose the owner browser key, the Google script owner can run **resetOwnerSetup** to generate another one-time key. Approve a replacement owner browser, then revoke the lost browser. Existing browser grants are not reset automatically.

## Staff access

The administrator shares the **plant access code** only with intended staff. A colleague opens the website, enters their name, contact email and code, and requests approval. An administrator reviews the request in Settings and approves the browser as requester or issuer. Contact email is a label, not a verified Google sign-in. Approval belongs to the browser's random key; it does not grant the colleague access to the underlying Google Sheet.

Requesters submit permit changes for review. Issuers and administrators issue and approve permits. Administrators manage browser roles. Revoke lost or shared browsers. The service prevents removal of the last active administrator. **Forget this browser** removes the local key; returning will need a new approval.

## Operating rules

- India Standard Time: A 06–14, B 14–22, C 22–06. C keeps the date it started. G is manual.
- MA: 8 digits beginning with 1. M1–M4: 9 digits beginning with 1–4. This checks format, not SAP existence.
- One entry per unit, order, date and shift. Creates, edits and approvals all enforce the rule under a script lock. Stale updates require a refresh.
- A handover is satisfied by Extended or Returned for the same unit and order in the next shift. A matching order in another unit does not count. Range reports use the selected end shift; future returns do not alter an earlier report.
- Displayed filters are used for CSV and unique exports. Exports include unit, date, shift and times. CSV formula prefixes are escaped. Print can save PDF; Save image produces PNG.
- Photo recognition runs in the browser after its engine/language files load. Verify extracted details. Permit images are not retained in the sheet.
- Archive keeps the original row and change history. Live records are not cached in browser storage. Only the random browser key is stored locally. Failed saves keep the form open. There is no offline write queue.
- Google Sheets has quotas and is not a transactional database. Keep organization-approved backups and avoid direct row edits while staff are issuing permits. Update Code.gs through Manage deployments > Edit > New version to keep the same service URL.

## Verification after deployment

Confirm an unknown browser cannot read records. Activate the owner browser; check the empty live register and underlying tabs. Test writes in a dedicated test sheet before operational use. Test requester approval, duplicates, stale edits, overnight shifts and unit-aware handovers. Sample mode does not write to the sheet and is safe for reviewing the workflow.

## Upgrade an existing GAP service for SAP permit scans

The photo scan stores the detailed SAP form in a new `sapDetails` column on the existing Permits tab. Preserve the current sheet and service URL:

1. Make a Google Sheets copy or other approved backup before changing the service.
2. In the existing Apps Script project, replace `Code.gs` with the supplied updated file and save it.
3. Run `migrateGapSchema` once from the function menu. It checks the existing Permits headers and adds only the `sapDetails` header; it stops if the column contains data or the existing headers differ.
4. Open **Deploy > Manage deployments**, edit the current web app deployment, choose **New version**, and deploy. Keep the existing deployment URL in `public/config.js`.
5. Refresh the website. The service must report schema version 2 before scanned permits can be saved. Manual permit entry remains available during the upgrade.

The scan runs in the browser and does not upload or retain the original photo. OCR can miss values and checkbox marks. Issuers must verify every field, especially hazards, controls, PPE and signatures. The SAP issuer timestamp is stored as a printed-form reference; paper handover stays pending until the issuer confirms that the physical copy was handed to the receiver and enters its actual handover time.
