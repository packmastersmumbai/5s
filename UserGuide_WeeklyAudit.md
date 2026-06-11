# PackMasters 5S — Weekly Audit User Guide

**Version:** v5.3.2 | **Date:** Feb 2026 | **Zone tested:** Z-05 — Quality Lab

---

## 1. What is the Weekly Audit?

The Weekly Audit is a structured, scored assessment of a zone's 5S compliance. It evaluates every workstation across all five 5S pillars (Sort, Set in Order, Shine, Standardize, Sustain) once per week, using a **0–4 granular scoring scale** per criterion.

Unlike the Daily Checksheet (which records a simple Pass/Fail for routine hygiene checks), the Weekly Audit produces:

- A **total percentage score** out of 80 maximum points (20 criteria × 4 points each)
- A **pillar-by-pillar score breakdown** shown in real time as you score
- Automatic **Non-Conformance (NC) flagging** for any criterion scored 0 or 1
- A **permanent audit record** written to the `WeeklyAudit` Google Sheet
- **Auto-generated CAPA tasks** for every NC raised (via the CAPAEngine backend)
- Optional **photo evidence** uploaded to the zone's Google Drive folder

---

## 2. Who Should Use It?

| Role | Responsibility |
|---|---|
| **Zone Leader** | Accompanies the auditor during the walkthrough; confirms findings |
| **Management Coordinator (MC)** | Conducts the weekly audit; the only role authorised to submit |
| **Safety / Quality Officers** | May be delegated MC access via the auditor whitelist |
| **Plant Manager / Top Management** | Reviews results via the Zone Dashboard after submission |

**Access is restricted.** The form enforces a Google account login and checks the submitter's email against the MC whitelist stored in ScriptProperties. Anyone not on the whitelist receives "Access Denied" and cannot score or submit. To add an auditor, the system administrator must update the `MC_WHITELIST` ScriptProperty via the Admin Menu.

---

## 3. Weekly Audit vs. Quick Audit vs. Daily Checksheet — Key Differences

| Feature | Daily Checksheet | Quick Audit (v2) | Weekly Audit |
|---|---|---|---|
| **URL parameter** | `?zone=Z-XX&type=daily` | `?v2=1&action=quickaudit&zone=Z-XX` | `?zone=Z-XX&type=weekly` |
| **Frequency** | Every working day | As needed / spot check | Once per week (zone-specific audit day) |
| **Scoring** | Pass / Fail per criterion | 0–4 per criterion | 0–4 per criterion |
| **Max score** | 20 (1 per criterion) | 80 | 80 |
| **Auth gate** | None — any user | None — runs as "system" | Google account + MC whitelist |
| **Offline support** | Yes (service worker) | Yes | No — requires live connection |
| **NC auto-raise** | No | Yes (score ≤ threshold) | Yes (score ≤ 1) |
| **CAPA engine trigger** | No | No | Yes |
| **Photo upload** | No | No | Yes (Drive) |
| **Sheet written to** | `DailySubmissions` | `WeeklyAudit` | `WeeklyAudit` |
| **Language toggle** | EN / हिं | EN / हिं | EN / हिं |
| **Pillar sections** | Accordion (collapsed) | Accordion | Accordion (S1 open by default) |

---

## 4. How to Access

1. Open a web browser on any device (mobile or desktop).
2. Ensure you are **signed into the Google account** that is registered in the MC auditor whitelist.
3. Navigate to the Weekly Audit URL for your zone:

```
https://script.google.com/macros/s/AKfycbw6GfjKqYmhprkF7tUJVofcAgGrK1ujjIhgtk7ETO2CG7BdtyxQkFlkR_Yym0uvCEJ8/exec?zone=Z-05&type=weekly
```

Replace `Z-05` with your zone ID (Z-01 through Z-08). Zone IDs map as follows:

| Zone ID | Zone Name | Audit Day |
|---|---|---|
| Z-01 | Production Floor A | Monday |
| Z-02 | Production Floor B | Monday |
| Z-03 | Raw Material Store | Tuesday |
| Z-04 | Finished Goods Store | Tuesday |
| Z-05 | Quality Lab | Wednesday |
| Z-06 | Maintenance Workshop | Wednesday |
| Z-07 | Office & Admin Area | Thursday |
| Z-08 | Dispatch & Loading Bay | Thursday |

