# PackMasters 5S — Kaizen Board & Submission User Guide

**Version:** v5.3.2 | **Date:** Feb 2026
**App:** PackMasters 5S Web App (Google Apps Script)
**Feature URLs:**
- Board: `?v2=1&action=kaizenboard`
- Submission Form: `?v2=1&action=kaizen&zone=<ZONE_ID>`

---

## 1. What is Kaizen?

Kaizen (改善) is a Japanese philosophy meaning **"continuous improvement."** In the PackMasters 5S system, a Kaizen is any suggestion, idea, or initiative raised by any team member to improve workplace safety, quality, productivity, cost, or 5S standards.

Every Kaizen submission is tracked from the moment it is raised through to implementation and financial benefit verification. The goal is to create a culture where every worker — from operators to supervisors — actively contributes to making the plant better.

---

## 2. Who Should Use It?

| Role | What They Do |
|---|---|
| **Any Team Member / Operator** | Submits improvement ideas via the Kaizen Suggestion Form |
| **Supervisor / Team Leader** | Reviews submitted ideas, moves them to Approved or rejects them |
| **Engineer / Improvement Lead** | Manages implementation, updates status as work progresses |
| **Plant Manager / MRM Team** | Reviews the board for overall pipeline health and ROI tracking |
| **QA / Finance** | Verifies completed Kaizens and confirms actual financial benefit |

---

## 3. The Kaizen Board (Dashboard)

### 3.1 How to Access the Board

1. Open the PackMasters 5S web app in your browser.
2. From the bottom navigation bar, tap **More** (the hamburger icon at the bottom-right).
3. In the "All Tools" sheet that slides up, tap **Kaizen Board**.
4. Alternatively, navigate directly to:
   `[App URL]?v2=1&action=kaizenboard`

The board loads automatically and **refreshes every 5 minutes** (300 seconds) without any manual action required.

### 3.2 Reading the Board (Cards, Status Columns, Metrics)

The Kaizen Board is a **horizontal Kanban-style pipeline** with six status columns, each colour-coded for instant recognition:

| Column | Colour | Meaning |
|---|---|---|
| **Submitted** | Grey (`#95a5a6`) | New idea just logged; awaiting review |
| **Under Review** | Purple (`#8e44ad`) | Being evaluated by a supervisor or engineer |
| **Approved** | Blue (`#2980b9`) | Approved for implementation; resources being assigned |
| **Implementing** | Amber/Orange (`#f39c12`) | Active work in progress on the shop floor |
| **Completed** | Green (`#27ae60`) | Implementation done; benefit not yet financially verified |
| **Verified** | Dark Navy (`#1a5276`) | Benefit confirmed by QA/Finance; fully closed out |

Each column header displays the **column name and current count** of ideas in that stage, e.g. `Submitted (2)`.

**Each Kaizen card shows:**
- **Title** — Bold, e.g. "Automatic dock leveler for trucks"
- **Kaizen ID** — Auto-generated reference, e.g. `KZ-20260205-003`
- **Category** — e.g. Safety, Cost, Quality, 5S, Productivity
- **Zone / Area** — e.g. Raw Material Store, Production Floor A
- **Submitter Name** — e.g. "By: Mr. Suresh Yadav"
- **Estimated Savings** — e.g. `₹200000/mo` (shown when provided)
- **Action Button** — "Move → [Next Stage]" to advance the card

**Live data observed during testing (Feb 2026):**

| Kaizen ID | Title | Category | Zone | Submitter | Est. Savings | Status |
|---|---|---|---|---|---|---|
| KZ-20260205-003 | Automatic dock leveler for trucks | Safety | Raw Material Store | Mr. Suresh Yadav | — | Submitted |
| KZ-20260214-006 | Predictive maintenance for CNC machines | Cost | Maintenance Workshop | Mr. Deepak Joshi | ₹200,000/mo | Submitted |
| KZ-20211-005 | Digital calibration tracking | Quality | Quality Lab | Mr. Amit Sharma | ₹15,000/mo | Approved |
| KZ-20260130-001 | Poka-yoke jig for assembly line | Quality | Production Floor A | Mr. Anuj Pathak | ₹50,000/mo | Implementing |
| KZ-20260202-002 | LED lighting retrofit in Floor B | Cost | Production Floor B | Mr. Rajesh Kumar | ₹120,000/mo | Completed |
| KZ-20260217-007 | 5S zone scoreboard in cafeteria | Morale | Office & Admin Area | Mr. Sanjay Gupta | — | Completed |

### 3.3 Filters and Views

In the current version (v5.3.2), the board presents a **single unified view of all Kaizens** plant-wide across all zones. The columns are always displayed left to right in lifecycle order.

