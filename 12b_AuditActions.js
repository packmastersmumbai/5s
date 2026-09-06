/**
 * Actions arising from one audit.
 *
 * An audit records what was wrong; the NCs, tasks and red tags record what was
 * done about it. Nothing joined the two, so a closed audit and an audit whose
 * every finding is still open looked identical on screen — the record could not
 * answer the only question worth asking of it a week later: did anything happen?
 *
 * There is no audit_id foreign key on any of the three action sheets, and
 * adding one would not backfill the 252 records already written. The join is
 * therefore reconstructed from what each row does carry:
 *
 *   Task    SOURCE='AUDIT' + SOURCE_REF=<criterionId>  + zone + created date
 *   NC      zone + audit_date + criterion_id
 *   RedTag  zone + created date            (carries no criterion)
 *
 * Date matching is deliberately a same-day window rather than an equality test:
 * NC.audit_date is a date, the audit's timestamp is a datetime, and a task
 * raised from the audit form is written seconds later but can cross midnight on
 * a late shift. A one-day tolerance either side keeps those together without
 * pulling in the next week's actions.
 */

/** Local midnight for any date-ish value; null when unparseable. */
function _aaDay_(v) {
  if (!v) return null;
  var d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole days between two day-stamps. */
function _aaDayGap_(a, b) {
  if (a === null || b === null) return 9999;
  return Math.abs(a - b) / 86400000;
}

/* One status vocabulary for three sheets that each spell it differently.
   Returns the key the UI colours by, never the raw sheet value. */
function _aaStatus_(raw) {
  var s = String(raw || '').trim().toUpperCase();
  if (!s) return 'open';
  if (s === 'CLOSED' || s === 'DONE' || s === 'COMPLETED' ||
      s === 'DISPOSED' || s === 'VERIFIED') return 'closed';
  if (s === 'IN_PROGRESS' || s === 'IMPLEMENTING' || s === 'APPROVED' ||
      s === 'IN PROGRESS' || s === 'REVIEW') return 'progress';
  if (s === 'DELETED') return 'deleted';
  return 'open';
}

/**
 * Actions traceable to one audit submission.
 *
 * @param {string} submissionId  AuditLineItems SUBMISSION_ID
 * @returns {Object} { actions: [...], byCriterion: {critId: [...]}, summary: {...} }
 */
function getAuditActions(submissionId) {
  return v2SafeExecute_(function () {
    var ss = v2GetSpreadsheet_();
    var out = { actions: [], byCriterion: {}, summary: { open: 0, progress: 0, closed: 0, total: 0 } };
    if (!submissionId) return out;

    // ── Anchor: the audit's own zone and day ──────────────────────────────
    var ali = v2LoadSheet_(ss, 'AuditLineItems');
    var zoneId = '', auditDay = null, criteria = {};
    for (var r = 1; r < ali.length; r++) {
      if (String(ali[r][0]).trim() !== String(submissionId).trim()) continue;
      zoneId = String(ali[r][1] || '').trim();
      if (auditDay === null) auditDay = _aaDay_(ali[r][3]);
      var cid = String(ali[r][5] || '').trim();
      if (cid) criteria[cid] = 1;
    }
    if (!zoneId || auditDay === null) return out;

    function push(a) {
      out.actions.push(a);
      if (a.state !== 'deleted') {
        out.summary.total++;
        out.summary[a.state === 'closed' ? 'closed' : a.state === 'progress' ? 'progress' : 'open']++;
      }
      var key = a.criterionId || '_zone';
      (out.byCriterion[key] = out.byCriterion[key] || []).push(a);
    }

    // ── Tasks: the only sheet with an explicit audit link ─────────────────
    var td = v2LoadSheet_(ss, 'TaskBoard');
    for (var t = 1; t < td.length; t++) {
      var row = td[t];
      if (!row[TASK_COL.TASK_ID]) continue;
      if (String(row[TASK_COL.SOURCE] || '').toUpperCase() !== 'AUDIT') continue;
      if (String(row[TASK_COL.ZONE_ID] || '').trim() !== zoneId) continue;
      if (_aaDayGap_(_aaDay_(row[TASK_COL.CREATED]), auditDay) > 1) continue;
      var tRef = String(row[TASK_COL.SOURCE_REF] || '').trim();
      /* SOURCE_REF is the criterion this task came from. If the audit never
         scored that criterion the row belongs to a different audit of the same
         zone on the same day — rare, but it would attribute someone else's
         action to this record. */
      if (tRef && !criteria[tRef]) continue;
      push({
        kind: 'TASK', id: String(row[TASK_COL.TASK_ID]),
        criterionId: tRef,
        title: String(row[TASK_COL.TITLE] || ''),
        owner: String(row[TASK_COL.ASSIGNED_TO] || ''),
        state: _aaStatus_(row[TASK_COL.STATUS]),
        rawStatus: String(row[TASK_COL.STATUS] || ''),
        updated: row[TASK_COL.UPDATED] || row[TASK_COL.CREATED] || '',
        remark: String(row[TASK_COL.REMARKS] || ''),
        photos: String(row[TASK_COL.PHOTO_URL] || '').split(',').filter(Boolean)
      });
    }

    // ── NCs: zone + audit_date + criterion ────────────────────────────────
    var nd = v2LoadSheet_(ss, 'NC_CAPA');
    for (var n = 1; n < nd.length; n++) {
      var nr = nd[n];
      if (!nr[NC_COL.NC_ID]) continue;
      if (String(nr[NC_COL.ZONE_ID] || '').trim() !== zoneId) continue;
      if (_aaDayGap_(_aaDay_(nr[NC_COL.AUDIT_DATE]), auditDay) > 1) continue;
      var nRef = String(nr[NC_COL.CRITERION_ID] || '').trim();
      push({
        kind: 'NC', id: String(nr[NC_COL.NC_ID]),
        criterionId: nRef,
        title: String(nr[NC_COL.DESCRIPTION] || ''),
        owner: String(nr[NC_COL.RESPONSIBLE] || ''),
        state: _aaStatus_(nr[NC_COL.STATUS]),
        rawStatus: String(nr[NC_COL.STATUS] || ''),
        updated: nr[NC_COL.CLOSURE_DATE] || nr[NC_COL.CREATED_DATE] || '',
        /* The most recent thing anyone wrote about it, in the order a reader
           wants it: what was verified, else what was done, else the cause. */
        remark: String(nr[NC_COL.VERIFICATION_REMARKS] || '') ||
                String(nr[NC_COL.CORRECTIVE_ACTION] || '') ||
                String(nr[NC_COL.ROOT_CAUSE] || ''),
        photos: String(nr[NC_COL.PHOTO_URL] || '').split(',').filter(Boolean)
      });
    }

    // ── Red tags: zone + day only; no criterion is recorded ───────────────
    var rd = v2LoadSheet_(ss, 'RedTagRegister');
    for (var g = 1; g < rd.length; g++) {
      var gr = rd[g];
      if (!gr[RT_COL.TAG_ID]) continue;
      if (String(gr[RT_COL.ZONE_ID] || '').trim() !== zoneId) continue;
      if (_aaDayGap_(_aaDay_(gr[RT_COL.CREATED]), auditDay) > 1) continue;
      push({
        kind: 'RED_TAG', id: String(gr[RT_COL.TAG_ID]),
        criterionId: '',
        title: String(gr[RT_COL.ITEM_DESC] || ''),
        owner: String(gr[RT_COL.OWNER] || ''),
        state: _aaStatus_(gr[RT_COL.STATUS]),
        rawStatus: String(gr[RT_COL.STATUS] || ''),
        updated: gr[RT_COL.DISPOSED_DATE] || gr[RT_COL.CREATED] || '',
        remark: String(gr[RT_COL.REVIEW_NOTES] || '') || String(gr[RT_COL.REMARKS] || ''),
        photos: String(gr[RT_COL.PHOTO_URL] || '').split(',').filter(Boolean)
      });
    }

    /* Newest first: the latest response is the one the reader came for. */
    out.actions.sort(function (a, b) {
      return (_aaDay_(b.updated) || 0) - (_aaDay_(a.updated) || 0);
    });
    return out;
  }, 'getAuditActions', { actions: [], byCriterion: {}, summary: { open: 0, progress: 0, closed: 0, total: 0 } });
}
