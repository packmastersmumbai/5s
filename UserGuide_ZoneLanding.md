# PackMasters 5S — Zone Landing Page User Guide

**Version:** v5.3.2 | **Date:** Feb 2026

---

## 1. What is the Zone Landing Page?

The Zone Landing Page is the central navigation hub for a specific 5S zone in PackMasters 5S. It is the first screen a user sees when they scan a zone QR code or follow a direct zone URL. It presents the zone's identity (name, leader, department, audit schedule) and provides one-tap access to every tool that zone members and auditors need: daily checklists, weekly audits, and all eight v2 zone tools (Quick Audit, SQCDP Board, Kanban / CAPA, Task Board, Red Tag, Kaizen Suggestion, Gemba Walk, and Shift Handover).

The page is purely a navigation hub — it does not collect or display any audit scores or trend charts itself. Score and trend data are available via the separate Zone Dashboard (accessible through the v2 tool routes).

---

## 2. Who Should Use It?

| Role | How they use it |
|---|---|
| **Zone Team Member** | Daily: tap Daily Checksheet to submit the morning check. |
| **Zone Leader** | Weekly: tap Weekly Audit to conduct the scored 5S audit. |
| **Auditor / Manager** | Launch Quick Audit, Gemba Walk, or SQCDP Board for structured reviews. |
| **Improvement Coordinator** | Access Kaizen Suggestion, Red Tag, or Kanban / CAPA to raise issues. |
| **Shift Supervisor** | Open Shift Handover to log handover notes between shifts. |

---

## 3. How to Access

### 3.1 URL Pattern

The Zone Landing Page uses the **legacy route** — `?zone=` with no `v2=1` and no `type=` parameter:

```
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?zone=<ZONE_ID>
```

**Examples:**

| Zone | URL |
|---|---|
| Z-01 Production Floor A | `...exec?zone=Z-01` |
| Z-02 Production Floor B | `...exec?zone=Z-02` |
| Z-03, Z-04, … | `...exec?zone=Z-03`, etc. |

### 3.2 QR Code Access

Each zone's QR code is pre-printed with the correct URL. Scanning it with any smartphone camera opens the landing page directly in the device browser — no app installation required.

### 3.3 Home Page Navigation

From the PackMasters 5S home page (`...exec` with no parameters), tap any zone card to be taken to that zone's landing page.

---

## 4. Page Layout Overview

The Zone Landing Page consists of five distinct regions, rendered top to bottom:

```
┌─────────────────────────────────────────┐
│  HEADER  (sticky — always visible)      │
│  ← Home   PackMasters 5S    EN | हिं   │
├─────────────────────────────────────────┤
│  ZONE IDENTITY BLOCK                    │
│  Zone ID — Zone Name (English, large)   │
│  Zone Name (Hindi, smaller)             │
│  Zone Leader name                       │
├─────────────────────────────────────────┤
│  PRIMARY ACTION BUTTONS (2)             │
│  [  Daily Checksheet  ]  (navy)         │
│  [  Weekly Audit      ]  (green)        │
├─────────────────────────────────────────┤
│  ZONE TOOLS  (8 outline buttons)        │
│  Quick Audit / SQCDP Board /            │
│  Kanban–CAPA / Task Board /             │
│  Red Tag / Kaizen Suggestion /          │
│  Gemba Walk / Shift Handover            │
├─────────────────────────────────────────┤
│  INFO PANEL  (blue tinted card)         │
│  Department | Audit Day | Today's Date  │
└─────────────────────────────────────────┘
```

### 4.1 Zone Header (Sticky Navigation Bar)

The sticky white header remains visible as the user scrolls. It contains:

- **"← Home" link** — returns to the PackMasters 5S home page.
- **Brand name** — "PackMasters 5S" in the display font.
- **Language toggle** — `EN` / `हिं` pill buttons (top-right). Switching languages immediately translates all button labels and info panel labels into English or Hindi. The preference is stored in browser localStorage and persists between sessions.

An amber **"You are offline"** banner appears immediately below the header if the device loses internet connectivity.

### 4.2 Zone Identity Block

Displayed below the header, centred on the page:

| Element | Example (Z-01) | Example (Z-02) |
|---|---|---|
| Zone ID — Name (English) | **Z-01 — Production Floor A** | **Z-02 — Production Floor B** |
| Zone Name (Hindi) | उत्पादन फ्लोर ए | उत्पादन फ्लोर बी |
| Zone Leader | Mr. Anuj Pathak | Mr. Rajesh Kumar |

