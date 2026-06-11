# PackMasters 5S — Shift Handover User Guide

**Version:** v5.3.2 | **Date:** Feb 2026

---

## 1. What is Shift Handover?

The Shift Handover screen is an **automatically generated, read-only summary report** that compiles everything that happened during a shift — across all zones — into a single structured view. It is produced by the system at the end of each shift based on data already entered into PackMasters 5S during that shift (audits, NCs, Red Tags, action items, and Kaizen suggestions).

There is no manual data entry on this screen. The handover report is assembled entirely from live system data, ensuring it cannot be falsified or left incomplete.

The page title is **"Shift Handover Summary"** and the header displays the current date, shift name, and time window (e.g., `24-Feb-2026 | EVENING shift (07:06 – 15:06)`).

---

## 2. Who Should Use It?

| Role | Purpose |
|---|---|
| **Outgoing Shift Leader** | Review the summary before handing over. Confirm all audits are done, NCs are logged, and any carried-forward items are communicated verbally to the incoming leader. |
| **Incoming Shift Leader** | Read through the report at the start of the shift to understand what happened, what is open, and what has been carried forward from the previous shift. |
| **Supervisor / Manager** | Use as a quick at-a-glance overview of shift performance — audit completion rate, NC count, and overdue items — without needing to open multiple modules. |

---

## 3. How to Access

Navigate to the Shift Handover screen using any of the following methods:

**Direct URL (replace zone ID as appropriate):**
```
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?v2=1&action=handover&zone=Z-02
```

**From the bottom navigation bar (on any v2 page):**
1. Look at the bottom of the screen — there is a fixed navigation bar with five tabs.
2. Tap the **Handover** tab (the double-arrow icon, fourth from the left).
3. The page loads automatically for the current shift and zone.

**From the "More" menu:**
1. Tap the **More** tab (hamburger/three-line icon, rightmost tab).
2. A slide-up sheet appears titled "All Tools".
3. Tap **Shift Handover** from the grid.

**Zone parameter:** The `zone=` URL parameter controls which zone's data anchors the report. If omitted, the system uses a default zone. The Handover report aggregates data from all zones in the plant, not just the one specified — the zone parameter is used primarily for navigation context.

---

## 4. Page Layout Overview

The page has four main structural areas:

```
┌─────────────────────────────────────────────┐
│  GAS banner ("This application was          │  ← Google Apps Script chrome (outside iframe)
│  created by a Google Apps Script user")     │
├─────────────────────────────────────────────┤
│  Dark header bar                            │  ← Sticky; shows title + shift period
│  "Shift Handover Summary"                   │
│  24-Feb-2026 | EVENING shift (07:06–15:06) │
├─────────────────────────────────────────────┤
│                                             │
│  Content sections (scrollable):             │
│  • Audits Completed   [count badge]         │
│  • NCs Raised         [count badge]         │
│  • Red Tags Created   [count badge]         │
│  • Carried Forward    [count badge]         │
│  • Kaizen Suggestions [count badge]  (opt.) │
│                                             │
├─────────────────────────────────────────────┤
│  Bottom nav: Home | Board | Actions |       │  ← Fixed; Handover tab is highlighted active
│              Handover* | More               │
└─────────────────────────────────────────────┘
```

**Header bar** — dark gradient (`#2c3e50` to `#34495e`), white text. Shows page title and dynamic shift info loaded from the server.

**Section cards** — each section is a white rounded card with a section header and body. The header background changes colour based on status:
- **Amber/yellow** = warning condition (audits missing, items carried forward)
- **Green** = all good (all audits done, nothing carried forward)
- **Neutral white** = informational (NCs Raised, Red Tags Created)

**Count badge** — blue pill on the right of each section header showing the count of items in that section.

---

## 5. Step-by-Step: Viewing a Handover

Because the Shift Handover screen is a **read-only summary**, there are no form fields to fill in. The workflow is:

**Step 1 — Open the page**
Navigate to the Handover URL or tap the Handover tab in the bottom nav. The screen shows "Generating handover..." while data loads (typically 3–8 seconds depending on server response time).

**Step 2 — Check the shift header**
Confirm the date and shift window shown in the dark header bar are correct for the handover you are reviewing. If the shift window is wrong, the system may be running on a clock mismatch — contact your system administrator.

**Step 3 — Review Audits Completed**
The first section shows how many zones completed their 5S audit during this shift (e.g., `3/8`). If the header background is amber, one or more zones are missing audits. The missing zones are listed in red text below the completed entries. The outgoing leader should note any missing zones and ensure they are actioned in the next shift.

**Step 4 — Review NCs Raised**
This section lists every Non-Conformance raised during the shift. Each row shows the NC ID, the zone and criterion it relates to, and a status badge (`OPEN`). A count of `0` with the message "No NCs raised this shift" indicates a clean shift.

**Step 5 — Review Red Tags Created**
Lists Red Tags raised during the shift. Each entry shows the Tag ID, the tagged item description, and the estimated value in INR (₹). A count of `0` means no Red Tags were created this shift.

**Step 6 — Review Carried Forward**
Items listed here are open action items that were not resolved before the shift ended. Each row shows the action title, the zone it belongs to, and its due date. If the header is amber, items are being carried forward — the incoming leader must take ownership of these. A green header with "No items carried forward" is the ideal end-of-shift state.

