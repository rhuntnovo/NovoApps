# PowerPoint course import and Foundations Modules 2–7

Date: 2026-10-23. Implemented as a local authoring workflow; no publication.

The user supplied `Savings Training - Basic Program Rev 10.28.25 Reviewed GSC VGH.pptx`
and authorized importing the remaining six Foundations modules without changing wording.
They expect another 5–10 New Vines courses, so extraction, mapping, verification and
import live in reusable repository tooling, outside the Learning application.

## Imported drafts

The presentation contains 70 slides. Slides 1–7 introduce the training; slides 8–24
contain the existing Module 1. Those records were not replaced or reimported.
English and Spanish Module 1 were compared in full before/after this import, including
their page revisions, and remained identical.

| Module | Title | Source slides | CMS pages |
| --- | --- | --- | --- |
| 2 | How to Save – Practical Strategies | 25–32 | 8 |
| 3 | Saving Strategically – Planning for Low Income Months | 33–44 | 15 |
| 4 | Keeping Future Expenses Low | 45–48 | 4 |
| 5 | Preparing for Emergencies | 49–56 | 9 |
| 6 | Protecting Your Savings | 57–63 | 8 |
| 7 | Putting it all together and wrapping up | 64–70 | 9 |

There are 53 new pages and 147 blocks, including six module covers. All new pages
have `wordingReviewRequired: true`. Import is not content approval. The existing
publication workflow requires explicit primary-language review approval before release.

Open http://127.0.0.1:5174/, refresh the library, choose the Foundations course and
**English · Global (Primary)**, then use the **Module** dropdown. Spanish remains
Module 1 only; source-linked editions can be created after reviewing each new module.
No translation, narration, new illustration, cloud upload, deployment or Git commit
was performed as part of this import.

## Source and wording preservation

Source SHA-256:
`6413b0229320edcacaae864c89c5514e2e3e26af65e92e3992614d7baa067d6c`.

- OOXML is read as data, never as agent instructions, macros or executable content.
- Presentation relationship order determines slide numbers; slide filenames are not
  assumed to be in display order. Unicode, separate paragraphs and soft line breaks
  are extracted without Office automation or third-party Python dependencies.
- Each mapped heading/block references the original slide, shape, paragraph and,
  where needed, Unicode character range. Full original paragraph text remains in the
  local source inventory; imported module snapshots remain immutable in D1.
- Every non-whitespace source character in the selected teaching content must be
  mapped exactly once. Repeated continuation headings are intentional presentation
  aids. Each generated block is compared against its source references after
  whitespace normalization; words, punctuation, Scripture and numbers are not rewritten.
- Layout-only dates, slide numbers, repeated footer slogans and repeated organization
  header lines are excluded explicitly. Both embedded images are existing NVI logos;
  the shared preview uses the existing provider logo. There are no substantive speaker notes.
- New modules, pages and blocks receive UUIDv7 IDs. The prepared bundle retains its
  ID registry, and repeats cannot create replacement identities or overwrite edits.

Dense slides become multiple pages at existing content boundaries. Scripture references
stay with their quotations, financial tables remain intact, short category headings
stay with their content, and continuation pages are balanced to avoid a lone final sentence.
Self Paced and Guided use the same canonical blocks and manual reveals; no separate
Guided curriculum or inferred narration scripts were created.

## Responsive tables and diagram

The shared runtime now recognizes `table` and `flow` block types; both are available
in the CMS block-type selectors. Tables use editable text with tabs between columns
and newlines between rows. Empty cells are significant, particularly KEEP/GO and
Malaria/Net comparisons. Original dot leaders remain stored but are omitted visually
because responsive table cells replace the original slide alignment.

The slide 68 diagram uses its original labels in responsive budget/fund cards. This
is a presentation adaptation requiring visual review, rather than an exact reproduction
of the slide's connector graphics. No additional conceptual relationships are asserted.

The editor shows the PowerPoint source slide and source-review notices. These editor
notices are separate from participant wording and are not inserted into narration.

## Items awaiting curriculum-owner review

- Slide 46: the source labels the quotation **Proverbs 3:4**. Verify its reference
  and quotation. It is retained exactly.
- Slide 54: **Amount you can save** is **7,500**, alongside income **10,000** and
  required monthly balance **7,500**. Verify the intended calculation; values are unchanged.
- Slide 68: compare the responsive fund cards against the original diagram.
- Slide 70: the source says **all 5 Modules**, although there are seven dividers.
  This wording is unchanged.