These values are injected server-side from the zone configuration; there is nothing to tap or edit here.

### 4.3 Primary Action Buttons

Two large full-width buttons immediately below the identity block:

| Button | Colour | Navigates to |
|---|---|---|
| **Daily Checksheet** | Deep navy | `?zone=<ID>&type=daily` |
| **Weekly Audit** | Green | `?zone=<ID>&type=weekly` |

Both buttons are 56 px tall (WCAG touch-target compliant). The Daily Checksheet is the most-used button and is intentionally placed first and coloured with the brand primary colour.

> **Note:** The Weekly Audit route requires the user to be authenticated with a Google account that has been granted auditor access. Unauthenticated users see an "Access Denied — Unable to verify your identity" screen with a "Back to Zone" button. This is by design and not a bug.

### 4.4 Zone Tools Section (v2 Tools)

A labelled group titled **"Zone Tools"** contains eight outline buttons, each with an inline SVG icon:

| # | Button Label | Icon | URL Action Parameter |
|---|---|---|---|
| 1 | Quick Audit | Clipboard-check | `?v2=1&action=quickaudit&zone=<ID>` |
| 2 | SQCDP Board | Grid (4 squares) | `?v2=1&action=sqcdp&zone=<ID>` |
| 3 | Kanban / CAPA | Location pin | `?v2=1&action=kanban&zone=<ID>` |
| 4 | Task Board | Clipboard-check | `?v2=1&action=taskboard&zone=<ID>` |
| 5 | Red Tag | Tag/label | `?v2=1&action=redtag&zone=<ID>` |
| 6 | Kaizen Suggestion | Light bulb | `?v2=1&action=kaizen&zone=<ID>` |
| 7 | Gemba Walk | Eye | `?v2=1&action=gembawalk&zone=<ID>` |
| 8 | Shift Handover | Swap/arrows | `?v2=1&action=handover&zone=<ID>` |

All eight buttons are full-width, 56 px tall, with a 2 px navy border (outline style). The zone ID is automatically included in every URL so users never need to re-select their zone after arriving at the landing page.

### 4.5 Info Panel

A light-blue tinted card at the bottom of the page shows read-only zone metadata:

| Field | Description | Example (Z-01) |
|---|---|---|
| **Department** | Organisational department | Production & Ops |
| **Audit Day** | Scheduled weekly audit day | Monday |
| **Today** | Current date (auto-calculated) | Tuesday, 24 Feb, 2026 |

The "Today" date is generated client-side using the browser's locale (`en-IN` format) and is always accurate to the device's current date.

There is no trend chart, no score display, and no audit history on the landing page — those features are in the Zone Dashboard (accessible via the v2 route `?v2=1&action=dashboard&zone=<ID>`).

---

## 5. Understanding the Zone Score

The Zone Landing Page intentionally does **not** display any score or KPI number. It is a navigation hub, not a reporting view. To see the zone's current 5S score, pillar breakdown, trend chart, and NC/CAPA summary, navigate to the Zone Dashboard from any v2 tool page, or use the URL:

```
...exec?v2=1&action=dashboard&zone=<ZONE_ID>
```

The Zone Dashboard shows:
- Overall 5S score % (colour-coded green / amber / red)
- Status badge: On Target / Needs Improvement / Below Target
- Stats grid: Audits completed, Daily submission rate, Open NCs, Overdue NCs
- 5S Pillar Bars: S1–S5 individual percentage bars
- Monthly trend chart (Google Charts column chart, last 6 months)
- Action buttons: Print Audit Report, View NCs / CAPAs, Photo Gallery

---

## 6. Navigating to Tools from the Landing Page

### Daily Checksheet workflow
1. Open the zone landing page (`?zone=<ID>`).
2. Tap **Daily Checksheet** (navy button).
3. The Daily Checksheet form loads, pre-filled with today's date and the zone name.
4. Answer each Pass / Fail criterion across all 5S pillars (5 pillars, 4 criteria each = 20 total).
5. Submit at the bottom. A success confirmation screen appears.

### Weekly Audit workflow
1. Open the zone landing page.
2. Tap **Weekly Audit** (green button).
3. If not signed in to an authorised Google account, an "Access Denied" screen appears — sign in first and retry.
4. Score each criterion 0–4 across all pillars, add notes and photos as required, then submit.

