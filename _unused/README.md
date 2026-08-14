# `_unused/` — Retired Files

Files here are **quarantined, not deleted**. They are excluded from `clasp push`
via `_unused/**` in `.claspignore`.

## Rules

1. **Never push these.** They are not in the GAS project any more.
2. **Never `include()` or route to them.** Every one of them is unreachable from
   the live route table; adding a reference re-breaks the thing that retired it.
3. **Never copy code out of here without checking the live equivalent first** —
   most of these were retired *because* a better implementation replaced them.
4. To revive one: move it back to the project root, add its route in
   `20_EnhancedWebApp.js`, `clasp push --force`, and re-run `runAllTests`.

## ⚠️ Removing them from the server

Moving a file here does **not** delete it from Apps Script. `clasp push` never
deletes remote files that vanish locally — it reports "already up to date" and
leaves the old copy live. This has bitten this project repeatedly (see the
`*_tmp.js` note in `.claspignore`).

To actually drop them from the server, force a real sync:

```bash
printf '\n' >> 00_Diag.js     # any real content change
clasp push --force            # now the remote file list is rewritten
git checkout 00_Diag.js       # revert the throwaway edit
```

Verify with `clasp run <someFunctionFromTheFile>` → should return
`Script function not found`.

---

## Inventory

Retired 2026-08-14. Line counts as of that date. "Replaced by" is the live code
that does the job now.

| File | Lines | What it was | Why retired | Replaced by |
|---|---|---|---|---|
| `ActionList.html` | 752 | Original actions list view — filters, table, detail popup | Superseded by the unified ActionsHub. Route `actionlist` serves `ActionsHub`; zero refs, zero includes | `ActionsHub.html` |
| `99_SampleDataLoader.js` | 616 | Bulk sample-data loader: daily submissions, weekly audits, NC/CAPA, summary, red tags | Duplicate seeding path; nothing outside the file called into it | `00_DemoSeed.js` → `seedDemoData()` |
| `RedTagDashboard.html` | 540 | Standalone Red Tag dashboard — list, filter, dispose | Explicitly retired: routes `redtag` / `redtagboard` both serve ActionsHub (see route comment "Red Tag dashboard retired; Actions covers list/manage") | `ActionsHub.html` |
| `LoginPage.html` | 332 | Username + password login form; called `authenticateUser(username, password)` | Unreachable — `doGet` intercepts `isLoginAction` and serves `PinLogin` **before** `handleV2Route_` runs, so the v2 `case "login"` never fires. Auth moved to PIN keypad | `PinLogin.html` + `25b_PinAuth.js` |
| `ChartsView.html` | 319 | Charts-only analytics view | Routes `charts` / `analytics` / `insights` all serve `InsightsView` | `InsightsView.html` |
| `KanbanBoard.html` | 278 | Kanban task board | Route `kanban` serves `ActionsHub` | `ActionsHub.html` |
| `AnalyticsView.html` | 240 | Analytics/metrics view | Same merge as ChartsView | `InsightsView.html` |
| `MRMReportPack.html` | 12 | Placeholder stub — "Full UI implementation pending" | Shadowed by the real implementation; route `mrmpack` serves the `_Full` version | `MRMReportPack_Full.html` |
| `TierDashboard.html` | 12 | Placeholder stub — "Full UI implementation pending" | Shadowed by the real implementation; routes `tierdash` / `riskregister` serve the `_Full` version | `TierDashboard_Full.html` |

**Total quarantined: 3,101 lines across 9 files.**

---

## Not moved here (and why)

Findings from the same audit that were **left in place** — deliberately, so
nobody re-discovers them and assumes they were missed:

- ~~**Dead code inside live files**~~ — **done 2026-08-14, second pass**, 789 lines
  deleted outright (not quarantined — these were function bodies, not files):
  - `01_Config.js` — `getDefaultZoneConfig__PLACEHOLDER_DO_NOT_USE_` (181)
  - `25_Authentication.js` — the whole password stack: `setupUsersSheet`,
    `authenticateUser`, `addUser`, `changePassword`, `verifyPassword`,
    `hashPassword`, `hashPassword_`, `generateSalt_`, `getCurrentSessionFromUrl`,
    `purgeExpiredSessions`, `installSessionCleanupTrigger` (440). File went
    552 → 112 lines and now holds only `validateSession` / `logoutUser` /
    `getCurrentUserInfo`, which PIN auth depends on.
  - `04_AdminUtils.js` — 4 unregistered `*FromMenu` handlers (113)
  - `20_EnhancedWebApp.js` — `openSetupWizard_`, `openDataImport_` (12)
  - `31_DwmSync.js` — `example_on*` replaced by a field-map comment (39)

  **A real bug surfaced during this pass:** `quickSetup()` (the "🔧 Initial Setup"
  menu item) called `setupUsersSheet()`, which wrote the old 6-column
  `password_hash` schema over the `Users` sheet that PIN login reads with 12
  columns. Running initial setup would have broken login for everyone. Now calls
  `seedUsers()` from `25b_PinAuth.js` instead.
- **`WDGLLLibrary.html`** — also a "pending" placeholder, but route `wdgll`
  actively serves it. Retiring it breaks a live route; needs a product decision.
- **28 copies of `escHtml`/`esc`** across 27 HTML files (~110 lines). Consolidating
  into `CommonStyles` (already included by 24 of them) is a refactor, not a deletion —
  **and the copies are not identical**, so it needs care rather than a blind merge.
  Six files (`ZoneSelector`, `RecordView`, `OPLViewer`, `ManagementReview`,
  `SetupWizard`, `MRMReportPack_Full`) escape `& < >` but **not `"`**. None of the
  six currently interpolate into an HTML attribute, so there is no live injection
  hole — but any future `title="…"` or `data-x="…"` in those files would open one.
  Consolidate on the strict version (`& < > "` plus the falsy guard) when doing it.
- **`clasp run` entry points** — `listAllProperties`, `deleteStaleProperties`,
  `persistSpreadsheetId`, `systemHealthCheck`, `seedDemoData` etc. look dead to a
  static scan because nothing in the repo calls them. They are invoked externally
  from the CLI. **Do not delete on "no references" evidence alone.**
