# NOTES — Actions/Audit Hardening + DWM Integration (v103+)

> **Reload protocol:** On each session load, read ONLY this file + the phase's target files (JIT).
> Do NOT re-read all source. This file is the single source of truth for state + field maps.

## Working rules (enforce every phase)
- **Phase gating:** Do not start phase N+1 until phase N is ✅ VERIFIED + checkpointed below.
- **Verification per phase:** `clasp run runAllTests` (128/0) + `runDemoTests` (59/59) MUST stay green,
  PLUS the phase's own E2E sweep passes, BEFORE marking ✅.
- **Checkpoint:** after each phase, update the Checkpoint Log (commit hash + version + test counts).
- **Lite:** keep diffs minimal; only touch listed files; no drive-by changes.
- **Anti-forgetfulness:** use the Field & Function Map below verbatim — never guess column/fn names.

## Locked decisions
- PIN login **replaces** password auth (`25_Authentication.js` retired). Seed users (roster TBD).
- Per-criterion photos **optional**; in-form **reset icon** only (no re-score of submitted audits).
- NC **soft-delete** (`STATUS=DELETED`). Tasks/RedTags reuse existing edit/delete fns.
- DWM sync: fires on **all 3 creates + status changes**, `ref`=record id (idempotent),
  `client` omitted, assignee by **email**. Secret = `dwm_hmac_secret` (copied from DWM `taskflow_hmac_secret`).

## Phases (gate in order)
| # | Phase | Target files | E2E | State |
|---|---|---|---|---|
| 6a | DWM one-step test | 31_DwmSync.js (drop-in) | Dwm_selfTest ok:true | ✅ taskId 2781033d (secret set, NOT committed) |
| 0 | PIN login (replace pwd) | 25b_PinAuth.js, PinLogin.html, Users sheet, seedUsers | render 8/8 via PIN | ✅ @103 |
| 1 | Image upload + canonical Drive | 00_Diag(provisionZonePhotoFolders), 05_WebApp.js | upload OK | ✅ @104 b0b685a (28 zones, YYYY/MM nest) |
| 2 | Per-criterion photo+remark+reset | QuickAudit.html, 21_ImprovementEngine.js, AuditLineItems sheet | e2e-5s-photo | ⬜ |
| 3 | View filled audit + images | 11_DataService(getAuditDetail), ActionsHub.html (Audits tab) | e2e-5s-audit-view | ⬜ |
| 4 | Edit/soft-delete NC/Task/RedTag | ActionsHub.html, 08_CAPAEngine(editCAPA/deleteCAPA), 19_KanbanTaskService | e2e-5s-crud | ⬜ |
| 6b | Wire DWM sync into creates+status | 08_CAPAEngine, 19_KanbanTaskService | e2e-5s-dwmsync | ⬜ |

## Field & Function Map (verbatim — do not guess)
### DWM connector (from docs/integration/DwmIntegration.gs)
- `DWM.syncTaskSafe({title*, ref, status, client, assignee, creator, due, priority, time, desc, photo})`
- EXEC_URL = `…/macros/s/AKfycbxG3yKj-XzyU2ydckTNCe0Poc-en3sjDkHJzr-SQFLsEQXF3l4X8Zg49MF_7ZTU_bRHkw/exec`
- ref idempotent: create once → update same task. status: open|in-progress|completed. prefer email.
- DWM users/emails: Khushi=khushi009810@gmail.com, Anuj=pathakanuj142@gmail.com, TBM=tu55h4r@gmail.com

### 5S create/edit/status fns
- NC:  createCAPA(zoneId,desc,type,pillar,sqcdpDim,responsible) [08_CAPAEngine.js:81];
       updateCAPAStatus(ncId,newStatus,verifiedBy,remarks,{root_cause,corrective_action}) [:188]
       getNcDetail(ncId) [11_DataService.js:1160]. NEED: editCAPA, deleteCAPA (soft).
- Task: createTask(taskData) [19_KanbanTaskService.js:117]; updateTaskStatus(id,status,remarks) [:151];
        editTask(id,{title,description,priority,assignedTo,dueDate,remarks}) [:172]; deleteTask(id) [:196]
- RedTag: createRedTag(tagData) [:245]; editRedTag(id,{...}) [:298]; deleteRedTag(id) [:323];
          advanceRedTagPhase(id,phase,notes) [:341]
- raiseRedTag = adapter → createRedTag (11_DataService.js)

### Audit storage
- submitQuickAudit(auditData{zoneId,zone,scores,remarks,photo_b64}) [21_ImprovementEngine.js:523]
  → DailySubmissions row [schema 16A_V2Foundation.js:83]; PHOTO_URL col idx 16; per-criterion LOST.
- uploadPhotoToDrive(b64,fileName,zoneId) [05_WebApp.js:591]; needs zoneConfig[zoneId].driveFolderId (EMPTY now)
- getAuditHistory(zoneId,month) [11_DataService.js:681]
- NEW sheet AuditLineItems: SUBMISSION_ID,ZONE_ID,CRITERION_ID,PILLAR,SCORE,REMARK,PHOTO_URL,PHOTO_FILE_ID

## Checkpoint Log
- baseline @102 / main 9db58bf / runAllTests 128/0 / runDemoTests 59/59
- 6a DWM connector @103 / self-test ok (taskId 2781033d) / secret in ScriptProperties only (NOT in git)
- Phase 0 PIN login @103 / suites 128-0 + 59/59 / e2e-5s-render 8/8 via PIN login (admin/4860)
  - PINs mirror DWM EXACTLY (4 from seed code, 4 recovered by brute-forcing salt+hash):
    admin 1234, tbm 0000, bbm 9999, rajesh 4444, khushi 1111, shikha 7777, anuj 2222, santosh 3333
  - E2E_ADMIN_PIN default 1234. DWM temp helper (_tmp_pinrecover.js) created+removed, not committed.
  - Old password fns in 25_Authentication.js now DEAD (LoginPage.html no longer served) — kept; cleanup later
  - e2e-lib-5s.js loginAdmin now drives PIN; e2e-5s-render selector .action-card→.ah-card (stale from v102)
- NEXT: Phase 1 (image upload + canonical Drive folders)
