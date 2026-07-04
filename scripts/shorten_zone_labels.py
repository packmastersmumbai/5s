#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Shorten every zone criterion's labelEn / labelHi in 01b_ZoneData.js to a short,
actionable, floor-worker-friendly bilingual phrase. Keeps helperEn/helperHi,
sqdcp, trigger and maxScore untouched (the detail lives in the helper text).

Rewrites in place. Original is backed up to 01b_ZoneData.js.bak.
Uses claude.exe --print (no API key needed — this IS Claude Code).

Env:
  ZONE_LIMIT=Z-01   process only that zone (smoke test); unset = all 28.
"""
import glob, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "01b_ZoneData.js")

def find_claude():
    base = os.path.expandvars(r"%APPDATA%\Claude\claude-code")
    exes = sorted(glob.glob(f"{base}/*/claude.exe"), reverse=True)
    return exes[0] if exes else "claude"

CLAUDE = find_claude()

# One criterion per line: { id:"S1-1", pillar:"S1", labelEn:"...", labelHi:"...", helperEn:"...
LABEL_EN = re.compile(r'(labelEn:")((?:[^"\\]|\\.)*)(")')
LABEL_HI = re.compile(r'(labelHi:")((?:[^"\\]|\\.)*)(")')
ZONE_HDR = re.compile(r'^\s*"(Z-\d\d)":\s*\[')
CRIT_LINE = re.compile(r'\bid:"(S\d-\d)"')

def decode_js_str(s):
    # turn a JS double-quoted body (with \uXXXX etc.) into a python str
    return json.loads('"' + s + '"')

def encode_js_str(s):
    # produce a JS double-quoted body; keep Devanagari literal, escape quotes/backslashes
    return s.replace("\\", "\\\\").replace('"', '\\"')

def ask_claude(zone_name, items):
    """items: list of {id, en}. Returns dict id -> {en, hi}."""
    prompt = (
        "You are rewriting 5S audit checklist parameters for factory floor workers.\n"
        f"Zone: {zone_name}\n\n"
        "For each item below, rewrite the English into a SHORT, ACTIONABLE command "
        "(max 6 words, imperative where natural) and give a SHORT simple SPOKEN Hindi "
        "(Devanagari, everyday words a floor worker uses, max ~7 words). Keep the exact "
        "meaning and the zone context. Do NOT add numbering.\n\n"
        "Return ONLY a JSON object mapping each id to {\"en\":..., \"hi\":...}. No prose.\n\n"
        "Items:\n" + "\n".join(f'{it["id"]}: {it["en"]}' for it in items)
    )
    res = subprocess.run([CLAUDE, "--print"], input=prompt, capture_output=True,
                         text=True, encoding="utf-8")
    out = res.stdout.strip()
    m = re.search(r'\{.*\}', out, re.S)
    if not m:
        raise RuntimeError(f"No JSON from claude for {zone_name}:\n{out[:400]}")
    return json.loads(m.group(0))

def main():
    only = os.environ.get("ZONE_LIMIT", "").strip()
    with open(SRC, encoding="utf-8") as f:
        lines = f.readlines()
    if not os.path.exists(SRC + ".bak"):
        with open(SRC + ".bak", "w", encoding="utf-8") as f:
            f.writelines(lines)

    # group line indices by zone
    zones, cur = {}, None
    for i, ln in enumerate(lines):
        h = ZONE_HDR.match(ln)
        if h:
            cur = h.group(1); zones[cur] = []
        elif cur and CRIT_LINE.search(ln) and LABEL_EN.search(ln):
            zones[cur].append(i)

    zname = {}
    # zone display name: reuse id; the model gets enough from the labels + id
    for zid, idxs in zones.items():
        if only and zid != only:
            continue
        items = []
        for i in idxs:
            cid = CRIT_LINE.search(lines[i]).group(1)
            en = decode_js_str(LABEL_EN.search(lines[i]).group(2))
            items.append({"id": cid, "en": en})
        print(f"[{zid}] {len(items)} items -> claude ...", flush=True)
        # Retry until every id is covered (the model occasionally drops some).
        mapping, need = {}, [it for it in items]
        for attempt in range(4):
            if not need:
                break
            try:
                got = ask_claude(zid, need)
            except Exception as e:
                print(f"  retry {attempt+1}: {e}"); continue
            for k, v in got.items():
                if isinstance(v, dict) and v.get("en") and v.get("hi"):
                    mapping[k] = v
            need = [it for it in items if it["id"] not in mapping]
            if need:
                print(f"  retry {attempt+1}: still missing {[it['id'] for it in need]}")
        if need:
            print(f"  ERROR {zid}: gave up on {[it['id'] for it in need]}")
        for i in idxs:
            cid = CRIT_LINE.search(lines[i]).group(1)
            m = mapping.get(cid)
            if not m:
                print(f"  WARN {zid}/{cid} missing in response"); continue
            lines[i] = LABEL_EN.sub(lambda mo: mo.group(1) + encode_js_str(m["en"]) + mo.group(3), lines[i], count=1)
            lines[i] = LABEL_HI.sub(lambda mo: mo.group(1) + encode_js_str(m["hi"]) + mo.group(3), lines[i], count=1)
        print(f"  {zid} done")

    with open(SRC, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("written", SRC)

if __name__ == "__main__":
    main()