**Interaction available:**
- **Move → [Next Stage] button** on each card: Advances the Kaizen to the next status column. The board automatically reloads after the status update completes.
- The board scrolls **horizontally** on narrow screens so all six columns remain accessible.
- The bottom navigation bar (Home, Board, Actions, Handover, More) is always visible for quick navigation to other tools.

**Note:** There are no filter controls (by zone, category, or submitter) in the current board view. Filtering and sorting are planned enhancements.

---

## 4. Submitting a Kaizen Idea

### 4.1 How to Access the Form

**Option A — Via QR Code:** Each zone has a dedicated QR code printed and posted at the workstation. Scan it with any smartphone to open the form pre-loaded for that zone.

**Option B — Direct URL:** Navigate to:
`[App URL]?v2=1&action=kaizen&zone=<ZONE_ID>`
Replace `<ZONE_ID>` with your zone code, e.g. `Z-03`.

**Option C — Via the App:** From within any PackMasters 5S page, tap **More** in the bottom nav, then find the Kaizen submission link for your zone.

### 4.2 Step-by-Step Submission

1. **Open the form.** The orange "Kaizen Suggestion Box" header confirms you are on the right page.
2. **Enter your name** in the "Your Name" field. This is how your contribution is recorded.
3. **Select your Zone** from the dropdown. If you arrived via a QR code for a specific zone, check whether the zone was pre-selected (see Known Issues, Section 7).
4. **Select a Category** — choose the one that best describes your idea:
   - 5S, Safety, Quality, Productivity, Cost Saving, Environment, Other
5. **Enter a Suggestion Title** — a short, clear title (e.g. "Replace faded tool storage labels").
6. **Write a Description** — describe the current problem and your proposed improvement in detail. More context helps the review team act faster.
7. **State the Expected Benefit** — what will improve? (e.g. "Faster tool retrieval, reduced search time, fewer errors.")
8. **Enter Estimated Savings (₹/month)** — if your idea saves money, enter the estimated monthly saving as a number. Leave at 0 if not applicable.
9. **Tap "Submit Suggestion"** — the button is orange and full-width at the bottom of the form.
10. **Wait for confirmation.** The status line below the button will display:
    - Success: "Kaizen submitted! ID: KZ-YYYYMMDD-NNN" (shown in green)
    - Error: An error message in red — try again or contact your supervisor.

### 4.3 Form Fields Reference

| Field | Type | Required | Notes |
|---|---|---|---|
| Your Name | Text input | Yes | Full name of the person submitting |
| Zone | Dropdown (select) | Yes | Must be selected; may not auto-fill from URL (see Bugs) |
| Category | Dropdown (select) | Yes | Default is "5S". Options: 5S, Safety, Quality, Productivity, Cost Saving, Environment, Other |
| Suggestion Title | Text input | Yes | Brief, descriptive title |
| Description | Textarea (4 rows) | Yes | Detailed explanation of the problem and proposed solution |
| Expected Benefit | Textarea (2 rows) | Recommended | What outcome/improvement will result |
| Estimated Savings (₹/month) | Number input | No | Monthly monetary saving; enter 0 if not known |

### 4.4 After Submission

- You will see your **Kaizen ID** (e.g. `KZ-20260224-008`) displayed in the green success message. **Note this ID** for follow-up.
- The Submit button re-enables after the response so you can submit additional ideas.
- Your idea immediately appears in the **Submitted** column on the Kaizen Board.
- A supervisor or engineer will move it to **Under Review** when they begin evaluation.
- You may be contacted for more details by your team leader.

---

## 5. Kaizen Status Lifecycle

Every Kaizen moves through the following stages. Only authorised users (supervisors, engineers, managers) can advance cards on the board.

```
SUBMITTED → UNDER_REVIEW → APPROVED → IMPLEMENTING → COMPLETED → BENEFIT_VERIFIED
```

| Stage | Who Acts | What Happens |
|---|---|---|
| **Submitted** | (Auto) | Idea recorded in the system. Visible on the board immediately. |
| **Under Review** | Supervisor / Engineer | Idea is being evaluated for feasibility, cost, and priority. Submitter may be consulted. |
| **Approved** | Engineering Lead / Manager | Idea approved for implementation. Resources and timeline assigned. |
| **Implementing** | Implementation Team | Physical work is in progress on the shop floor or in the system. |
| **Completed** | Implementation Team | Work is done. Benefit has not yet been formally measured and verified. |
| **Benefit Verified** | QA / Finance / Plant Manager | Actual benefit measured and confirmed against the estimate. Kaizen fully closed. |

**To advance a card:** On the Kaizen Board, tap the **"Move → [Next Stage]"** button on the card. The board reloads automatically to confirm the change.

**Note:** There is currently no "Reject" or "On Hold" status in the pipeline. Ideas that are not pursued should be communicated verbally to the submitter; the system does not yet support a rejection workflow.

---

## 6. ROI Tracking (How Savings Are Calculated and Verified)