4. The page will show a spinner ("Verifying auditor access…") for a few seconds while it checks your identity with the Google Apps Script backend.
5. If access is granted, the full audit form loads. If not, you will see the Access Denied screen (see Section 12 — Troubleshooting).

---

## 5. Page Layout Overview

The page is divided into the following regions from top to bottom:

```
┌─────────────────────────────────────────────────────┐
│ HEADER (sticky)                                     │
│  ← Back  |  Weekly Audit  |  Zone + Date  |  EN/हिं │
├─────────────────────────────────────────────────────┤
│ AUDITOR CARD                                        │
│  Auditor: [your email address]                      │
├─────────────────────────────────────────────────────┤
│ SCORING GUIDE CARD                                  │
│  0=N/A  1=Poor  2=Fair  3=Good  4=Excellent         │
├─────────────────────────────────────────────────────┤
│ PILLAR ACCORDION (×5)                               │
│  ▼ Sort (Seiri)          [0/16] ▼  ← tappable       │
│    S1-C1: ...  [0][1][2][3][4]                      │
│    S1-C2: ...  [0][1][2][3][4]                      │
│    S1-C3: ...  [0][1][2][3][4]                      │
│    S1-C4: ...  [0][1][2][3][4]                      │
│  ▶ Set in Order (Seiton) [0/16]                     │
│  ▶ Shine (Seiso)         [0/16]                     │
│  ▶ Standardize (Seiketsu)[0/16]                     │
│  ▶ Sustain (Shitsuke)    [0/16]                     │
├─────────────────────────────────────────────────────┤
│ AUDIT PHOTOS CARD                                   │
│  [camera icon] Tap to add photos                    │
├─────────────────────────────────────────────────────┤
│ SUBMIT AUDIT button (disabled until all scored)     │
├─────────────────────────────────────────────────────┤
│ SCORE BAR (fixed bottom)                            │
│  [progress bar]  Score: 0/80          0%            │
└─────────────────────────────────────────────────────┘
```

**Header:** Displays the zone name, today's date (formatted as "Tue, 24 Feb, 2026"), and the EN/Hindi language toggle. The "← Back" link returns to the Zone Landing Page.

**Auditor Card:** Confirms the Google account email the audit will be attributed to.

**Scoring Guide:** Quick reference for the 0–4 scale, colour-coded (red, orange, amber, green, dark green).

**Pillar Accordion:** Five collapsible sections, one per 5S pillar. The first pillar (Sort) is expanded by default. Only one pillar is open at a time — tapping a header closes the current and opens the selected one.

**Pillar Badge:** Each header shows a `current/max` score badge (e.g. `12/16`) which updates live as you score.

**Score Bar (fixed bottom):** Always visible. Shows the running total score and percentage, colour-coded: red below 60%, amber 60–79%, green 80%+. The Submit button is disabled until all 20 criteria have been scored.

---

## 6. Step-by-Step: Completing the Weekly Audit

### Before you begin

- Carry out a physical walkthrough of the zone with the Zone Leader present.
- Have your mobile device or tablet ready with a camera for photo evidence.
- Ensure you have a live internet connection (offline mode is not available for weekly audits).

### Steps

1. **Navigate to the Weekly Audit URL** for your zone (see Section 4).

2. **Wait for auth verification** — a spinner appears for 3–8 seconds. If your email is authorised, the full form loads. If not, contact the system administrator.

3. **Confirm your auditor email** is shown correctly in the Auditor card at the top of the form.

4. **Score the Sort (Seiri) pillar** — it opens by default:
   - Read each criterion label carefully.
   - Tap one of the five score buttons: **0, 1, 2, 3, or 4**.
   - The selected button highlights in the colour for that score (red for 0, orange for 1, amber for 2, light green for 3, dark green for 4).
   - If you score 0 or 1, a red NC notice appears below that criterion: "NC will be raised for this criterion."
   - Score all four criteria in the pillar. The pillar badge updates (e.g. `10/16`).

