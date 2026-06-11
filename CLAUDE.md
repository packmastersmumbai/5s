# Project 5S — Claude Configuration

## Project Overview
- **Type:** Google Apps Script (GAS) — lean manufacturing 5S management system
- **Status:** Active
- **Key Technologies:** Google Apps Script, HTML Service, CacheService, clasp CLI

## Preview / Dev Server
**This project has NO local dev server.** It is a GAS project deployed to Google's cloud.
- `preview_start` and `<verification_workflow>` do NOT apply here
- Verification is done via `clasp push` followed by manual testing in the deployed GAS web app
- The preview hook should not fire for this project

## Project-Specific Preferences

### Workflow Style
- Prefer concise responses over verbose explanations
- Use parallel tool calls when independent operations exist
- Mark completed tasks immediately in TodoWrite, don't batch completions

### Quick Query Exemptions (`?` and `q:` prefixes)
**CRITICAL:** Prompts starting with `?` or `q:` BYPASS the entire skill system:
- ✅ **DO:** Respond directly and concisely with no skills invoked
- ✅ **DO:** Skip skill declarations, token reports, and routing logic
- ❌ **DON'T:** Invoke task-observer, master-selector, or any skill
- ❌ **DON'T:** Make tool calls unless absolutely necessary for clarity

Examples:
- `? What is X?` → direct answer only
- `q: How does Y work?` → explanation, no skill routing
- Regular prompt → full skill system active

### Code Standards
- Avoid over-engineering; only implement what's requested
- Don't add comments/docstrings unless logic is non-obvious
- Prefer editing existing files over creating new ones

### Memory Management
- Memory stored in: `~/.claude/projects/C--Users-Appex-Desktop-Claude-Project-5S/memory/`
- `MEMORY.md` for concise facts; separate topic files for detailed notes
- Update memory after confirming patterns across interactions
- Clean up outdated entries when patterns change

## Global Rules Override
This file complements `~/.claude/CLAUDE.md` (global config).
Global rules take precedence; add project-specific exceptions here.

**Note on `?` prefix:** Queries starting with `?` bypass skill routing and get direct answers—use for quick clarity questions without triggering the full task system.

## Testing
**Default testing tool: Playwright CLI (headed browser, single agent)**
- Always use the `playwright-cli` skill for any testing task in this project
- Target URL: `https://script.google.com/macros/s/AKfycbyYsCQfJvhorJglpwmpfYNt65659sM5HWKztNK1n5tzeB5wyaovrLpMRDYg95d6yKgQHg/exec`
- Run in headed mode so the browser is visible
- Use a single agent (not parallel) for browser tests to avoid session conflicts
- Never use `preview_start` or local server verification for this project

## Notes
- Add project learnings and architectural decisions as you work
- Link to key files or patterns once confirmed
