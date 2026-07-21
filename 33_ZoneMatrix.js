// ============================================================================
// 33_ZoneMatrix.js — per-zone records matrix
// ----------------------------------------------------------------------------
// Criteria (rows) x audit dates (columns), cells = per-criterion score from
// AuditLineItems. Cells that carry an NC/CAPA are flagged for highlight + modal.
// Red Tags are zone-level (no criterion) so they surface as a header indicator.
// ============================================================================

function _zmDate_(v, tz) {
  return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : (v ? String(v).slice(0, 10) : '');
}

/**
 * Build the matrix for one zone. Called by ZoneMatrix.html via google.script.run.
 * @param {string} zoneId
 * @param {number} [maxDates] most-recent audit dates to show (default 14)
 */
function getZoneMatrix(zoneId, maxDates) {
  return v2SafeExecute_(function () {
    maxDates = maxDates || 14;
    var ss = v2GetSpreadsheet_();
    var tz = (typeof TZ !== 'undefined' && TZ) ? TZ : 'Asia/Kolkata';

    // Rows: criteria from the same config QuickAudit uses
    var cfg = getQuickAuditConfig(zoneId) || {};
    var criteria = (cfg.criteria || []).map(function (c) {
      return { id: String(c.criterionId || ''), pillar: String(c.pillar || ''),
               label: String(c.label || ''), labelHi: String(c.labelHi || '') };
    });

    // Scores: AuditLineItems -> cells[cid][date]
    var cells = {}, dateSet = {};
    var ali = ss.getSheetByName('AuditLineItems');
    if (ali && ali.getLastRow() > 1) {
      var d = ali.getDataRange().getValues(); // cols: 0 sub,1 zone,2 name,3 ts,4 auditor,5 cid,6 pillar,7 score,8 remark,9 photo
      for (var i = 1; i < d.length; i++) {
        if (String(d[i][1]).trim() !== zoneId) continue;
        var dateStr = _zmDate_(d[i][3], tz);
        if (!dateStr) continue;
        var cid = String(d[i][5]).trim();
        dateSet[dateStr] = true;
        (cells[cid] = cells[cid] || {})[dateStr] = {
          score: (d[i][7] === '' || d[i][7] == null) ? null : Number(d[i][7]),
          remark: String(d[i][8] || ''),
          photo: String(d[i][9] || ''),
          by: String(d[i][4] || '')
        };
      }
    }

    // Most-recent N dates, chronological
    var dates = Object.keys(dateSet).sort().reverse().slice(0, maxDates).reverse();
    var keepDate = {}; dates.forEach(function (x) { keepDate[x] = true; });

    // NC/CAPA -> flag matching cells (match by exact criterion id, else by pillar) on the same date
    var nc = ss.getSheetByName('NC_CAPA');
    if (nc && nc.getLastRow() > 1) {
      var n = nc.getDataRange().getValues();
      for (var j = 1; j < n.length; j++) {
        if (String(n[j][NC_COL.ZONE_ID]).trim() !== zoneId) continue;
        var status = String(n[j][NC_COL.STATUS] || '').trim().toUpperCase();
        if (status === 'DELETED') continue;
        var ncDate = _zmDate_(n[j][NC_COL.AUDIT_DATE], tz);
        if (!keepDate[ncDate]) continue;
        var key = String(n[j][NC_COL.PILLAR] || '').trim(); // holds criterion id (e.g. S1-C1) or pillar (S1)
        var info = {
          ncId: String(n[j][NC_COL.NC_ID]), status: status,
          desc: String(n[j][NC_COL.DESCRIPTION] || ''),
          responsible: String(n[j][NC_COL.RESPONSIBLE] || ''),
          target: _zmDate_(n[j][NC_COL.TARGET_DATE], tz)
        };
        criteria.forEach(function (c) {
          if (c.id !== key && c.pillar !== key) return;
          var cell = (cells[c.id] = cells[c.id] || {})[ncDate];
          if (!cell) cell = cells[c.id][ncDate] = { score: null };
          (cell.ncs = cell.ncs || []).push(info);
        });
      }
    }

    // Tasks -> attach to the cell whose criterion matches SOURCE_REF (set by QuickAudit),
    // falling back to a pillar match, on the task's creation date.
    var tb = ss.getSheetByName('TaskBoard');
    if (tb && tb.getLastRow() > 1) {
      var t = tb.getDataRange().getValues();
      for (var m = 1; m < t.length; m++) {
        if (String(t[m][TASK_COL.ZONE_ID]).trim() !== zoneId) continue;
        var tStatus = String(t[m][TASK_COL.STATUS] || '').trim().toUpperCase();
        if (tStatus === 'DELETED') continue;
        var tDate = _zmDate_(t[m][TASK_COL.CREATED], tz);
        if (!keepDate[tDate]) continue;
        var tKey = String(t[m][TASK_COL.SOURCE_REF] || '').trim();
        if (!tKey) continue;
        var tInfo = {
          taskId: String(t[m][TASK_COL.TASK_ID]), status: tStatus,
          title: String(t[m][TASK_COL.TITLE] || ''),
          owner: String(t[m][TASK_COL.ASSIGNED_TO] || ''),
          due: _zmDate_(t[m][TASK_COL.DUE_DATE], tz)
        };
        criteria.forEach(function (c) {
          if (c.id !== tKey && c.pillar !== tKey) return;
          var cellT = (cells[c.id] = cells[c.id] || {})[tDate];
          if (!cellT) cellT = cells[c.id][tDate] = { score: null };
          (cellT.tasks = cellT.tasks || []).push(tInfo);
        });
      }
    }

    // Red tags: open ones, zone-level indicator
    var redTags = [];
    var rt = ss.getSheetByName('RedTagRegister');
    if (rt && rt.getLastRow() > 1) {
      var r = rt.getDataRange().getValues();
      for (var k = 1; k < r.length; k++) {
        if (String(r[k][RT_COL.ZONE_ID]).trim() !== zoneId) continue;
        var rs = String(r[k][RT_COL.STATUS] || '').trim().toUpperCase();
        if (rs === 'CLOSED' || rs === 'DISPOSED' || rs === 'DELETED') continue;
        var rtInfo = {
          tagId: String(r[k][RT_COL.TAG_ID]), item: String(r[k][RT_COL.ITEM_DESC] || ''), status: rs,
          owner: String(r[k][RT_COL.OWNER] || ''), deadline: _zmDate_(r[k][RT_COL.DEADLINE], tz)
        };
        redTags.push(rtInfo);
        // RedTagRegister has no criterion reference column, so a red tag can only be
        // matched to the audit date, not to a specific parameter. Attach it to every
        // scored cell on that date so it surfaces in the parameter detail sheet.
        var rtDate = _zmDate_(r[k][RT_COL.CREATED], tz);
        if (!keepDate[rtDate]) continue;
        criteria.forEach(function (c) {
          var cellR = (cells[c.id] || {})[rtDate];
          if (!cellR) return;   // only annotate parameters actually scored that day
          (cellR.redTags = cellR.redTags || []).push(rtInfo);
        });
      }
    }

    return {
      success: true, zoneId: zoneId, zoneName: v2GetZoneName_(zoneId),
      criteria: criteria, dates: dates, cells: cells, redTags: redTags
    };
  }, 'getZoneMatrix:' + zoneId, { success: false, message: 'Error building matrix', criteria: [], dates: [], cells: {}, redTags: [] });
}