**Step 7 — Review Kaizen Suggestions (if present)**
This section only appears if one or more Kaizen suggestions were submitted during the shift. Each entry shows the suggestion title and the zone it came from. This section has no colour coding — it is always informational.

**Step 8 — Hand over verbally**
The Shift Handover screen does not replace a verbal briefing. Use it as a structured reference during the handover meeting. The outgoing leader should walk the incoming leader through any amber sections (missing audits, carried-forward items) and open NCs.

---

## 6. Handover Report Sections Reference

| Section | What it Shows | Header Colour Logic | Count of 0 Message |
|---|---|---|---|
| **Audits Completed** | Each zone's audit completion, auditor name, and score (%) for the current shift | Amber if any zones are missing; Green if all zones completed | — (always shows total as `0/N`) |
| **NCs Raised** | All Non-Conformances logged during the shift: NC ID, zone, criterion, status | Neutral (no colour coding) | "No NCs raised this shift" |
| **Red Tags Created** | All Red Tags created during the shift: Tag ID, item, value in ₹ | Neutral | "No Red Tags created" |
| **Carried Forward** | Open action items not resolved before shift end: title, zone, due date | Amber if items exist; Green if none | "No items carried forward" |
| **Kaizen Suggestions** | Improvement suggestions submitted during the shift: title, zone | Neutral (only shown if count > 0) | Section hidden entirely |

**Required fields:** There are no user-entry fields on this screen. All data is sourced automatically from system records. No submission is required or possible from this view.

---

## 7. After Viewing

The Shift Handover screen is a **view-only report**. There is no submit button and no confirmation step. Once you have reviewed all sections:

- The outgoing leader's responsibility for this shift is recorded through the underlying data (audits submitted, NCs logged, etc.) — not through a handover form submission.
- If action is needed on a carried-forward item, navigate to the **Action List** (tap the lightning bolt "Actions" tab in the bottom nav) to update or assign tasks.
- If an NC needs follow-up, use the NC/CAPA module.
- If a Red Tag needs resolution, use the Red Tag Board (`?v2=1&action=redtagboard`).

---

## 8. Viewing Past Handovers

The Shift Handover screen currently generates a report for the **active/most recent shift** based on server-side time logic. There is no date picker or shift selector on this page in the current version.

To review historical handover data:
- Access the underlying Google Sheet (requires admin/supervisor access) and look at the **Handover Log** sheet tab.
- Use the MRM Report Pack (`?v2=1&action=mrmpack`) which includes shift-level trend data.
- Contact your system administrator to pull a specific shift's data.

---

## 9. Important Notes

- **This is a summary, not a form.** No data is entered on this screen. All information is populated automatically from the shift's activity in other modules.
- **The shift window is server-determined.** The system decides the current shift (morning/evening/night) based on the current time at the moment the page is loaded. If you open the page at the boundary of two shifts, the window displayed may differ from your expectation.
- **Zone parameter affects navigation context only.** The `zone=Z-02` in the URL does not filter the report to Zone 2. The report aggregates all zones plant-wide.
- **Audits Completed shows all zones, not just the URL zone.** In the test session, with zone Z-02 in the URL, the Audits section still reported on all 8 zones (Z-01 through Z-08) and showed all 8 as missing for the EVENING shift.
- **The Kaizen section is conditional.** It only renders if at least one Kaizen suggestion was submitted during the shift. On shifts with no Kaizens, the section is completely absent from the page.
- **NC status badges are always "OPEN" at handover time.** NCs raised during a shift are, by definition, newly created and not yet resolved. The handover report does not show resolved NCs.
- **Red Tag values are displayed in Indian Rupees (₹)** and are rounded to the nearest whole number.
- **The page uses sticky header positioning.** The dark title bar stays visible as you scroll down through long lists of NCs or carried-forward items.

---

## 10. Troubleshooting

| Symptom | Likely Cause | What to Do |
|---|---|---|
| Page shows "Generating handover..." and never loads | Network timeout or server error | Refresh the page. If it persists, wait 30 seconds and try again. Check your internet connection. |
| Page shows "No data" in the content area | `getShiftHandoverData()` returned null | The system found no shift data for the current period. This can happen if no activity was logged or if the shift period is misconfigured. Contact your system administrator. |
| Page shows a red error message with technical text | A server-side exception was thrown | Note the error text and report it to your system administrator. |
| Shift window in the header shows wrong times | Server clock mismatch or shift schedule misconfiguration | Report to your system administrator. Do not use the handover data as authoritative until corrected. |
| All 8 zones show as "Missing" in Audits | No audits were submitted this shift across any zone | This is a genuine data condition, not a bug. Outgoing leader should investigate whether audits were actually done and not submitted, or genuinely missed. |
| Carried Forward items show due dates in the past | Items were not resolved over multiple shifts | These are overdue. The incoming leader must action them immediately. Use the Action List module to update. |
| Bottom navigation "Handover" tab does not highlight as active | Browser caching issue | Hard-refresh the page (Ctrl+Shift+R or Cmd+Shift+R). |
| Page loads but the dark header bar is not visible | The GAS sandbox iframe is scrolled down on load | Scroll to the top of the content area manually. This is a known cosmetic behaviour in the GAS iframe sandbox environment. |