5. **Open the next pillar** by tapping its header bar. The previous pillar collapses automatically.

6. **Repeat for all five pillars** (Set in Order, Shine, Standardize, Sustain). Each pillar has 4 criteria (16 max points per pillar, 80 total).

7. **Add photos (optional but recommended):**
   - Tap the "Tap to add photos" area.
   - Select images from your camera roll or take new photos.
   - Each photo is uploaded to the zone's Google Drive folder in the background.
   - A link appears under the upload area confirming the upload status.

8. **Review the Score Bar** at the bottom — confirm the running total looks correct.

9. **Tap "Submit Audit"** (the green button, only enabled when all 20 criteria are scored).

10. **Wait for submission** — a loading overlay appears ("Submitting audit…"). This takes 3–10 seconds as the server writes the row to the WeeklyAudit sheet and triggers CAPA creation.

11. **Read the Success Screen** — it shows:
    - Total score and percentage (e.g. `64 / 80 (80%)`)
    - Number of Non-Conformances raised (e.g. "2 Non-Conformances raised" or "No Non-Conformances")
    - Zone name and today's date
    - A "← Back to Zone" button

12. **Tap "← Back to Zone"** to return to the Zone Landing Page.

---

## 7. Scoring Guide

Each of the 20 criteria is scored on a **0 to 4** integer scale. Half-scores are not permitted — you must pick one of the five whole-number buttons.

| Score | Label | Colour | Meaning | NC Raised? |
|---|---|---|---|---|
| **0** | N/A | Red | Not applicable or completely absent; condition cannot be assessed or does not exist in this zone | Yes |
| **1** | Poor | Orange | Requirement is not met; significant deficiency evident; immediate action needed | Yes |
| **2** | Fair | Amber | Partially compliant; some effort visible but standard not consistently met | No |
| **3** | Good | Light Green | Meets the standard in most respects; minor gaps only | No |
| **4** | Excellent | Dark Green | Fully compliant; exceeds baseline expectations; best-practice standard maintained | No |

**NC Threshold:** Any criterion scored **0 or 1** triggers a Non-Conformance. A red warning banner appears below the criterion in real time. After submission, the CAPAEngine automatically creates a corrective action task in the Actions list for each NC, assigned to the Zone Leader with a default target date.

**Tip:** Score 0 ("N/A") only when the criterion is genuinely inapplicable to your zone (e.g., no Red Tag items have ever been raised in a pristine new zone). Do not use 0 as a convenience substitute for a Poor rating — it still raises an NC.

---

## 8. The 5S Weekly Criteria (Detailed Table by Pillar)

There are 20 criteria in total, 4 per pillar. Each has a maximum score of 4. The total maximum score is **80**.

### S1 — Sort (Seiri) | Max: 16 pts

| Criterion ID | Label | What to Look For |
|---|---|---|
| S1-C1 | Unnecessary items removed (Red Tag system used) | Are all items in the zone necessary for current work? Is the Red Tag process actively being used to identify and remove surplus items? |
| S1-C2 | Red Tag register updated | Is the Red Tag register current, with disposition recorded for all tagged items? |
| S1-C3 | Before/after photos for removed items | Are photographic records maintained showing the area before and after Red Tag removal actions? |
| S1-C4 | Floor gangways clear and marked | Are walkways, gangways, and emergency evacuation routes visibly marked on the floor and completely unobstructed? |

### S2 — Set in Order (Seiton) | Max: 16 pts

| Criterion ID | Label | What to Look For |
|---|---|---|
| S2-C1 | Designated places for all items (shadow boards/labels) | Does every tool, material, and piece of equipment have a clearly defined, labelled home position? Are shadow boards or outlines in use? |
| S2-C2 | Storage areas labelled and colour-coded | Are racks, shelves, bins, and floor zones marked with labels and follow the zone colour-coding standard? |
| S2-C3 | FIFO system maintained for materials | Are materials consumed in First-In-First-Out order? Is stock rotation enforced and visible? |
| S2-C4 | Tools returned to designated locations after use | Are tools actually being returned to their marked locations between tasks, not left on benches or machines? |

