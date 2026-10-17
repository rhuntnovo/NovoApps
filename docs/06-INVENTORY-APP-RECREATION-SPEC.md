# New Vines Inventory --- Recreation Specification

## Purpose

Capture the already-built Inventory PWA so it can be recreated inside
NovoApps.

## Business model

Simple microbusiness inventory: - purchases increase quantity - latest
purchase updates last unit cost - sales decrease quantity - capture sale
price - calculate/display profit - simple enough for users without
accounting expertise

Discussion began with LIFO terminology but practical implementation
moved to **last cost**, not a heavyweight formal inventory-accounting
engine.

## Prior apps

-   `simple-inventory-pwa@0.1.0`
-   `newvines-inventory-v2@0.2.2`, followed by V2.1 backup/export design

Stack: Preact + TypeScript + PWA + IndexedDB + English/Spanish i18n +
offline use + backup/export. It was successfully deployed/tested using
Azure Blob Static Website hosting.

Known navigation: Today/Home, Inventory, History, More/Settings.

## Conceptual records

Product: ID, workspace, name, optional code, quantity/balance, last unit
cost, optional default sale price, active, timestamps.

Inventory transaction: ID, workspace, product, type
(purchase/sale/adjustment), quantity, unit cost/cost basis, sale price,
profit/derived result, occurred time, audit/sync fields.

For auditability a sale should capture the cost basis used at sale time
rather than recalculating historical profit from a later last cost.

Daily/monthly summaries may be computed views rather than authoritative
stored tables.

## Backup/export

Restorable canonical backup: **JSON Gzip Backup Format**.

Human-readable export: **Excel Spreadsheet**, non-compressed, one
worksheet per logical table/view. Previously requested sheets: Products,
Transactions, Daily Summaries, Monthly Summaries, Settings.

CSV was considered earlier; Excel became preferred. When recreating, use
a maintained/safe export library/approach and audit dependencies.

## NovoApps recreation

-   workspace-aware
-   UUIDv7 IDs
-   IndexedDB local-first
-   common sync metadata/tombstones
-   clear sync envelope + encrypted cloud business payload
-   shared auth/workspace foundation when available
-   English/Spanish
-   preserve simple UX
-   backup/export remains independent of cloud sync

Offline must allow viewing inventory, purchases, sales, history,
profit/summaries without network.

If old source remains available, inspect/import it before rewriting:
capture screens, schema, translations, backup format and business rules;
preserve old JSON Gzip restore compatibility if practical.
