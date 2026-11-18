# GAP Permit Tracker

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Google Sheets is the user-selected record store. The user explicitly selected GitHub Pages hosting to match the ARS tracker. A static React/Vite interface calls a Google Apps Script service. Access is approved per browser, with server-enforced roles; the sheet itself stays private.

## Users
Green Anode Plant shift staff who record, issue, return, and hand over work permits. Issuers review requests from other staff.

## Product Purpose
Build a tracker similar to the referenced ARS tracker for GAP, which the user confirmed means Green Anode Plant. ARS means Anode Rodding Shop.

## Capabilities and Constraints
Permit register, shift reports, handover audit, historical range and order search, approval requests, and exports. Use separate GAP data; do not copy live ARS records or contact details. Google Sheets is required. Preserve the referenced Mechanical, Electrical, and Operation sections and A/B/C shift timings unless the user changes them. These are proposed defaults, not confirmed GAP operating policy. No GAP subdivisions were provided: start with the single configurable unit GAP. Photo extraction must remain reviewable.

## Brand Commitments
Product name GAP Permit Tracker; plant name Green Anode Plant. Follow the familiar navy operational interface of the supplied tracker.

## Evidence on Hand
The referenced ARS tracker and its inspected public source. No GAP permit dataset or connected Google Sheet has been supplied. Sample records must be fictional and explicitly labeled.

## Product Principles
Keep shift entry quick. Use the same filters for displayed and exported data. Match handovers using the unit and order. Retain a record of changes. Keep setup keys out of the repository and store only browser-key hashes in the sheet. Do not report a save until the sheet confirms it.

## Open Decisions
Google account and sheet connection, team membership and issuer assignments, GAP subdivisions, and any changes to permit numbering or shift rules.