### S3 — Shine (Seiso) | Max: 16 pts

| Criterion ID | Label | What to Look For |
|---|---|---|
| S3-C1 | Work area clean and free of debris | Are all work surfaces, floors, and machine areas free of dust, swarf, packaging waste, and liquid spills? |
| S3-C2 | Cleaning schedule displayed and followed | Is a posted cleaning schedule visible, signed off, and up to date? Are cleaning responsibilities clearly assigned? |
| S3-C3 | Equipment clean and well-maintained | Are machines, conveyors, and work tools clean? Is cleaning integrated into the maintenance routine? |
| S3-C4 | Waste bins available, labelled, and not overflowing | Are enough waste receptacles available, properly labelled by waste type, and emptied before overflowing? |

### S4 — Standardize (Seiketsu) | Max: 16 pts

| Criterion ID | Label | What to Look For |
|---|---|---|
| S4-C1 | SOPs displayed at workstations | Are the relevant Standard Operating Procedures posted at each workstation in a readable, undamaged condition? |
| S4-C2 | Visual management boards updated | Are KPI boards, production boards, and 5S notice boards current (updated within the past 24 hours)? |
| S4-C3 | Standard operating conditions maintained | Are equipment settings, stock levels, and process parameters within defined standard ranges? |
| S4-C4 | Safety signage visible and correct | Are all mandatory safety signs (PPE, hazard, emergency, first aid) present, legible, and correctly positioned? |

### S5 — Sustain (Shitsuke) | Max: 16 pts

| Criterion ID | Label | What to Look For |
|---|---|---|
| S5-C1 | 5S training records up to date | Are training completion records for all zone team members current? Have new starters received 5S induction? |
| S5-C2 | Daily checksheets completed on time | Have the daily 5S checksheets been submitted every working day this week without gaps? |
| S5-C3 | Improvement suggestions submitted this month | Has at least one Kaizen/improvement suggestion been raised by someone in this zone in the current calendar month? |
| S5-C4 | Previous audit NCs closed within target | Have all NCs raised in the previous weekly audit been closed or have approved extensions? |

---

## 9. After Submission

When you tap Submit Audit, the following sequence occurs on the server:

1. **Auth re-check** — the server verifies your email against the MC whitelist a second time at the point of submission (defence against session hijacking).

2. **Row written to WeeklyAudit sheet** — a single row is appended containing: submission ID, timestamp, zone ID, zone name, auditor email, audit date, all 20 individual criterion scores, total score, max score, percentage score, NC count, NC details (JSON), and photo URLs.

3. **CAPA tasks auto-created** — for every criterion scored 0 or 1, the CAPAEngine creates a corrective action record assigned to the Zone Leader with a system-defined target date. These appear immediately in the zone's Action List.

4. **Success screen displayed** — the form is replaced with the success screen showing the final score, NC count, zone name, and date. The score colour reflects performance: green (≥80%), amber (60–79%), red (<60%).

5. **Email notifications** (triggered via the EmailEngine on a time-based trigger, not immediately) — the Zone Leader and, where configured, the Management Coordinator receive an audit summary email.

---

## 10. Score Benchmarks

The percentage score determines the overall rating for the zone that week.

| Score Range | % Range | Rating | Colour | Recommended Action |
|---|---|---|---|---|
| 72 – 80 | 90% – 100% | Excellent | Dark Green | Maintain standards; share best practices with peer zones |
| 64 – 71 | 80% – 89% | Good | Green | Review any individual NCs; brief Zone Leader on gaps |
| 48 – 63 | 60% – 79% | Fair | Amber | Raise CAPAs for all NCs; schedule a follow-up check within the week |
| 32 – 47 | 40% – 59% | Poor | Red | Escalate to Plant Manager; convene a 5S corrective action meeting within 48 hours |
| 0 – 31 | 0% – 39% | Critical | Dark Red | Immediate escalation to Top Management; zone placed on 5S watch list; daily checks mandatory |

