# PackMasters 5S — Daily Checksheet User Guide

**Version:** 1.0
**Date:** 24 February 2026
**Tested On:** Zone Z-04 (Finished Goods Store), Zone Z-01 (Production Floor A)
**Target Audience:** Factory floor supervisors, team leaders, and workers with basic smartphone or tablet skills

---

## Table of Contents

1. [What is the Daily Checksheet?](#1-what-is-the-daily-checksheet)
2. [How to Access It](#2-how-to-access-it)
3. [Layout Overview](#3-layout-overview)
4. [How to Complete a Daily Checksheet (Step-by-Step)](#4-how-to-complete-a-daily-checksheet-step-by-step)
5. [Understanding the Checklist Items and Criteria](#5-understanding-the-checklist-items-and-criteria)
6. [Submitting and What Happens After](#6-submitting-and-what-happens-after)
7. [Viewing History and Past Submissions](#7-viewing-history-and-past-submissions)
8. [Troubleshooting Common Issues](#8-troubleshooting-common-issues)
9. [Known Bugs and Limitations](#9-known-bugs-and-limitations)

---

## 1. What is the Daily Checksheet?

The **Daily Checksheet** is a digital form used to evaluate the 5S condition of a specific zone on the factory floor. It is completed once per shift or once per day by the zone supervisor or team leader.

**Purpose:**
- Verify that all 5S standards are maintained in the zone
- Generate a daily score (0–100%) for each zone
- Create an audit trail of daily 5S compliance
- Identify and record items that are failing so corrective action can be taken

**The 5S Pillars assessed:**
- **Sort (Seiri / छंटाई)** — Remove unnecessary items
- **Set in Order (Seiton / व्यवस्था)** — A place for everything, everything in its place
- **Shine (Seiso / सफाई)** — Keep the area clean
- **Standardize (Seiketsu / मानकीकरण)** — Maintain standards and SOPs
- **Sustain (Shitsuke / अनुशासन)** — Follow and improve the system

**Who should fill it in:**
- Zone supervisors
- Team leaders
- Designated 5S representatives for each zone

---

## 2. How to Access It

The Daily Checksheet is a web application. It runs in any modern browser (Chrome, Firefox, Edge, Safari) on a phone, tablet, or computer.

**Step 1 — Get the URL for your zone.**
Each zone has its own link. The URL pattern is:

```
https://script.google.com/macros/s/AKfycbw6GfjKqYmhprkF7tUJVofcAgGrK1ujjIhgtk7ETO2CG7BdtyxQkFlkR_Yym0uvCEJ8/exec?zone=ZONE-ID&type=daily
```

Replace `ZONE-ID` with your zone code (e.g., `Z-01`, `Z-04`).

**Example zone links:**
- Zone Z-01 (Production Floor A): `...exec?zone=Z-01&type=daily`
- Zone Z-04 (Finished Goods Store): `...exec?zone=Z-04&type=daily`

**Tip:** Ask your supervisor or 5S coordinator for the direct bookmark or QR code for your zone. Scan the QR code posted at the zone entrance to open the checksheet immediately.

**Step 2 — Open the link in a browser.**
No login is required. The form opens directly.

**Step 3 — If prompted by Google Apps Script,** dismiss the "This application was created by a Google Apps Script user" banner by clicking the X button in the top-right corner of that banner.

---

## 3. Layout Overview

The Daily Checksheet has the following sections from top to bottom:

### Header (Fixed at top)
- **Title:** "Daily Checksheet"
- **Zone:** Zone code and name (e.g., "Z-04 — Finished Goods Store")
- **Date:** Today's date in short format (e.g., "Tue, 24 Feb, 2026")
- **Language Toggle:** EN / हिं buttons in the top-right corner to switch between English and Hindi

### Progress Counter Card
- Shows how many criteria have been answered out of the total
- Example: "0 / 20" at the start, updating to "20 / 20" when all are answered
- Label: "Criteria Completed"

### Pillar Sections (Accordion)
- Five collapsible sections, one for each 5S pillar
- Each pillar header shows the pillar name and a badge like "0/4" showing how many criteria in that pillar have been answered
- Tap the pillar header to expand or collapse it
- The first pillar (Sort/Seiri) is open by default; others start collapsed
- Only one pillar can be open at a time

### Criteria Rows (inside each pillar)
- Each row shows the criterion ID and description (e.g., "S1-C1: Unnecessary items removed (Red Tag system used)")
- Two buttons per row: **PASS** (left) and **FAIL** (right)
- Unselected buttons appear in plain outline style
- Selected PASS button turns green with a green border
- Selected FAIL button turns red with a red border

### Remarks Section
- An optional text box for any notes or observations
- Maximum 500 characters
- Example use: note which item failed and why, or mention a corrective action already taken

### Photo Section
- Optional camera button to take and upload a photo of the zone
- On a phone or tablet, this opens the camera directly
- On a desktop computer, this opens a file chooser to select an image
- The photo is uploaded to Google Drive automatically after capture

### Submit Button
- Large green button: "Submit Checksheet" / "चेकशीट सबमिट करें"
- **Disabled (grey)** until all 20 criteria are answered with either PASS or FAIL
- **Enabled (bright green)** when all criteria are answered

### Score Bar (Fixed at bottom)
- A horizontal progress bar running across the bottom of the screen
- Shows the current **Pass count** on the left (e.g., "Pass: 15")
- Shows the current **percentage** on the right (e.g., "75%")
- Color changes:
  - **Red** — below 60%
  - **Amber/Orange** — 60% to 79%
  - **Green** — 80% and above

---

## 4. How to Complete a Daily Checksheet (Step-by-Step)

### Step 1 — Open the form for your zone
Navigate to the Daily Checksheet URL for your zone. The form loads automatically with today's date. No login is needed.

### Step 2 — Dismiss the Google banner (if it appears)
Click the X button on the blue Google Apps Script banner at the top. The form is now fully visible.

### Step 3 — Review the progress counter
At the top of the form you will see "Criteria Completed: 0 / 20". You need to answer all 20 criteria before you can submit.

### Step 4 — Work through each pillar section

**The first section (Sort/Seiri) is already open.** Work through it from top to bottom.

For each criterion:
1. Read the criterion description
2. Walk to that area or observe it
3. Tap **PASS** if the standard is met, or **FAIL** if it is not
4. The button highlights immediately and the counter updates

**To move to the next pillar:**
- Tap the next pillar header (e.g., "Set in Order (Seiton)")
- It expands and shows its 4 criteria
- The previous pillar automatically collapses

**Work through all five pillars in order:**
1. Sort (Seiri) — 4 criteria
2. Set in Order (Seiton) — 4 criteria
3. Shine (Seiso) — 4 criteria
4. Standardize (Seiketsu) — 4 criteria
5. Sustain (Shitsuke) — 4 criteria

**Tip:** Each pillar badge shows your progress (e.g., "3/4" means 3 of 4 criteria in that pillar are answered). A badge showing "4/4" means the pillar is fully complete.

**Can you change an answer?**
Yes. If you tapped PASS but meant FAIL (or vice versa), simply tap the correct button. The previous selection is cleared and the new one is saved. The progress counters update instantly.

### Step 5 — Check the score bar
At the bottom of the screen, watch the score bar update as you answer criteria. The bar color tells you the current pass rate:
- Red = below 60% of answered criteria are passing
- Amber = 60–79%
- Green = 80% or above

### Step 6 — Add remarks (optional)
Scroll down past the pillar sections to the **Remarks** box. Type any notes here — for example, which item failed and what action is being taken. This is optional but recommended whenever any criteria are marked FAIL.

### Step 7 — Add a photo (optional)
Tap the camera area under "Photo (Optional)" to take a photo of the zone. On a phone, this opens the camera. After taking the photo, it uploads automatically to Google Drive. Wait for "Photo uploaded" to confirm.

**Note:** Photo upload requires an internet connection. If you are offline, skip the photo and take it later.

### Step 8 — Submit the checksheet
Once all 20 criteria are answered, the **Submit Checksheet** button turns bright green.

Scroll down to the button and tap it.

A loading spinner appears with the message "Submitting..." — wait a few seconds.

### Step 9 — Confirm submission
After a successful submission, the form disappears and a confirmation screen shows:
- "Submitted!" in green text
- A "← Back to Zone" button (or "← ज़ोन पर वापस" in Hindi)

Tap "Back to Zone" to return to the zone landing page.

---

## 5. Understanding the Checklist Items and Criteria

Each zone has 20 criteria split across the 5 pillars. The criteria for Z-04 (Finished Goods Store) and Z-01 (Production Floor A) observed during testing are:

### Sort — Seiri (छंटाई)
| ID | Criterion | What to Check |
|----|-----------|---------------|
| S1-C1 | Unnecessary items removed (Red Tag system used) | Are there any items in the zone that do not belong? Have Red Tags been applied to suspect items? |
| S1-C2 | Red Tag register updated | Is the Red Tag register current? Are all tagged items logged with dates? |
| S1-C3 | Before/after photos for removed items | Are photos being taken when items are removed from the zone? |
| S1-C4 | Floor gangways clear and marked | Are walkways and gangways free of obstructions and clearly marked on the floor? |

### Set in Order — Seiton (व्यवस्था)
| ID | Criterion | What to Check |
|----|-----------|---------------|
| S2-C1 | Designated places for all items (shadow boards/labels) | Does every tool, part, and material have a labelled home location? Are shadow boards in use? |
| S2-C2 | Storage areas labelled and colour-coded | Are storage racks, bins, and shelves clearly labelled and colour-coded? |
| S2-C3 | FIFO system maintained for materials | Are materials being used in the correct first-in, first-out order? |
| S2-C4 | Tools returned to designated locations after use | Are tools being put back in their correct locations after each use? |

### Shine — Seiso (सफाई)
| ID | Criterion | What to Check |
|----|-----------|---------------|
| S3-C1 | Work area clean and free of debris | Is the floor, bench, and workspace free of dust, dirt, and debris? |
| S3-C2 | Cleaning schedule displayed and followed | Is a cleaning schedule posted? Is it being signed off as tasks are completed? |
| S3-C3 | Equipment clean and well-maintained | Are machines, tools, and equipment clean and in good working order? |
| S3-C4 | Waste bins available, labelled, and not overflowing | Are bins present, correctly labelled for waste type, and not overflowing? |

### Standardize — Seiketsu (मानकीकरण)
| ID | Criterion | What to Check |
|----|-----------|---------------|
| S4-C1 | SOPs displayed at workstations | Are Standard Operating Procedures posted at the relevant workstations and up to date? |
| S4-C2 | Visual management boards updated | Are production boards, KPI boards, and visual displays current with today's data? |
| S4-C3 | Standard operating conditions maintained | Are all parameters (temperatures, speeds, quantities) within their standard ranges? |
| S4-C4 | Safety signage visible and correct | Are safety signs, PPE requirements, and hazard markings visible and not damaged? |

### Sustain — Shitsuke (अनुशासन)
| ID | Criterion | What to Check |
|----|-----------|---------------|
| S5-C1 | 5S training records up to date | Has the team completed 5S training? Are records current? |
| S5-C2 | Daily checksheets completed on time | Have yesterday's and recent checksheets been submitted on time? |
| S5-C3 | Improvement suggestions submitted this month | Has at least one improvement suggestion been submitted this month? |
| S5-C4 | Previous audit NCs closed within target | Are all non-conformances from the last audit closed or on track within the target date? |

**Scoring:**
- Each PASS = 1 point
- Each FAIL = 0 points
- Final score = (Total PASS / 20) × 100%
- Target: 80% or above (green zone)

---

## 6. Submitting and What Happens After

### Before you can submit
- All 20 criteria must be answered (PASS or FAIL)
- The submit button remains grey and disabled until this is met
- The progress counter must show "20 / 20"

### The submission process
1. Tap "Submit Checksheet"
2. A loading overlay appears ("Submitting...")
3. The data is sent to the Google Sheets database via Google Apps Script
4. The process typically takes 3–8 seconds on a normal connection

### What is saved
The following data is recorded in the system spreadsheet:
- Submission ID (unique identifier)
- Zone ID and Zone name
- Date and time of submission
- PASS/FAIL answer for each of the 20 criteria
- Overall score (percentage)
- Remarks text (if entered)
- Photo URL (if a photo was taken)
- Submission type: "daily"

### After submission
- A confirmation screen shows "Submitted!" in green
- A "Back to Zone" button returns you to the zone landing page
- The data is now visible in the zone's history and in the management dashboard

### If you submit more than once in a day
The system allows multiple submissions per day. If a second submission is made on the same day for the same zone, it is recorded with a **duplicate flag**. Both submissions are kept in the database. The first submission of the day is the primary record for reporting purposes.

### Offline submissions
If you have no internet connection when you tap Submit:
- The submission is saved locally on your device (in browser storage)
- A message appears: "Saved offline. Will submit when online."
- When your device reconnects to the internet, the data is sent automatically
- You do not need to do anything — it happens in the background

**Important:** Do not clear your browser history or data while offline submissions are pending, as this will delete the queued data.

---

## 7. Viewing History and Past Submissions

The Daily Checksheet form itself does not have a built-in history view. To see past submissions:

1. Return to the Zone Landing Page by tapping "← Back" or the "Back to Zone" button after submission
2. From the Zone Landing Page, look for a "History" or "View Submissions" option
3. Alternatively, the 5S coordinator or manager can access the full submission history via the management dashboard

**For managers and coordinators:**
Historical data is stored in the PackMasters 5S Google Sheets spreadsheet. Zone scores over time can be viewed in the Zone Dashboard, which shows trends by week and month.

---

## 8. Troubleshooting Common Issues

### The form does not load
- Check your internet connection
- Try refreshing the page (pull down to refresh on mobile)
- Make sure you are using a supported browser (Chrome is recommended)
- Try opening the URL in a private/incognito browser window

### The Submit button is still grey after answering all criteria
- Scroll through all five pillar sections to check if any criterion was missed
- Look at the pillar badges — any badge showing less than "4/4" means that pillar has unanswered criteria
- Expand that pillar and find the unanswered row (it will have no PASS or FAIL highlighted)

### I accidentally selected the wrong answer
- Simply tap the correct button (PASS or FAIL) — it replaces the previous selection immediately
- There is no penalty for changing an answer before submitting

### The photo upload failed
- Check your internet connection
- Try taking the photo again
- If it fails again, submit without a photo and take the photo separately

### The form is showing in Hindi but I want English (or vice versa)
- Tap the **EN** button in the top-right corner of the header to switch to English
- Tap the **हिं** button to switch to Hindi
- The language choice is saved on your device and will be remembered next time

### "Saved offline. Will submit when online" message
- This is normal behavior when there is no internet connection
- Do not close the browser tab until you are back online and the submission has been sent
- The automatic retry happens as soon as the device reconnects

### The page is showing a Google banner at the top
- Click the X on the right side of the blue Google Apps Script banner to dismiss it
- The banner appears for security purposes and is safe to dismiss

### Submission seems stuck at "Submitting..."
- Wait up to 30 seconds — server responses can be slow
- If it stays stuck, check your internet connection
- If the connection is good and it still times out, the system will queue the submission offline for retry

---

## 9. Known Bugs and Limitations

The following issues were identified during QA testing on 24 February 2026.

---

### BUG-001: Back Link Invisible in Header

**Severity:** MEDIUM

**Description:** The "← Back" link in the header is invisible. It is rendered in white text on a white background. The link exists in the page code but cannot be seen or clicked.

**Steps to Reproduce:**
1. Open any Daily Checksheet URL
2. Look at the top-left area of the header — no back link is visible

**Impact:** Users cannot navigate back to the Zone Landing Page from the header. They must use the browser's back button or, after submission, use the "Back to Zone" button on the success screen.

**Workaround:** Use the browser's back button (or swipe right on mobile) to return to the previous page. After submission, use the "← Back to Zone" button displayed on the confirmation screen.

---

### BUG-002: Success Screen Missing Score and Details

**Severity:** HIGH

**Description:** After a successful submission, the confirmation screen shows only "Submitted!" and the "Back to Zone" button. The score display (e.g., "19 / 20 (95%)"), the zone/date detail line, and the success icon are all missing.

**Steps to Reproduce:**
1. Open the Daily Checksheet for any zone
2. Answer all 20 criteria
3. Tap "Submit Checksheet"
4. Wait for submission to complete
5. Observe the confirmation screen — score and zone details are absent

**Impact:** Users cannot see their score immediately after submitting. The submission did complete successfully (data was saved), but the visual confirmation is incomplete.

**Workaround:** Check the zone's history or the management dashboard to view the score after submission.

**Root Cause (Technical):** The success icon is set to an empty string in the source code (`successIcon.textContent = ''`), indicating an emoji character that was likely removed or never added. The score and detail fields may not be rendering due to a server response format mismatch.

---

### BUG-003: Success Icon Empty (Missing Emoji)

**Severity:** LOW

**Description:** The large icon at the top of the success screen (intended to be a checkmark emoji or similar) is blank.

**Steps to Reproduce:** Same as BUG-002.

**Impact:** Cosmetic only. The success screen still shows "Submitted!" text.

---

### BUG-004: "Submitting..." Loading Text Does Not Translate

**Severity:** LOW

**Description:** When the UI is set to Hindi mode and the form is submitted, the loading overlay shows "Submitting..." in English rather than a Hindi translation.

**Steps to Reproduce:**
1. Open the Daily Checksheet
2. Switch to Hindi using the हिं button
3. Complete all 20 criteria
4. Tap the submit button (चेकशीट सबमिट करें)
5. Observe the loading overlay — it shows "Submitting..." in English

**Impact:** Cosmetic only. Hindi-speaking users see an English message during the brief loading period.

---

### LIMITATION-001: No Shift Selector

The Daily Checksheet does not include a shift selector (Morning / Afternoon / Night). If the same zone needs to be checked across multiple shifts per day, all submissions are recorded under the same date. Use the Remarks field to note the shift when submitting.

### LIMITATION-002: No Zone Selector on the Form

Each zone link is fixed. There is no dropdown to switch zones within the form. Each zone must be accessed via its own dedicated URL or QR code.

### LIMITATION-003: Photo Upload Requires Internet

The photo upload function uses Google Drive and requires an active internet connection. If you are offline, photos cannot be uploaded. The rest of the form (PASS/FAIL answers and remarks) can be completed and submitted offline; the offline queue handles this automatically. However, photos are not queued offline — they must be retaken when connectivity is restored.

### LIMITATION-004: No Mandatory Remarks for FAIL Items

When a criterion is marked FAIL, the form does not require the user to enter a remark explaining why or what corrective action is planned. This is a limitation for audit trail purposes. Users should make it a practice to always add a remark when marking items FAIL.

### LIMITATION-005: History Not Viewable from the Form

Past submissions cannot be browsed from within the Daily Checksheet form itself. Historical data is only accessible via the Zone Dashboard or the Google Sheets backend.

---

## Quick Reference Card

| Action | How To |
|--------|--------|
| Open form | Scan QR code or open zone-specific URL |
| Select PASS | Tap the PASS button (left) for a criterion |
| Select FAIL | Tap the FAIL button (right) for a criterion |
| Change an answer | Tap the other button — it replaces the selection |
| Expand a pillar | Tap the pillar header bar |
| Check progress | Look at the "Criteria Completed: X / 20" card at top |
| Check score | Look at the bar at the bottom of the screen |
| Add a note | Scroll to Remarks section and type |
| Take a photo | Scroll to Photo section, tap the camera icon |
| Submit | Tap the green "Submit Checksheet" button |
| Return to zone | After submission, tap "← Back to Zone" |
| Switch language | Tap EN or हिं button in the top-right |

---

*Guide prepared by QA testing — PackMasters 5S, February 2026*
