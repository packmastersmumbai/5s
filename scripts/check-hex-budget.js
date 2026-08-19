#!/usr/bin/env node
/**
 * Raw-hex ratchet for page CSS. Run: node scripts/check-hex-budget.js
 * Exits 1 when a page's <style> block exceeds its budget of raw hex literals.
 *
 * A ratchet, not a gate: existing debt is budgeted, new debt fails. Lower a
 * budget when you migrate a page; never raise one without a note in
 * docs/DESIGN_SYSTEM.md. Tokens live in CommonStyles.html :root.
 */
const fs = require('fs'), path = require('path');

const BUDGET = {
  QuickAudit: 120,          // own oklch design system, migration pending
  InsightsView: 90,
  HomePage: 110,
  FloorMap: 65,
  ActionsHub: 75,
  RecordView: 50,           // documented CommonStyles exception
  ZoneMatrix: 40,
  MRMReportPack_Full: 8,
  PhotoAnnotator: 6,
  OPLViewer: 5,
  PinLogin: 5,
  // Not yet audited — budgets set to current measured debt 2026-08-20.
  ManagementReview: 21,
  MasterSettings: 20,
  GuidedTour: 17,
  MapEditor: 5,
  CAPATracker: 4,
  GembaWalkForm: 4,
};
const DEFAULT_BUDGET = 3;
const SKIP = new Set(['CommonStyles.html', 'index.html']);

const root = path.join(__dirname, '..');
let over = [], total = 0, tokens = 0;

for (const f of fs.readdirSync(root).filter(x => x.endsWith('.html')).sort()) {
  if (SKIP.has(f)) continue;
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const cut = src.indexOf('</style>');
  if (cut < 0) continue;
  const css = src.slice(0, cut);
  // leading '&' guard skips HTML entities such as &#8212;
  const hits = (css.match(/(?<![&\w])#[0-9a-fA-F]{3,6}\b/g) || []).length;
  const vars = (css.match(/var\(--/g) || []).length;
  total += hits; tokens += vars;
  const name = f.replace(/\.html$/, '');
  const budget = name in BUDGET ? BUDGET[name] : DEFAULT_BUDGET;
  if (hits > budget) over.push(`  ${name}: ${hits} literals (budget ${budget})`);
}

const pct = Math.round(tokens * 100 / (tokens + total));
console.log(`token adoption in page CSS: ${pct}%  (${tokens} var() vs ${total} hex)`);

if (over.length) {
  console.error('\nFAIL — pages over their raw-hex budget:\n' + over.join('\n'));
  console.error('\nUse a token from CommonStyles.html :root, or see');
  console.error('docs/DESIGN_SYSTEM.md "Contributing" to add one.\n');
  process.exit(1);
}
console.log('OK — no page exceeds its raw-hex budget.');