**Note:** These benchmarks are the system defaults. The zone's individual target score can be overridden per-zone by the administrator in the Zones sheet column J (targetScore), which is then stored in ScriptProperties and used by the AlertEngine for threshold-based alerts.

---

## 11. Important Notes

**One submission per zone per week:** The backend checks for duplicates using zone ID and date. If a Weekly Audit is submitted a second time for the same zone on the same day, the server still records it but the previous submission is not overwritten — both rows exist. The duplicate flag logic for weekly audits is not implemented in the same way as daily checksheets (the `checkDuplicate_` function does not set a duplicate flag for weekly rows); the latest submission simply co-exists. **Always confirm with your team before submitting to avoid double-counting.**

**No offline mode:** The offline banner is displayed if the device loses connectivity. Weekly audits cannot be completed offline — the auth check, photo upload, and form submission all require a live internet connection. If you lose connection mid-audit, your in-progress scores are held in browser memory; do not close or refresh the tab.

**Score 0 = NC, not "not scored":** Pressing the 0 button is a deliberate scoring action meaning "N/A / completely absent" — it still counts as scoring that criterion and will raise an NC. The Submit button becomes active only when all 20 criteria have been explicitly scored (including any 0s).

**Language toggle:** The EN/Hindi toggle in the top-right header applies to all criterion labels and UI text immediately without a page reload. Your language preference is saved to localStorage and will be remembered on your next visit.

**Photo uploads are independent of submission:** Photos are uploaded to Google Drive as soon as you select them (before you tap Submit). If a photo upload fails, the error is shown inline under the upload area. The audit can still be submitted without photos — the photo_urls field will simply be empty in the sheet.

**Back button navigates away:** The "← Back" link in the header and the "← Back to Zone" link on the success screen both navigate away from the form. Any unsaved in-progress scores will be lost if you leave before submitting.

---

## 12. Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| **"Access Denied — Unable to verify your identity"** | You are not signed into any Google account in the browser | Sign into Google at accounts.google.com, then refresh the page |
| **"Access Denied — Your email (x@y.com) is not in the authorized auditor list"** | Your Google account is authenticated but not on the MC whitelist | Contact the system administrator to have your email added to `MC_WHITELIST` in ScriptProperties |
| **"Auth check failed: [error message]"** | A transient error in the `checkAuditorAuth` GAS call | Wait 30 seconds and refresh the page; if it persists, report to the system administrator with the error text |
| **Spinner spins indefinitely on auth check** | Slow network or GAS cold-start delay (first execution of the day takes longer) | Wait up to 30 seconds; if no response, refresh the page |
| **Submit button remains greyed out** | Not all 20 criteria have been scored | Scroll through all five pillar sections and confirm every criterion has a highlighted (coloured) score button |
| **Photo upload shows "upload failed"** | No Drive folder configured for the zone (`driveFolderId` empty), or network error | Photos are optional — you can still submit the audit; report the Drive folder issue to the administrator |
| **NC notice appears but I scored 2** | NC threshold is 1 by default — only scores of 0 or 1 trigger NCs | This is expected behaviour; score 2 does not raise an NC |
| **Submission spinner runs for more than 30 seconds** | GAS execution timeout or Sheets API slowness | Do not close the tab; wait up to 60 seconds. If submission fails, a toast message appears — tap the re-enabled Submit button to try again |
| **"Submission failed: [error]" toast appears** | Server-side error (sheet not found, quota exceeded, auth failure on POST) | Note the exact error message; check internet connection; try once more; if repeated, contact the administrator |
| **Success screen shows wrong score** | Very rare: response parse failure caused the client to fall back to a locally-calculated score | The sheet row is correct (server-calculated); the success screen may show a client-calculated fallback — check the WeeklyAudit sheet directly to confirm |
| **Offline banner appears mid-audit** | Device lost internet connectivity | Reconnect to the network before submitting; in-progress scores are held in memory as long as the tab stays open |

---

*PackMasters 5S — Internal System Documentation | Management Coordinator Use Only*
*For system administration queries contact the designated GAS Administrator.*