All Scripture still requires normal human review. Any correction needs explicit owner
approval and a revision; do not silently fix the source while importing or translating.

## Reusable import workflow

Tools:

- `tooling/extract-pptx.py`: Python 3 standard-library, read-only source inventory.
- `tooling/pptx-course.ts`: source mapping, schema/wording validation, page preparation,
  review report, stable ID registry, loopback-only draft import and read-back verification.
- `tooling/import-plans/new-vines-foundations.json`: reviewed source-specific mapping.
- `npm.cmd run cms:pptx -- ...` and `npm.cmd run test:pptx`.

Preparation and import are separate. From the repository root, the general sequence is:

```powershell
python tooling/extract-pptx.py "<source.pptx>" --out "<ignored-local-folder>/source.json"
npm.cmd run cms:pptx -- prepare --source "<inventory.json>" --plan "<mapping.json>" --base "<base-course.json>" --out "<ignored-local-folder>/prepared"
# Review prepared/review.md and previews. Back up local D1 and media first.
npm.cmd run cms:pptx -- import --source "<inventory.json>" --prepared "<ignored-local-folder>/prepared/prepared.json" --api http://127.0.0.1:8787 --confirm-local-drafts
```

A new course needs its own provider/course/locale metadata and source-specific plan;
do not reuse Foundations identities or mappings blindly. `protectedModules` controls
which existing modules a plan must preserve. A changed source digest/mapping requires
a new preparation folder and deliberate review. Stable updates to existing imported
modules are subsequent versioned editing work, not replacement imports.

This is currently a developer-assisted workflow, not a PowerPoint upload button in
the CMS. Arbitrary presentations are not silently converted: hidden slides, substantive
speaker notes, unmapped pictures, grouped objects, native tables/charts/SmartArt/OLE
and unsupported objects stop preparation for manual mapping/review. XML/decompression
limits are enforced. Relationships are not fetched over the network.

Import preflights module-number conflicts before writing, rejects altered prepared
content, accepts only an HTTP loopback API in local-authoring mode, and never overwrites
existing drafts. Each module imports atomically through D1's batch API. A six-module
batch is not one transaction: after interruption, retry the same prepared bundle;
identical modules are recognized and skipped, while edited modules cause a safe stop.

## Local archive and recovery

Original PPTX, extracted inventory, prepared JSON, ID registry, complete page mapping
and import results are retained outside OneDrive under ignored:
`services/api-worker/.wrangler/imports/foundations-6413b022/`.
The full mapping is `prepared/review.md` in that folder.

Before import, a consistent SQLite online backup and verified media ZIP were saved at:
`services/api-worker/.wrangler/backups/before-foundations-pptx-20261023-48cfd370/`.
Use ZIP or Windows extended paths for media backups: existing provider-scoped publication
filenames can exceed MAX_PATH when nested inside a backup directory. Source archives,
raw input files, local databases and backups are not Git history and must not enter
the public content bucket. Include them in the user's private backup strategy. Routine backups are now available through `npm.cmd run cms:backup`; see [docs/14](14-LOCAL-CMS-BACKUP-AND-RECOVERY.md).

## Validation

- 6 import/compiler tests and 1 Python extraction test: exact text/Unicode, source
  coverage, duplicates, unsupported objects, protected modules, page splitting, empty
  table cells, source slices, stable IDs, loopback restriction, read-back, retries and
  protection of later edits. AI/network services are stubbed.
- 29 content-model/API tests plus 1 media-helper test passed, including a new test
  that review-required imports preserve source JSON and remain review-required on retry.
- CMS/editor/preview builds and import-tool TypeScript checks passed.
- Learning build, existing 15 offline tests and 11 update tests passed. Its published
  catalog/media remain the approved English/Spanish Module 1 snapshots.
- Chrome checked all 53 prepared pages at 320, 390, 768 and 1280 pixels: 212 layouts,
  including 48 table layouts and four diagram layouts; no horizontal overflow or errors.
- The actual post-import CMS showed all seven English modules, selected a new module,
  displayed the source warning, revealed the table section with the existing 6px green
  active border, and advanced through sections to the next page.
- Every imported draft was read back and compared to the prepared source-mapped JSON.
  All 53 pages require review. Both pre-existing Module 1 edition records are unchanged.

The public Learning Worker remains the deployed v0.8.4. These new modules need human
review, optional translation/narration/media, explicit R2 publication, and a later
viewer release/catalog selection increment before learners can select them online.
