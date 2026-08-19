# PackMasters 5S — Design System

Single source of truth: **`CommonStyles.html`**. Include it in every page:

```html
<?!= include("CommonStyles") ?>
```

34 of 42 pages do. The two deliberate exceptions are documented under
[Exceptions](#exceptions).

> **Rule: no raw hex in page CSS.** If a colour, size, radius or shadow is not
> in this document, add it here first, then use the token. Literals are how the
> palette forked three ways (see Exceptions).

---

## Tokens

### Surfaces
| Token | Light | Dark |
|---|---|---|
| `--bg-page` | `#F8FAFC` | `#0d0d1a` |
| `--bg-card` | `#FFFFFF` | `#15152a` |
| `--bg-card-2` | `#F7F6F3` | `#1b1b32` |
| `--bg-header` | `#FFFFFF` | ✓ overridden |

### Borders
`--border` `#E2E8F0` · `--border-light` `#F1F5F9` · `--border-focus` `#1E3A5F`

`--border-focus` is also the keyboard focus-ring colour. Do not repurpose it.

### Brand
`--pm-primary` `#0F172A` · `--pm-primary-light` `#1E293B` ·
`--pm-primary-dark` `#152D4A` · `--pm-primary-soft` `rgba(15,23,42,.06)` ·
`--pm-accent` `#2F9E44` · `--pm-accent-light` `#37B24D`

### 5S pillars
`--5s-sort` (Seiri, red) · `--5s-set` (Seiton, orange) · `--5s-shine` (Seiso,
green) · `--5s-standard` (Seiketsu, blue) · `--5s-sustain` (Shitsuke, purple)

### SQCDP
`--sqcdp-s` Safety · `--sqcdp-q` Quality · `--sqcdp-c` Cost ·
`--sqcdp-d` Delivery · `--sqcdp-p` People

### Scores
Semantic pairs: `--score-green` / `--score-green-bg`, and the same for
`amber`, `red`, `blue`. Numeric audit ramp `--score-0` … `--score-4`
(0 = red fail → 4 = deep green pass).

### Type
`--font-display` Outfit · `--font-main` Figtree + Noto Sans Devanagari
(**required** — the floor UI is bilingual Hindi/English) · `--font-mono`
JetBrains Mono.

Scale: `--size-xs` 11 · `--size-sm` 13 · `--size-base` 15 · `--size-lg` 17 ·
`--size-xl` 21 · `--size-2xl` 28 (px).

Text: `--text-primary` · `--text-secondary` · `--text-muted` · `--text-light`.

### Spacing — 4px grid
`--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 ·
`--sp-6` 24 · `--sp-8` 32

### Shape & elevation
`--r-sm` 5 · `--r` 8 · `--r-lg` 12 · `--r-xl` 16 ·
`--shadow` · `--shadow-lg`

### Interaction
`--tap-min` **44px** — minimum touch target. Non-negotiable: users operate this
on a factory floor, often gloved. `--trans` `0.18s ease`.

---

## Components

92 classes. Primary families:

| Family | Variants |
|---|---|
| `.pm-btn` | `--primary` `--success` `--danger` `--outline` `--lg` |
| `.pm-card` | — |
| `.pm-input` / `.pm-textarea` | — |
| `.badge` | `--green` `--amber` `--red` `--blue` `--navy` |
| `.pf-btn` | `--pass` `--fail` (pass/fail toggle) |
| `.pm-toast` `.pm-drawer` `.pm-fab` `.pm-spinner` `.pm-overlay` | — |
| `.bottom-nav` | `-item` `-icon` |

### Required states
Every interactive component must define `:hover`, `:active`, `:disabled` and
inherit `:focus-visible` from the global accessibility block. **Do not write
`outline: none` without an accompanying `:focus-visible` rule.**

Known gaps:
- `.pm-btn` has no loading state; `.pm-input` has no invalid state.
- On QuickAudit, `.qa-submit` and `.offline-banner__dismiss` receive the 3px
  ring but page-local rules win on `outline-color`, so it paints in their own
  colour rather than `--border-focus`. Visible and WCAG-conformant, just
  off-palette — fix by removing those local outline declarations, not by adding
  `!important` here.

---

## Accessibility

- **Focus** — a global `:focus-visible` block gives a 3px `--border-focus`
  outline (accent in dark mode). `:focus-visible` fires only for keyboard/AT
  navigation, so tap and mouse users see nothing.
  The selector targets **elements** (`button`, `a`, `select`, `[role="button"]`,
  `[tabindex]:not([tabindex="-1"])`), not class names — pages define dozens of
  their own button classes (`.ah-btn`, `.iv-filter-btn`, `.gw-yn-btn`, `.fm-btn`
  …) and enumerating them guarantees gaps. New markup is covered automatically.
- **Reduced motion** — `@media (prefers-reduced-motion: reduce)` neutralises
  animation, transition and `transform: scale()` press effects.
- **Touch** — use `--tap-min` (44px), never a hardcoded height.
- **Colour** — never encode meaning in colour alone. The overdue rail pairs its
  red border with a text chip; follow that pattern.

Target: **WCAG 2.2 AA**.

---

## Theming

Dark mode is opt-in per document:

```js
document.documentElement.setAttribute('data-theme', 'dark');  // persisted: localStorage 'pm5s_theme'
```

38 of 69 tokens are overridden. Untouched tokens are intentionally
theme-independent (spacing, radii, fonts, `--text-light`).

⚠️ **Only `CommonStyles` and `GembaBoard` currently wire up the toggle.** Adding
the attribute-setter to a page is what makes dark mode reachable there.

---

## Exceptions

**`RecordView.html`** does not include CommonStyles. It is anonymous,
high-traffic, opened from Telegram links, and the include forces a ~195KB
ZONE_CONFIG parse per load — see `serveRecordViewFast_()` in
`20_EnhancedWebApp.js`. It therefore declares a 17-token local `:root` using
short names (`--ink`, `--bg`, `--accent`).
**Its values are copied from this document and must be kept in sync.**

**`InsightsView.html`** includes CommonStyles at the end of `<body>` and still
carries ~142 hex literals from a pre-token palette. Migrating it is tracked
work, not a licence to add more literals.

---

## Contributing

The system forked three ways because there was no answer to "the tokens don't
fit my page." There is one now.

**Your page needs a value the system doesn't have.**

1. **Check for a near-match first.** `--score-amber` probably covers your
   warning colour. Reuse beats addition.
2. **If it is genuinely new, add it here and to `CommonStyles.html` :root** —
   in the same commit as the page that needs it. A token used once is fine; a
   literal used once is not, because the next page copies it.
3. **Name it by role, not appearance.** `--score-red`, not `--bright-red`.
   Roles survive a rebrand; appearances do not.
4. **If it needs a dark value, add that too** in the `[data-theme="dark"]`
   block. Half-themed tokens are how dark mode ended up at 25% coverage.

**When forking is acceptable** — exactly two cases:

- **Measured performance**, like `RecordView` (see Exceptions). Document the
  measurement in the file and here.
- **A need the system genuinely cannot express.** Then say so, and expect the
  fork to be promoted back. QuickAudit's vivid pillar ramp was a real gap — the
  muted `--5s-*` set did not read at arm's length on the floor. It is now
  canonical as `--pillar-*-vivid`.

"I was in a hurry" is not on the list. That path produced 887 hex literals.

**Promoting a fork back.** If your page solved something well, move the tokens
into `CommonStyles.html` :root, note the origin in a comment, and point the page
at the canonical names. Nothing is lost; everyone gains.

---

## Adoption status

Measured 2026-08-20. Re-measure with the commands in the audit trail, not by eye.

| Metric | Then | Target |
|---|---|---|
| Token adoption (var vs hex) | 64% | 85% |
| Pages at 0% adoption | 10 | 0 |
| Parallel palettes | 4 | 1 (RecordView) |
| `data-theme` wired | 2 / 41 | 41 |

Pages at 0%, smallest first — each is find-and-replace, not redesign, and 7 of
them already include CommonStyles: `WDGLLLibrary` (4 literals), `SkillsMatrix`
(13), `DataImport` (14), `PinLogin` (17), `PhotoAnnotator` (24), `AuditReport`
(26), `OPLViewer` (30), `MRMReportPack_Full` (32), `MRMSummary` (34),
`RedTagForm` (44).

---

*Audited and updated 2026-08-20.*