### v2 Tool workflow (all 8 tools)
1. Open the zone landing page.
2. Scroll down to the **Zone Tools** section.
3. Tap the relevant tool button (e.g. Kaizen Suggestion).
4. The tool loads pre-scoped to the current zone — no zone re-selection needed.
5. Use the "← Home" or back navigation within each tool to return.

---

## 7. Zone Comparison (Switching Between Zones)

The landing page is zone-specific — each zone has its own URL with its own `?zone=` parameter. To switch zones:

### Method 1 — Edit the URL directly
Change `zone=Z-01` to `zone=Z-02` (or any valid zone ID) in the browser address bar and press Enter. The page reloads with the new zone's data.

**Known zone IDs observed in the system:** Z-01, Z-02, Z-03, Z-04, Z-05 (and more as configured).

### Method 2 — Go via Home
Tap **← Home** in the sticky header to return to the main home page, then tap the desired zone card from the zone list.

### Method 3 — QR code
Scan the target zone's QR code label to jump directly to that zone's landing page.

**Zone switching is confirmed working:** Z-01 (Production Floor A, leader Mr. Anuj Pathak) and Z-02 (Production Floor B, leader Mr. Rajesh Kumar) both load correctly with zone-specific names, Hindi translations, and leader names.

---

## 8. Important Notes

### Bilingual support
The page fully supports English and Hindi. The EN / हिं toggle in the top-right corner switches all button labels, info panel labels, and form text. The selection persists in the browser's localStorage. Hindi zone names are rendered from a separate `nameHi` field in the zone config.

### No score data on this page
By design, the Zone Landing Page shows no audit scores, pass rates, or historical data. It is a navigation hub. All metrics live in the Zone Dashboard and tool-specific views.

### Authentication
The Daily Checksheet and all v2 Zone Tools do not require authentication to open (they are read-accessible). The Weekly Audit requires a signed-in Google account with auditor privileges. If access is denied, the app shows a clear "Access Denied" error with a "Back to Zone" button.

### Offline behaviour
If the device loses internet connectivity, an amber banner reading "You are offline" appears immediately below the header. The landing page itself (once loaded) remains visible, but tapping any tool link will fail to load the target page until connectivity is restored.

### Mobile-first design
The page is optimised for mobile screens. All buttons meet the 44 px minimum tap-target standard (primary and tool buttons are 56 px). The layout is capped at 600 px wide and centred on large screens.

### `<base target="_top">` navigation
All links on the page use `target="_top"` (inherited from CommonStyles), which ensures that navigation breaks out of the Google Apps Script sandbox iframe and replaces the full browser window — the expected behaviour for GAS web apps.

---

## 9. Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| Page shows a blank white screen | GAS server still loading (cold start) | Wait 8–12 seconds and refresh. GAS deployments can have a slow first load. |
| Zone name appears blank / zone shows wrong data | Invalid or missing `?zone=` parameter | Verify the URL contains a valid zone ID (e.g. `?zone=Z-01`). Check with your administrator for the full list of zone IDs. |
| "Access Denied" on Weekly Audit | Not signed into an authorised Google account | Sign into the correct Google account (one that has been granted auditor access) and retry. |
| Hindi text not displaying | Font not loaded (offline or slow connection) | The Noto Sans Devanagari fallback font should render. If it does not, ensure an internet connection for Google Fonts to load. |
| "You are offline" banner showing | No internet connectivity | Restore internet connection. The landing page may still display (cached), but tool navigation requires connectivity. |
| Tool link navigates to an error page | v2 action not deployed or wrong deployment ID | Confirm you are using the correct deployment URL. Contact your system administrator. |
| Language toggle does not persist | Browser blocks localStorage | Ensure the browser allows localStorage for `script.google.com`. Disable private/incognito mode if possible. |
| Page content not visible on scrolling down | GAS sandboxFrame iframe scroll behaviour | Scroll within the page content area (not the browser chrome). On mobile, a standard swipe gesture works correctly. |

---

*This guide was produced by testing the live deployment at zone=Z-01 (Production Floor A) and zone=Z-02 (Production Floor B) on 24 Feb 2026. Source files reviewed: `LandingPage.html`, `ZoneDashboard.html`, `CommonStyles.html`.*