### Estimated vs. Verified Savings

- **Estimated Savings** are entered by the submitter at the time of suggestion. These are rough figures based on the submitter's assessment and are displayed on each card in the format `₹X/mo`.
- **Verified Savings** are confirmed only when a Kaizen reaches the **Benefit Verified** stage. At that point, Finance or QA measures the actual impact.

### How Savings Are Displayed

On the Kaizen Board, each card shows the submitter's estimated savings (e.g. `₹200000/mo`) next to the submitter's name. Cards without a savings estimate show only the submitter name.

### ROI Calculation Guidance

Teams should measure benefit using a consistent before/after method:

1. **Baseline measurement** — Record current state metrics before implementation (time per task, defect rate, energy consumption, etc.).
2. **Post-implementation measurement** — Measure the same metrics at least 4 weeks after implementation is complete.
3. **Calculate monthly saving** — Convert the improvement to a Rupee value per month.
4. **Document evidence** — Attach data, photos, or reports to support the verified figure.
5. **Move to Benefit Verified** — Once Finance/QA signs off, the card moves to the final column.

### Plant-Wide ROI Summary

The Kaizen Board currently displays individual card savings. A plant-wide aggregated ROI dashboard (total pipeline value, verified savings to date) is available in the **MRM Report Pack** (`?v2=1&action=mrmpack`) and the **Tier Dashboard** (`?v2=1&action=tierdash`).

---

## 7. Important Notes

- **Saving ideas:** The form does not auto-save. If you navigate away before submitting, your data will be lost. Complete and submit the form in one session.
- **One idea per submission:** Each form submission creates one Kaizen record. Submit multiple forms for multiple ideas.
- **No login required:** The form is intentionally open so any worker can submit without needing a Google account. However, this means names are self-reported — enter your real name.
- **Language:** The form and board are currently English-only. The broader PackMasters 5S app supports an EN/Hindi toggle on other pages, but this is not yet implemented on the Kaizen pages.
- **Mobile use:** The form is fully mobile-responsive. On a smartphone, all fields stack vertically and the submit button is large (56px height) for easy tapping.
- **Auto-refresh:** The Kaizen Board auto-refreshes every 5 minutes. You do not need to manually reload the page to see updates.
- **Board is read-write:** Any user who can access the board URL can move cards forward. Access control relies on network/URL restrictions, not in-app authentication.
- **Currency:** All savings figures are in Indian Rupees (₹).

---

## 8. Troubleshooting

| Symptom | Likely Cause | What To Do |
|---|---|---|
| Zone dropdown shows "Select zone..." despite zone=Z-03 in the URL | **Known Bug:** The zone config injection (`<?= config.zoneConfig ?>`) is not passing zone data to the form's JavaScript. The URL `zone=` parameter is not being read to pre-select the dropdown. | Manually select your zone from the dropdown. Report to the system administrator to fix the `config.zoneConfig` server-side template variable. |
| Zone dropdown only shows "Select zone..." and "Plant-wide" — no individual zones | **Known Bug:** Same root cause as above. The `zoneConfig` object from the server is empty or not being injected correctly, so no zone options are dynamically added. | Select "Plant-wide" as a workaround, or ask your administrator to fix the zone config injection. |
| Board shows "Loading..." and never updates | Network timeout or GAS execution error | Wait 10–15 seconds. If still loading, refresh the page. Check internet connection. If the problem persists, an error message will appear — report it to your system administrator. |
| "Error: [message]" appears below the submit button | Server-side validation failure or GAS script error | Note the exact error message and report to the administrator. Common causes: missing required fields, server quota exceeded, or sheet permission error. |
| Submit button stays disabled after clicking | Previous submission still processing | Wait up to 30 seconds. The button re-enables on both success and failure responses. If it stays disabled, refresh the page. |
| Kaizen ID not received after submission | Success message not displayed, or closed too fast | Check the Kaizen Board — your entry should appear in the "Submitted" column. If not, resubmit. |
| Board cards disappear or column count shows 0 unexpectedly | Data sync issue or GAS sheet error | Reload the page. If cards are missing persistently, contact the administrator to check the KaizenSuggestions sheet. |
| Cannot advance a card (Move button does nothing) | Network error or GAS call failure | Check the browser console for errors. Ensure you have a stable internet connection. Try refreshing the board and clicking again. |
| Form fields do not respond to tapping on some mobile browsers | GAS sandbox iframe interaction issue | This is a known GAS sandbox limitation. Try using a different browser (Chrome recommended) or access the form via its direct QR code URL. |

---

*This guide covers the PackMasters 5S Kaizen Board and Submission Form as tested in February 2026. For other modules (Quick Audit, SQCDP, Red Tag, Gemba Walk, etc.), refer to the relevant module user guides.*

*Maintained by the PackMasters 5S System Administrator.*
