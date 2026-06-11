# PackMasters 5S — SQCDP Board User Guide

**Version:** v5.3.2 | **Date:** Feb 2026 | **Audience:** Zone Leaders, Department Heads, Plant Managers

---

## Table of Contents

1. [What is the SQCDP Board?](#1-what-is-the-sqcdp-board)
2. [Who Should Use It?](#2-who-should-use-it)
3. [How to Access](#3-how-to-access)
4. [Page Layout Overview](#4-page-layout-overview)
5. [Understanding SQCDP Dimensions](#5-understanding-sqcdp-dimensions)
6. [Reading the Board](#6-reading-the-board)
7. [Interactive Features](#7-interactive-features)
8. [Colour Coding Reference](#8-colour-coding-reference)
9. [Important Notes](#9-important-notes)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What is the SQCDP Board?

The **SQCDP Board** is a real-time plant-wide performance dashboard within PackMasters 5S. It provides a single-screen view of every monitored zone's performance across five key operational dimensions: **Safety**, **Quality**, **Cost**, **Delivery**, and **People**.

The board is designed for daily stand-up meetings, shift handovers, and management walkabouts. At a glance it tells you:

- How many zones are on target versus needing attention
- Which specific dimension is failing in each zone
- The plant-wide green rate as a single headline number

Data is pulled directly from the PackMasters 5S backing spreadsheet and reflects the latest audit scores, Red Tag counts, action statuses, and certification records entered by zone teams.

---

## 2. Who Should Use It?

| Role | How They Use the Board |
|---|---|
| Plant Manager | Morning review of overall green rate and zone status before shift briefing |
| Department Head | Monitor own zones; identify dimensions needing immediate escalation |
| Zone Leader | Verify their zone card is correct; drill into Actions or Audit from their card |
| 5S Coordinator | Cross-zone trend monitoring; spot systemic issues across multiple zones |
| Shift Supervisor | Quick handover check — confirm status before handing over to next shift |
| Auditor / ISO Team | Evidence that zone performance is tracked and visible in real time |

---

## 3. How to Access

**Method 1 — Direct URL (recommended)**

Navigate your browser to the full feature URL:

```
https://script.google.com/macros/s/AKfycbw6GfjKqYmhprkF7tUJVofcAgGrK1ujjIhgtk7ETO2CG7BdtyxQkFlkR_Yym0uvCEJ8/exec?v2=1&action=sqcdp&zone=Z-01
```

The `zone=` parameter in the URL is accepted but does not filter the board view — the full plant board is always shown regardless of which zone is specified in the URL.

**Method 2 — Bottom Navigation Bar**

From any screen within PackMasters 5S, tap the **Board** icon (grid of squares) in the bottom navigation bar. The Board tab is the second item from the left.

**Method 3 — Home Page**

From the PackMasters 5S home page, locate and tap the SQCDP Board tile or button.

**Method 4 — Back Arrow Navigation**

If you are on any zone-specific page (Quick Audit, Action List, Zone Detail), use the back arrow ( <- ) in the top-left header to return to the home screen, then navigate to the Board.

**Load time:** Allow 5–10 seconds after navigating for data to load from the spreadsheet backend. A spinning loader is displayed during this period.

---

## 4. Page Layout Overview

The SQCDP Board is divided into four visual zones from top to bottom:

### 4.1 Page Header (Sticky)

The header remains fixed at the top of the screen as you scroll. It contains:

| Element | Description |
|---|---|
| Back arrow ( <- ) | Returns to the PackMasters 5S home page |
| Title "SQCDP BOARD" | Page identifier in bold navy |
| Subtitle | "SAFETY · QUALITY · COST · DELIVERY · PEOPLE" — the five dimensions |
| Data timestamp | Date and time the underlying data was last generated (e.g. "24-Feb-2026 15:06") |
| Refresh button ( Refresh ) | Manually reloads data from the spreadsheet |

### 4.2 Plant KPI Bar

Immediately below the header is a four-cell summary strip showing plant-wide totals:

| KPI Cell | Colour | What It Shows |
|---|---|---|
| Green Rate % | GREEN / AMBER / RED based on score | Percentage of all zone-dimension combinations that are GREEN |
| Zones Total | Navy blue | Total number of active monitored zones |
| On Target | Green | Number of zones where the overall status is GREEN |
| Needs Focus | Red | Number of zones where the overall status is RED |

The Green Rate % cell changes colour according to the same thresholds used for individual dimensions: green if >= 80%, amber if 60–79%, red if below 60%.

### 4.3 Zone Card Grid

The main content area displays one card per zone in a responsive grid:

- **Narrow screens (mobile, < 520 px):** Single column
- **Medium screens (520–899 px):** Auto-fill columns, minimum 300 px wide each
- **Wide screens (900–1279 px):** Two columns
- **Large screens (>= 1280 px):** Three columns

Each zone card is described in detail in Section 6.

### 4.4 Bottom Navigation Bar

A persistent five-item navigation bar at the very bottom of the screen:

| Item | Icon | Action |
|---|---|---|
| Home | House icon | Navigate to PackMasters 5S home |
| Board | Grid icon (active/bold when on this page) | Current page — SQCDP Board |
| Actions | Lightning bolt icon | Navigate to plant-wide Action List |
| Handover | Circular arrows icon | Navigate to Shift Handover |
| More | Hamburger menu icon | Additional options |

---

## 5. Understanding SQCDP Dimensions

Each of the five SQCDP dimensions monitors a distinct operational area. The coloured top-border on each dimension cell uses a fixed colour taxonomy to make dimensions instantly recognisable across all zones.

| Letter | Dimension | Border Colour | What Is Measured |
|---|---|---|---|
| **S** | Safety | Red (`#C92A2A`) | Open safety non-conformances (NCs). The value displayed is the count of unresolved safety NCs. Zero is the target. |
| **Q** | Quality | Blue (`#1864AB`) | Latest 5S audit score as a percentage. Reflects the most recent scored audit for the zone. Target is typically >= 80%. |
| **C** | Cost | Orange (`#E67700`) | Value of pending Red Tag items in INR (Indian Rupees). Represents cost exposure from unresolved Red Tags. Lower is better. |
| **D** | Delivery | Green (`#0B7C45`) | Count of overdue corrective actions. Zero means all actions are on time. |
| **P** | People | Purple (`#6741D9`) | Count of certifications expiring or already expired. Zero means all certifications are current. |

### Dimension Detail Text

Each dimension cell shows a short detail line below the headline value (visible on screens wider than 520 px). This text is truncated to 30 characters. Examples seen in live data:

- S: "No open safety NCs"
- Q: "Latest 5S score: 75% (target:" *(note: truncated — full target value not displayed)*
- C: "1 Red Tag(s) pending, ₹15,000"
- D: "2 overdue action(s)"
- P: "All certifications current"

---

## 6. Reading the Board

### 6.1 Zone Card Anatomy

Each zone card consists of three sections:

**Zone Header**
- Zone ID (e.g. "Z-01") in navy monospace font
- Zone name in bold (e.g. "Production Floor A")
- Zone leader name in smaller grey text (if configured)
- Status dot (coloured circle) in the top-right corner

**SQCDP Row**
Five equally-sized dimension cells side by side, each showing:
- The dimension letter (S / Q / C / D / P) — colour reflects dimension status
- The headline value (number, percentage, or currency amount)
- A brief detail line

**Zone Footer**
Three action buttons:
- **Actions** (primary, navy fill) — opens the Action List for this zone
- **Audit** — opens the Quick Audit form for this zone
- **Zone** — opens the Zone Detail page for this zone

### 6.2 Overall Zone Status

The left border of the card and the status dot both indicate the zone's overall status:

| Border / Dot Colour | Status | Meaning |
|---|---|---|
| Green | GREEN — On Target | All key dimensions are performing adequately |
| Amber / Orange | AMBER — Caution | One or more dimensions need attention but are not critical |
| Red | RED — Needs Focus | One or more dimensions are critically off target |
| Grey (no colour) | No data | Insufficient data to determine status |

### 6.3 Scoring Logic

The system converts raw values to GREEN / AMBER / RED using these thresholds, applied to numeric scores expressed as percentages:

| Score | Status |
|---|---|
| 80 or above | GREEN |
| 60 to 79 | AMBER |
| Below 60 | RED |
| No value / blank | No data (grey, shown as "—") |

For Safety (S), Delivery (D), and People (P), the raw value is a count where **zero is GREEN** and any non-zero value is scored as RED (these are not percentage-based).

### 6.4 Live Data Example (24 Feb 2026)

The board showed the following plant state during testing:

| Zone | Name | S | Q | C | D | P | Overall |
|---|---|---|---|---|---|---|---|
| Z-01 | Production Floor A | GREEN (0) | GREEN (75%) | AMBER (₹15,000) | RED (2 overdue) | GREEN (0) | AMBER |
| Z-02 | Production Floor B | GREEN (0) | AMBER (65%) | GREEN (₹0) | RED (1 overdue) | GREEN (0) | AMBER |
| Z-03 | Raw Material Store | GREEN (0) | GREEN (75%) | AMBER (₹5,000) | GREEN (0) | GREEN (0) | AMBER |
| Z-04 | Finished Goods Store | GREEN (0) | GREEN (80%) | AMBER (₹3,600) | GREEN (0) | RED (1 expiring) | AMBER |
| Z-05 | Quality Lab | GREEN (0) | GREEN (75%) | AMBER (₹8,000) | GREEN (0) | GREEN (0) | AMBER |
| Z-06 | Maintenance Workshop | GREEN (0) | GREEN (85%) | GREEN (₹0) | RED (1 overdue) | GREEN (0) | AMBER |
| Z-07 | Office & Admin Area | GREEN (0) | AMBER (70%) | GREEN (₹0) | GREEN (0) | GREEN (0) | GREEN |
| Z-08 | Dispatch & Loading Bay | GREEN (0) | RED (60%) | AMBER (₹12,000) | RED (1 overdue) | GREEN (0) | RED |

**Plant KPIs:** Green Rate 70% (AMBER) | 8 Zones | 1 On Target | 1 Needs Focus

---

## 7. Interactive Features

### 7.1 Refresh Button

Located in the top-right of the sticky header. Clicking it triggers an immediate reload of all data from the spreadsheet backend. The zone grid is temporarily replaced by a "Refreshing…" spinner while data is fetched (typically 3–8 seconds). The data timestamp in the header updates to reflect the new generation time.

**Auto-refresh:** The board automatically refreshes data every **5 minutes** without any user interaction required. This keeps the board current during prolonged display (e.g. on a wall-mounted screen).

### 7.2 Zone Card Buttons

Each zone card has three buttons in its footer:

**Actions button (primary, navy)**
- Opens the Action List filtered to the selected zone
- Navigates the full browser window (not a popup)
- Use this to view, assign, or update corrective actions for the zone

**Audit button**
- Opens the Quick Audit form for the selected zone
- Use this to record a new 5S audit score
- Navigates away from the SQCDP Board

**Zone button**
- Opens the Zone Detail page
- Shows full zone information, historical scores, and configurations

### 7.3 Back Arrow

The back arrow in the header returns to the PackMasters 5S home page. It navigates the top-level browser frame (exits the board completely).

### 7.4 Bottom Navigation Bar

The five-item bottom nav bar allows jumping directly to other major sections of the app without returning to home first. The Board item is highlighted in bold when the SQCDP Board is the active view.

### 7.5 No Filters or Date Pickers

The SQCDP Board does not include zone filters, date range selectors, or dimension toggles. It always displays all zones for the current period. Use the zone card buttons to drill into zone-specific detail.

---

## 8. Colour Coding Reference

### Status Colours

| Colour | Hex Code | Used For |
|---|---|---|
| GREEN | `#2F9E44` | On-target status; value >= 80%; zero count metrics |
| AMBER / ORANGE | `#E67700` | Caution status; value 60–79% |
| RED | `#C92A2A` | Needs focus; value < 60%; non-zero safety/delivery/people counts |
| NAVY BLUE | `#1E3A5F` | Brand colour; zone IDs; Zones Total KPI |

### Dimension Top-Border Colours

| Dimension | Colour | Hex |
|---|---|---|
| S — Safety | Red | `#C92A2A` |
| Q — Quality | Blue | `#1864AB` |
| C — Cost | Orange | `#E67700` |
| D — Delivery | Green | `#0B7C45` |
| P — People | Purple | `#6741D9` |

### Background Tints (when coloured)

| Status | Cell Background | Text / Icon Colour |
|---|---|---|
| GREEN cell | `#EBFBEE` (light green) | `#2F9E44` (green) |
| AMBER cell | `#FFF3E0` (light orange) | `#E67700` (amber) |
| RED cell | `#FFF5F5` (light red) | `#C92A2A` (red) |
| No data (x) | `#F7F6F3` (light grey) | `#9CA3AF` (muted grey) |

---

## 9. Important Notes

- **Data is read-only on this screen.** The SQCDP Board is a display dashboard only. No scores, actions, or zone details can be edited from this page. Use the Actions, Audit, or Zone buttons on each card to make changes.

- **The data timestamp reflects spreadsheet generation time, not the current clock.** If the timestamp is significantly behind the current time, click Refresh or ask the 5S Coordinator to check that the spreadsheet backend is running its scheduled triggers correctly.

- **Auto-refresh occurs every 5 minutes.** The board will silently reload data in the background. You do not need to manually refresh during normal monitoring sessions.

- **The zone URL parameter does not filter the board.** The URL includes `zone=Z-01` but this parameter has no effect on the plant-wide board view. All zones are always displayed. Zone-specific filtering happens only within individual zone pages (Zone Detail, Quick Audit, Action List).

- **The dimension detail text is truncated at 30 characters.** Long detail descriptions (e.g. audit targets with long numeric values) will be cut off. Hover over the dimension cell on desktop browsers to see the full tooltip text. On mobile, tap the Actions or Audit button for the full detail.

- **Safety (S) counts are zero-tolerance.** A single open safety NC will mark the S dimension RED regardless of the numeric threshold. Zero is the only acceptable value.

- **Initial Setup must be completed before data appears.** If you see "No Data Yet" instead of zone cards, the spreadsheet's Initial Setup has not been run, or no data has been loaded yet. Contact your 5S Administrator.

---

## 10. Troubleshooting

| Issue | Likely Cause | Solution |
|---|---|---|
| Page shows "Loading SQCDP data" spinner indefinitely | Network timeout or Google Apps Script cold start | Wait 15–20 seconds, then click the Refresh button. If the issue persists, reload the browser page. |
| Page shows "Data Load Failed" error with triangle icon | `getSQCDPBoardData()` function returned an error; spreadsheet backend issue | Confirm Initial Setup has been run from the Admin menu in the spreadsheet. Check with your 5S Coordinator. |
| Page shows "No Data Yet" with bar chart icon | Initial Setup not run, or sample data not loaded | Run Initial Setup from the spreadsheet Admin menu, then load sample or live data. |
| Plant KPI bar shows "—" dashes instead of numbers | Data loaded but zone list is empty | Check that at least one zone is configured in the spreadsheet. |
| Zone card shows "—" for a dimension value | No data recorded for that dimension in the current period | Ensure the zone team has completed a Quick Audit and any required daily checks for the current period. |
| Dimension detail text is cut off mid-sentence | 30-character display truncation by design | Hover over the cell for the full tooltip on desktop. Use the zone's Audit or Zone button for full details. |
| Actions / Audit / Zone buttons do not navigate | Possible browser popup blocker, or GAS sandboxFrame restriction | Allow popups for script.google.com in your browser settings. If accessing via embedded frame, try opening the board URL directly in a new browser tab. |
| Timestamp is several hours old | Scheduled spreadsheet trigger may have stopped | Refresh manually first. If still stale, ask the 5S Administrator to check the Google Apps Script trigger schedule in the spreadsheet. |
| Green Rate % seems incorrect | Calculation includes all zone-dimension combinations, not just zone-level status | The Green Rate reflects individual S/Q/C/D/P cell statuses across all zones (40 cells total for 8 zones). A zone can be AMBER overall but still contribute GREEN cells to the rate. |
| Board looks different on mobile | Responsive layout adjusts column count and hides dimension detail text on narrow screens | On screens narrower than 520 px, the detail line below each dimension value is hidden to save space. The letter, value, and colour status are still shown. |

---

*PackMasters 5S v5.3.2 | SQCDP Board User Guide | Feb 2026*
*For support, contact your 5S Administrator or the PackMasters deployment team.*
