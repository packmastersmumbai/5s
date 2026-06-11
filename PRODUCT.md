# PackMasters 5S — Product Context

## Product Purpose
Web-based lean manufacturing 5S Quality Management System for factory floor operations. Enables real-time tracking of audits, corrective actions, Gemba walks, Kanban tasks, and daily production boards. Built on Google Apps Script, deployed as a web app.

## Register
product

## Users
- **Factory floor workers** — log issues, submit forms, view their zone status. Low tech literacy. Mobile-first. Fast interactions only.
- **Zone leads** — manage CAPAs, review audit scores, run Gemba walks. Tablet + mobile.
- **Auditors** — conduct 5S audits, raise NCs, track compliance. Tablet in the field.
- **Managers** — review SQCDP boards, tier dashboards, KPIs. Desktop + tablet.
- **Admins** — configure zones, users, checklists. Desktop.

## Physical Scene
Factory floor in Mumbai — bright fluorescent lighting, noisy environment, workers wearing gloves, screens viewed at arm's length on wall-mounted tablets or handheld phones. Managers reviewing dashboards on desktop in a site office. Data must be readable at a glance.

## Brand Tone
Industrial, functional, trustworthy. No decoration for decoration's sake. Every element earns its place. Dense information presented with clarity, not clutter. Confident, not corporate.

## Color Strategy
Restrained — tinted dark navy neutrals with a single amber/orange operational accent. Status colors (green/amber/red) carry meaning and are used precisely. No gradient decoration.

## Anti-References
- Generic SaaS dashboards (Notion-style, Linear-style cream UI)
- Glassmorphism, frosted cards
- Gradient text, hero-metric templates
- Pastel / healthcare-soft palettes
- Heavy animations — workers need speed, not delight

## Key Pages
- HomePage — zone dashboard, KPI chips, audit score, quick actions
- KanbanBoard — CAPA task columns (Open / In Progress / Done)
- GembaBoard — zone-by-zone status grid
- ActionList — filterable list of corrective actions
- SQCDPBoard — Safety / Quality / Cost / Delivery / People daily metrics
- TierDashboard — tiered production meeting board
- QuickAudit — mobile audit form, S1–S6 checklist

## Technical Constraints
- Google Apps Script HTML Service — no npm, no build step, no React
- Vanilla JS + CSS custom properties only
- Works offline (IndexedDB queue via OfflineQueueService)
- Runs in GAS sandboxed iframe
- Target: 375px mobile up to 1440px desktop
