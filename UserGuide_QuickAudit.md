# PackMasters 5S — Quick Audit User Guide

**Version:** v5.3.1
**Date:** February 2026
**Applies to:** Zone Supervisors, Zone Leaders, 5S Auditors, Area Managers

---

## Table of Contents

1. [What is Quick Audit?](#1-what-is-quick-audit)
2. [Who Should Use It?](#2-who-should-use-it)
3. [How to Access Quick Audit](#3-how-to-access-quick-audit)
4. [Page Load Times](#4-page-load-times)
5. [Page Layout Overview](#5-page-layout-overview)
6. [Scoring Scale (0–4)](#6-scoring-scale-04)
7. [The 5S Scoring Criteria](#7-the-5s-scoring-criteria)
8. [Step-by-Step: Completing a Quick Audit](#8-step-by-step-completing-a-quick-audit)
9. [After Submission](#9-after-submission)
10. [Important Notes](#10-important-notes)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. What is Quick Audit?

Quick Audit is a mobile-first, one-tap scoring tool built into PackMasters 5S. It allows zone supervisors and auditors to score their zone across all 20 five-S criteria quickly and accurately from a mobile device.

Criteria are organised by the five pillars (S1 through S5), each scored on a 0–4 scale. When you submit, results are saved instantly to Google Sheets with no manual data entry required.

A typical Quick Audit takes **5–10 minutes** to complete.

---

## 2. Who Should Use It?

| Role | When to Use |
|------|-------------|
| Zone Supervisor / Zone Leader | Daily or as needed for self-assessment |
| 5S Auditor | Spot-checks and scheduled audits |
| Area Manager | Verification audits and cross-zone reviews |

---

## 3. How to Access Quick Audit

There are four ways to open the Quick Audit for a zone.

### Option A — From the Home Page (Recommended)
1. Open the PackMasters 5S app.
2. Tap the zone card for your zone (e.g. "Production Floor A").
3. The Zone Landing Page opens.
4. Under the **Zone Tools** section, tap **Quick Audit**.

### Option B — From the Zone Landing Page
1. Select your zone from the zone list.
2. Three options appear: Daily Checksheet, Weekly Audit, and Zone Tools.
3. Quick Audit is listed under **Zone Tools**.

### Option C — Direct URL
Use the following URL format, replacing `Z-01` with your zone ID:

```
https://[deploy-url]/exec?v2=1&action=quickaudit&zone=Z-01
```

> **Note:** If you navigate to this URL without a zone parameter, you will see a "No zone specified" error. Always include the `zone=` parameter or access via the zone card on the Home Page.

### Option D — From the SQCDP Board
Tap the **audit icon** next to any zone on the SQCDP Board to open that zone’s Quick Audit directly.

---

## 4. Page Load Times

Quick Audit runs on Google Apps Script, which has a cold-start delay. Expected load times are:

| Stage | Expected Time |
|-------|---------------|
| Page shell loads | 5–8 seconds |
| Audit criteria load | Additional 10–15 seconds |
| **Total before scoring** | **~15–25 seconds** |

If the page shows **"Loading audit form..."** for more than 30 seconds, refresh the page.

---
## 5. Page Layout Overview

Once the page loads, you will see the following areas from top to bottom.

### Top Bar
Displays the following at all times:
- Title: **Quick Audit**
- Zone name, current date, and your name (auditor)
- A live **timer (MM:SS)** that tracks how long the audit has been in progress

### Progress Bar
A thin bar below the top bar that fills as you score criteria. It shows the percentage of criteria scored.

### Duplicate Audit Warning (Amber Banner)
If the zone has already been audited today, an amber warning banner appears:

> "This zone was already audited today. Submitting will add another record."

This is informational only. You may still proceed and submit if needed.

### Criterion Cards
The main body of the page contains 20 criterion cards, one for each audit item. Each card includes:

| Element | Description |
|---------|-------------|
| Pillar colour band | Left-side stripe indicating which S-pillar the criterion belongs to |
| Criterion ID and name | Displayed in ALL CAPS (English) |
| Hindi translation | Displayed in regular text below the English name |
| Score buttons | Buttons labelled 0, 1, 2, 3, 4 — colour-coded |
| "Show Standard" link | Opens a WDGLL reference photo (only shown if a standard photo exists) |

**Pillar colour coding:**

| Pillar | Colour |
|--------|--------|
| S1 Sort (Seiri) | Red |
| S2 Set in Order (Seiton) | Orange |
| S3 Shine (Seiso) | Yellow |
| S4 Standardise (Seiketsu) | Teal |
| S5 Sustain (Shitsuke) | Purple |

After you tap a score on a card, the card collapses and dims to show it is complete. The next unscored card becomes active with a highlighted border.

### Progress Footer
Fixed at the bottom of the screen:
- **"X/20 scored"** count showing how many criteria have been scored
- **"Complete Audit"** button — disabled until all 20 criteria are scored

### Bottom Navigation Bar
Persistent navigation: **Home | Board | Actions | Handover | More**

---

## 6. Scoring Scale (0–4)

Use the following scale when selecting a score for each criterion. The score should reflect what you observe in the zone at the time of the audit.

| Score | Label | Colour | Meaning |
|-------|-------|--------|---------|
| 0 | Non-compliant | Red | Not done at all |
| 1 | Major issues | Orange | Major issues present |
| 2 | Partial | Amber | Partially done |
| 3 | Mostly done | Lime | Mostly done, minor gaps only |
| 4 | Fully compliant | Green | Fully compliant, excellent standard |

> **Guidance:** If you are unsure between two scores, use the "Show Standard" reference photo (where available) to compare the zone against the expected standard.

---

## 7. The 5S Scoring Criteria

The 20 criteria are divided equally across the five pillars, with 4 criteria per pillar.

| Pillar | Focus Area |
|--------|------------|
| S1 — Sort (Seiri) | Identifying and removing unnecessary items from the zone |
| S2 — Set in Order (Seiton) | Organising necessary items so they are easy to find and return |
| S3 — Shine (Seiso) | Cleanliness of the zone, equipment, and floors |
| S4 — Standardise (Seiketsu) | Maintaining and sustaining standards through visual controls |
| S5 — Sustain (Shitsuke) | Discipline, routines, and adherence to 5S practices |

Each criterion is displayed in both **English and Hindi** on the criterion card. There is no language toggle — both languages are always shown.

---
## 8. Step-by-Step: Completing a Quick Audit

Follow these steps to complete a Quick Audit for your zone.

1. Open Quick Audit for your zone using one of the access methods in [Section 3](#3-how-to-access-quick-audit).
2. Wait for the criterion cards to load (approximately 15–25 seconds).
3. If an amber warning banner appears (zone already audited today), read it and decide whether to proceed.
4. Read the first criterion card — English name and Hindi translation are both shown.
5. Observe the zone and tap the score button (0–4) that best matches what you see.
6. The card collapses and dims, confirming it is scored. The next card becomes active.
7. Continue scoring each card in order. Use the "Show Standard" link if you need to compare against the reference photo.
8. Watch the progress footer — it shows **"X/20 scored"** as you go.
9. Once all 20 criteria are scored, the **"Complete Audit"** button becomes active.
10. Tap **"Complete Audit"** to submit the audit.
11. The success screen displays your zone’s final score (e.g. "75%").

> **Tip:** Tap directly on the score number button. Avoid tapping on the card edges or background, as only the score buttons register a selection.

---

## 9. After Submission

Once you submit, the following happens automatically.

### Success Screen
- Displays the zone’s total score as a **percentage**
- Colour of the result indicates performance:

| Score | Colour | Meaning |
|-------|--------|---------|
| 80% and above | Green | Good standing |
| 60% to 79% | Amber | Needs attention |
| Below 60% | Red | Immediate action required |

### Corrective Action Reminder
If any criterion received a score of **0 or 1**, a reminder note will appear on the success screen prompting you to raise a corrective action in the Actions module.

### Data Saved to Google Sheets
Results are saved instantly to the **Audit Log** tab in the connected Google Sheet. No further steps are required to record the data.

### Home Page Score Card Update
The zone score card on the Home Page will reflect the new audit result on the next page load.

---

## 10. Important Notes

- **One audit per day per zone** is the standard practice. The system allows re-auditing but will warn you if an audit has already been submitted for the zone today.
- **The timer** starts when the criteria finish loading. A typical audit should take 5–10 minutes. The timer is for reference only and does not enforce a time limit.
- **Language display:** Criteria are always shown in both English and Hindi. There is no language toggle in Quick Audit.
- **WDGLL Reference Photos:** Where a standard photo has been configured for a criterion, a "Show Standard" link appears below the score buttons. Tap it to view the reference image before scoring.
- **Re-auditing:** If you accidentally submit an audit or need to re-score a zone, you can run the audit again. A second record will be added to the Audit Log. Inform your 5S coordinator if duplicate records need to be removed.

---

## 11. Troubleshooting

| Issue | Solution |
|-------|---------|
| "No zone specified" error on load | Access Quick Audit via the zone card on the Home Page, not via a direct URL without the `zone=` parameter |
| Criteria do not load (spinning for 30+ seconds) | Refresh the page. If the problem continues, check your internet connection |
| "Already audited today" amber warning | This is informational only. You can still proceed and submit if a second audit is required |
| "Complete Audit" button remains disabled | Check that all 20 criteria have a score selected. Scroll through the cards to find any that have not been scored |
| Score does not register after tapping | Tap directly on the score number button (0, 1, 2, 3, or 4). Do not tap on the card edges or background area |
| Page does not respond after submission | Wait up to 15 seconds. If nothing happens, do not tap again — check the Audit Log in Google Sheets to confirm whether the record was saved before re-submitting |

---

*PackMasters 5S — Quick Audit User Guide*
*Version v5.3.1 | February 2026*
*For system support, contact your 5S coordinator or system administrator.*
