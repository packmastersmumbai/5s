/**
 * ============================================================================
 * 19_KanbanTaskService.gs — PackMasters 5S v2.0 (FIXED)
 * CRUD for: Kanban CAPA, TaskBoard, RedTag, Kaizen, GembaWalk, WDGLL, Skills
 * ============================================================================
 * DEPENDS ON: 16A_V2Foundation.gs (constants, profiler, error framework)
 * FIXES: F-01,F-02,F-03,F-04,F-05,F-06,F-07,F-10,F-11,F-17,F-19
 */

// ── CAPA KANBAN ──

function updateCAPAKanbanStatus(ncId, newStatus, remarks) {
  return v2SafeExecute_(function() {
    if (!v2CheckPermission_('UPDATE_CAPA', Session.getActiveUser().getEmail())) {
      throw new Error('Permission denied: requires ZONE_LEAD role or above');
    }
    var ss = v2GetSpreadsheet_();
    var sheet = ss.getSheetByName("NC_CAPA");
    if (!sheet) return { success: false, message: "NC_CAPA sheet not found." };
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][NC_COL.NC_ID]).trim() === ncId) {
        var updates = {};
        updates[NC_COL.STATUS] = newStatus;
        if (remarks) {
          var existing = String(data[r][NC_COL.VERIFICATION_REMARKS] || "");
          updates[NC_COL.VERIFICATION_REMARKS] = existing + (existing ? " | " : "") + "[" + v2FormatDate_(new Date(), "dd-MMM HH:mm") + "] " + remarks;
        }
        if (newStatus === STATUS.CLOSED) {
          updates[NC_COL.CLOSURE_DATE] = new Date();
          updates[NC_COL.VERIFIED_BY] = v2GetCurrentUser_();
        }
        v2BatchUpdateRow_(sheet, r + 1, updates, data[r]);
        return { success: true, message: "CAPA " + ncId + " → " + newStatus };
      }
    }
    return { success: false, message: "NC ID not found: " + ncId };
  }, "updateCAPAKanbanStatus:" + ncId, { success: false, message: "Server error." });
}

function getCAPAKanbanData(filters) {
  return v2SafeExecute_(function() {
    filters = filters || {};
    var ss = v2GetSpreadsheet_();
    var data = v2LoadSheet_(ss, "NC_CAPA");
    if (data.length <= 1) return [];
    var now = new Date();
    var results = [];
    for (var r = 1; r < data.length; r++) {
      if (!data[r][NC_COL.NC_ID]) continue;
      var zoneId = String(data[r][NC_COL.ZONE_ID]).trim();
      var criterionId = String(data[r][NC_COL.CRITERION_ID]).trim();
      var pillar = v2ExtractPillar_(criterionId);
      var status = String(data[r][NC_COL.STATUS]).trim().toUpperCase();
      if (status === STATUS.DELETED) continue;
      if (filters.zoneId && zoneId !== filters.zoneId) continue;
      if (filters.pillar && pillar !== filters.pillar) continue;
      if (filters.assignee && String(data[r][NC_COL.RESPONSIBLE]).indexOf(filters.assignee) === -1) continue;
      var targetDate = data[r][NC_COL.TARGET_DATE] instanceof Date ? data[r][NC_COL.TARGET_DATE] : null;
      var isOverdue = targetDate && targetDate < now && status !== STATUS.CLOSED;
      if (filters.showOverdueOnly && !isOverdue) continue;
      var ageDays = 0;
      if (data[r][NC_COL.CREATED] instanceof Date) ageDays = Math.floor((now - data[r][NC_COL.CREATED]) / 86400000);
      results.push({
        ncId: String(data[r][NC_COL.NC_ID]), createdDate: v2FormatDate_(data[r][NC_COL.CREATED]),
        zoneId: zoneId, zoneName: String(data[r][NC_COL.ZONE_NAME] || ""),
        pillar: pillar, criterionId: criterionId,
        criterionLabel: String(data[r][NC_COL.CRITERION_LABEL] || ""),
        score: data[r][NC_COL.SCORE], responsible: String(data[r][NC_COL.RESPONSIBLE] || ""),
        targetDate: v2FormatDate_(targetDate), status: status,
        rootCause: String(data[r][NC_COL.ROOT_CAUSE] || ""),
        correctiveAction: String(data[r][NC_COL.CORRECTIVE_ACTION] || ""),
        ageDays: ageDays, isOverdue: isOverdue
      });
    }
    return results;
  }, "getCAPAKanbanData", [], "medium");
}

// ── QUICK ACTION LOGGING ──

function logQuickAction(itemType, zoneId, description) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_(), adminLog = ss.getSheetByName("AdminLog");
    if (!adminLog) {
      Logger.log("Warning: AdminLog sheet not found");
      return { success: true }; // Non-blocking
    }

    var userId = v2GetCurrentUser_();
    var now = new Date();
    var shortDesc = description.substring(0, 80);

    try {
      adminLog.appendRow([
        now,
        userId,
        "QUICK_CREATE",
        "Type=" + itemType + " | Zone=" + zoneId + " | Desc=" + shortDesc,
        JSON.stringify({
          type: itemType,
          zone: zoneId,
          description: description.substring(0, 200)
        }),
        "ACTION"
      ]);
    } catch (e) {
      Logger.log("Error logging quick action: " + e.message);
    }

    return { success: true };
  }, "logQuickAction", { success: false });
}

// ── TASK BOARD ──

function createTask(taskData) {
  return v2SafeExecute_(function() {
    var v = v2ValidateInput_(taskData, {
      title: { required: true, type: "string", maxLen: 200 },
      description: { required: false, type: "string", maxLen: 1000 },
      zoneId: { required: true, type: "zoneId" },
      priority: { required: false, type: "string", maxLen: 20, defaultVal: PRIORITY.MEDIUM },
      assignedTo: { required: false, type: "string", maxLen: 100 },
      dueDate: { required: false, type: "string", maxLen: 20 },
      source: { required: false, type: "string", maxLen: 50, defaultVal: "MANUAL" },
      sourceRefId: { required: false, type: "string", maxLen: 50 }
    });
    if (!v.valid) return { success: false, taskId: "", message: v.errors.join("; ") };
    var d = v.data, ss = v2GetSpreadsheet_();
    var sheet = ss.getSheetByName("TaskBoard");
    if (!sheet) return { success: false, taskId: "", message: "TaskBoard sheet not found." };
    var taskId = generateTaskId_(), now = new Date();
    var row = [];
    row[TASK_COL.TASK_ID] = taskId; row[TASK_COL.CREATED] = now;
    row[TASK_COL.ZONE_ID] = d.zoneId; row[TASK_COL.ZONE_NAME] = v2GetZoneName_(d.zoneId);
    row[TASK_COL.TITLE] = d.title; row[TASK_COL.DESCRIPTION] = d.description || "";
    row[TASK_COL.CATEGORY] = "5S"; row[TASK_COL.PRIORITY] = d.priority || PRIORITY.MEDIUM;
    row[TASK_COL.SOURCE] = d.source || "MANUAL"; row[TASK_COL.SOURCE_REF] = d.sourceRefId || "";
    // Store a real Date due-date so overdue detection (5S daily reminder grid +
    // DWM due-soon engine) actually fires. Default when none supplied: high/urgent
    // +1 day, low +7, else +3 — so every synced action becomes reminder-eligible.
    var dueObj = null;
    if (d.dueDate) { var pd = new Date(d.dueDate); if (!isNaN(pd.getTime())) dueObj = pd; }
    if (!dueObj) {
      var pr = String(d.priority || "").toLowerCase();
      var days = (pr === "high" || pr === "urgent") ? 1 : (pr === "low" ? 7 : 3);
      dueObj = new Date(now.getTime() + days * 86400000);
    }
    row[TASK_COL.ASSIGNED_TO] = d.assignedTo || ""; row[TASK_COL.DUE_DATE] = dueObj;
    row[TASK_COL.STATUS] = STATUS.BACKLOG; row[TASK_COL.UPDATED] = now;
    row[TASK_COL.CLOSED_DATE] = ""; row[TASK_COL.CLOSED_BY] = "";
    row[TASK_COL.REMARKS] = ""; row[TASK_COL.PHOTO_URL] = "";
    sheet.appendRow(row);
    // ✅ CACHE INVALIDATION: Clear dependent caches
    if (typeof invalidateTaskCache_ === "function") invalidateTaskCache_(d.zoneId);
    try { var c = CacheService.getScriptCache(); c.remove("pm5s_tasks_ALL_ALL"); c.remove("pm5s_tasks_" + d.zoneId + "_ALL"); } catch(e) {}
    if (typeof DWM !== "undefined") {
      DWM.syncTaskSafe({ title: d.title, ref: taskId, status: "open",
        assignee: (typeof dwmResolveUser_ === "function") ? dwmResolveUser_(d.assignedTo) : (d.assignedTo || ""),
        creator: (typeof dwmResolveUser_ === "function") ? dwmResolveUser_(taskData.createdBy) : "",
        due: Utilities.formatDate(dueObj, TZ, "yyyy-MM-dd"), priority: d.priority || "medium",
        desc: (d.description || "") + " · 5S task " + taskId + " · zone " + d.zoneId });
    }
    if (typeof tg5sBroadcast_ === "function") {
      tg5sBroadcast_(_tg5sCard_({
        icon: "🗒️", kind: "Task", id: taskId, link: _tg5sDeep_('?v2=1&action=record&type=task&id=' + taskId),
        zoneId: d.zoneId, zoneName: v2GetZoneName_(d.zoneId),
        facts: [
          "📌 " + TelegramLib.esc(d.title),
          "👤 " + TelegramLib.esc(d.assignedTo || "Unassigned") + " · ⚡ " + TelegramLib.esc(d.priority || "medium") +
            " · 📅 " + Utilities.formatDate(dueObj, TZ, "dd-MMM")
        ],
        action: "complete & mark done",
        by: taskData.createdBy || "5S"
      }), [{ text: "🗒️ Open record", url: _tg5sDeep_('?v2=1&action=record&type=task&id=' + taskId) }]);
    }
    return { success: true, taskId: taskId, message: "Task created." };
  }, "createTask", { success: false, taskId: "", message: "Server error." });
}

function updateTaskStatus(taskId, newStatus, remarks) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("TaskBoard");
    if (!sheet) return { success: false, message: "TaskBoard sheet not found." };
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][TASK_COL.TASK_ID]).trim() === taskId) {
        var updates = {};
        updates[TASK_COL.STATUS] = newStatus;
        updates[TASK_COL.UPDATED] = new Date();
        if (newStatus === STATUS.DONE) { updates[TASK_COL.CLOSED_DATE] = new Date(); updates[TASK_COL.CLOSED_BY] = v2GetCurrentUser_(); }
        if (remarks) updates[TASK_COL.REMARKS] = remarks;
        v2BatchUpdateRow_(sheet, r + 1, updates, data[r]);
        try { var c = CacheService.getScriptCache(), z = String(data[r][TASK_COL.ZONE_ID]).trim(); c.remove("pm5s_tasks_ALL_ALL"); c.remove("pm5s_tasks_" + z + "_ALL"); } catch(e) {}
        if (typeof DWM !== "undefined") {
          DWM.syncTaskSafe({ title: String(data[r][TASK_COL.TITLE] || "Task"), ref: taskId,
            status: (newStatus === STATUS.DONE ? "completed" : newStatus === STATUS.IN_PROGRESS ? "in-progress" : "open") });
        }
        if (newStatus === STATUS.DONE && typeof tg5sBroadcast_ === "function") {
          tg5sBroadcast_("✔️ <b>Task done</b> · " + String(data[r][TASK_COL.ZONE_ID]).trim() +
            " — " + String(data[r][TASK_COL.TITLE] || taskId) + " by " + v2GetCurrentUser_(),
            [{ text: "🗒️ Open record", url: _tg5sDeep_('?v2=1&action=record&type=task&id=' + taskId) }]);
        }
        return { success: true, message: "Task " + taskId + " → " + newStatus };
      }
    }
    return { success: false, message: "Task not found: " + taskId };
  }, "updateTaskStatus:" + taskId, { success: false, message: "Server error." });
}

function editTask(taskId, updates) {
  return v2SafeExecute_(function() {
    updates = updates || {};
    var ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("TaskBoard");
    if (!sheet) return { success: false, message: "TaskBoard sheet not found." };
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][TASK_COL.TASK_ID]).trim() !== taskId) continue;
      var editable = {};
      editable[TASK_COL.UPDATED] = new Date();
      if (updates.title !== undefined) editable[TASK_COL.TITLE] = String(updates.title).substring(0, 200);
      if (updates.description !== undefined) editable[TASK_COL.DESCRIPTION] = String(updates.description).substring(0, 1000);
      if (updates.priority !== undefined) editable[TASK_COL.PRIORITY] = String(updates.priority).substring(0, 20);
      if (updates.assignedTo !== undefined) editable[TASK_COL.ASSIGNED_TO] = String(updates.assignedTo).substring(0, 100);
      if (updates.dueDate !== undefined) editable[TASK_COL.DUE_DATE] = updates.dueDate;
      if (updates.remarks !== undefined) editable[TASK_COL.REMARKS] = String(updates.remarks).substring(0, 500);
      v2BatchUpdateRow_(sheet, r + 1, editable, data[r]);
      try { var c = CacheService.getScriptCache(), z = String(data[r][TASK_COL.ZONE_ID]).trim(); c.remove("pm5s_tasks_ALL_ALL"); c.remove("pm5s_tasks_" + z + "_ALL"); } catch(e) {}
      // Sync edits (retitle / reassign / reschedule) to DWM — idempotent on ref.
      if (typeof DWM !== "undefined") {
        var _st = String(data[r][TASK_COL.STATUS] || "");
        var _title    = updates.title      !== undefined ? updates.title      : data[r][TASK_COL.TITLE];
        var _assignee = updates.assignedTo !== undefined ? updates.assignedTo : data[r][TASK_COL.ASSIGNED_TO];
        var _due      = updates.dueDate    !== undefined ? updates.dueDate     : data[r][TASK_COL.DUE_DATE];
        DWM.syncTaskSafe({
          title: String(_title || "Task"), ref: taskId,
          status: (_st === STATUS.DONE ? "completed" : _st === STATUS.IN_PROGRESS ? "in-progress" : "open"),
          assignee: (typeof dwmResolveUser_ === "function") ? dwmResolveUser_(_assignee) : (_assignee || ""),
          due: _due ? (typeof v2FormatDate_ === "function" ? v2FormatDate_(new Date(_due)) : String(_due)) : ""
        });
      }
      return { success: true, message: "Task " + taskId + " updated." };
    }
    return { success: false, message: "Task not found: " + taskId };
  }, "editTask:" + taskId, { success: false, message: "Server error." });
}

function deleteTask(taskId) {
  return v2SafeExecute_(function() {
    // Auth enforced at the route level (ActionsHub is role-gated). Consistent with
    // editTask/updateTaskStatus which also trust page-level auth (see follow-up #1).
    var ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("TaskBoard");
    if (!sheet) return { success: false, message: "TaskBoard sheet not found." };
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][TASK_COL.TASK_ID]).trim() !== taskId) continue;
      var updates = {};
      updates[TASK_COL.STATUS] = STATUS.DELETED;
      updates[TASK_COL.UPDATED] = new Date();
      updates[TASK_COL.CLOSED_BY] = v2GetCurrentUser_();
      v2BatchUpdateRow_(sheet, r + 1, updates, data[r]);
      try { var c = CacheService.getScriptCache(), z = String(data[r][TASK_COL.ZONE_ID]).trim(); c.remove("pm5s_tasks_ALL_ALL"); c.remove("pm5s_tasks_" + z + "_ALL"); } catch(e) {}
      return { success: true, message: "Task " + taskId + " deleted." };
    }
    return { success: false, message: "Task not found: " + taskId };
  }, "deleteTask:" + taskId, { success: false, message: "Server error." });
}

function getTaskBoardData(filters) {
  return v2SafeExecute_(function() {
    filters = filters || {};
    var cacheKey = "pm5s_tasks_" + (filters.zoneId || "ALL") + "_" + (filters.status || "ALL");
    try { var cached = CacheService.getScriptCache().get(cacheKey); if (cached) return JSON.parse(cached); } catch(e) {}
    var ss = v2GetSpreadsheet_(), data = v2LoadSheet_(ss, "TaskBoard");
    if (data.length <= 1) return [];
    var results = [];
    for (var r = 1; r < data.length; r++) {
      if (!data[r][TASK_COL.TASK_ID]) continue;
      var z = String(data[r][TASK_COL.ZONE_ID]).trim(), s = String(data[r][TASK_COL.STATUS]).trim();
      if (s === STATUS.DELETED) continue;
      if (filters.zoneId && z !== filters.zoneId) continue;
      if (filters.status && s !== filters.status) continue;
      results.push({ taskId: String(data[r][TASK_COL.TASK_ID]), createdDate: v2FormatDate_(data[r][TASK_COL.CREATED]),
        zoneId: z, zoneName: String(data[r][TASK_COL.ZONE_NAME] || ""), title: String(data[r][TASK_COL.TITLE] || ""),
        description: String(data[r][TASK_COL.DESCRIPTION] || ""), priority: String(data[r][TASK_COL.PRIORITY] || PRIORITY.MEDIUM),
        source: String(data[r][TASK_COL.SOURCE] || ""), assignedTo: String(data[r][TASK_COL.ASSIGNED_TO] || ""),
        dueDate: v2FormatDate_(data[r][TASK_COL.DUE_DATE]), status: s, remarks: String(data[r][TASK_COL.REMARKS] || "") });
    }
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(results), 300); } catch(e) {}
    return results;
  }, "getTaskBoardData", [], "low");
}

// ── RED TAG REGISTER ──

function createRedTag(tagData) {
  return v2SafeExecute_(function() {
    var v = v2ValidateInput_(tagData, {
      zoneId: { required: true, type: "zoneId" }, itemDescription: { required: true, type: "string", maxLen: 500 },
      itemCategory: { required: false, type: "string", maxLen: 50, defaultVal: "Other" },
      estimatedValue: { required: false, type: "number", defaultVal: 0 },
      proposedAction: { required: false, type: "string", maxLen: 50, defaultVal: "Discard" },
      owner: { required: false, type: "string", maxLen: 100 }, photoUrl: { required: false, type: "string", maxLen: 500 },
      remarks: { required: false, type: "string", maxLen: 500 }
    });
    if (!v.valid) return { success: false, tagId: "", message: v.errors.join("; ") };
    var d = v.data, ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("RedTagRegister");
    if (!sheet) return { success: false, tagId: "", message: "RedTagRegister sheet not found." };
    var tagId = generateRedTagId_(), now = new Date(), deadline = new Date(now.getTime() + 7 * 86400000);
    var row = [];
    row[RT_COL.TAG_ID] = tagId; row[RT_COL.CREATED] = now; row[RT_COL.ZONE_ID] = d.zoneId;
    row[RT_COL.ZONE_NAME] = v2GetZoneName_(d.zoneId); row[RT_COL.ITEM_DESC] = d.itemDescription;
    row[RT_COL.ITEM_CATEGORY] = d.itemCategory; row[RT_COL.EST_VALUE] = d.estimatedValue;
    row[RT_COL.PROPOSED_ACTION] = d.proposedAction; row[RT_COL.PHOTO_URL] = d.photoUrl || "";
    row[RT_COL.PHOTO_FILE_ID] = ""; row[RT_COL.TAGGED_BY] = v2GetCurrentUser_();
    row[RT_COL.OWNER] = d.owner || ""; row[RT_COL.DEADLINE] = deadline;
    row[RT_COL.DISPOSITION] = ""; row[RT_COL.DISPOSED_DATE] = ""; row[RT_COL.DISPOSED_BY] = "";
    row[RT_COL.REVIEW_NOTES] = ""; row[RT_COL.STATUS] = STATUS.IDENTIFIED; row[RT_COL.REMARKS] = d.remarks || "";
    sheet.appendRow(row);
    // ✅ CACHE INVALIDATION: Clear dependent caches
    if (typeof invalidateRedTagCache_ === "function") invalidateRedTagCache_(d.zoneId);
    try { var c = CacheService.getScriptCache(); c.remove("pm5s_redtags_ALL_ALL"); c.remove("pm5s_redtags_" + d.zoneId + "_ALL"); } catch(e) {}
    if (typeof DWM !== "undefined") {
      DWM.syncTaskSafe({ title: "Red Tag: " + d.itemDescription, ref: tagId, status: "open",
        assignee: (typeof dwmResolveUser_ === "function") ? dwmResolveUser_(d.owner) : (d.owner || ""),
        creator: (typeof dwmResolveUser_ === "function") ? dwmResolveUser_(tagData.createdBy) : "",
        due: v2FormatDate_(deadline),
        desc: (d.proposedAction || "") + " · 5S red tag " + tagId + " · zone " + d.zoneId, photo: true });
    }
    if (typeof tg5sBroadcast_ === "function") {
      tg5sBroadcast_(_tg5sCard_({
        icon: "🏷️", kind: "Red Tag", id: tagId, link: _tg5sDeep_('?v2=1&action=record&type=rt&id=' + tagId),
        zoneId: d.zoneId, zoneName: v2GetZoneName_(d.zoneId),
        facts: [
          "📦 " + TelegramLib.esc(d.itemDescription) + (d.itemCategory ? " · " + TelegramLib.esc(d.itemCategory) : ""),
          (d.owner ? "👤 " + TelegramLib.esc(d.owner) + " · " : "") + "🎯 " + TelegramLib.esc(d.proposedAction || "review & dispose")
        ],
        action: "review & dispose (48h)",
        by: (tagData && tagData.createdBy) || v2GetCurrentUser_()
      }), [{ text: "🏷️ Open record", url: _tg5sDeep_('?v2=1&action=record&type=rt&id=' + tagId) }]);
    }
    return { success: true, tagId: tagId, message: "Red Tag created." };
  }, "createRedTag", { success: false, tagId: "", message: "Server error." });
}

function updateRedTagStatus(tagId, newStatus, disposition, remarks) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("RedTagRegister");
    if (!sheet) return { success: false, message: "RedTagRegister sheet not found." };
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][RT_COL.TAG_ID]).trim() === tagId) {
        var updates = {};
        updates[RT_COL.STATUS] = newStatus;
        if (disposition) updates[RT_COL.DISPOSITION] = disposition;
        if (newStatus === STATUS.CLOSED) { updates[RT_COL.DISPOSED_DATE] = new Date(); updates[RT_COL.DISPOSED_BY] = v2GetCurrentUser_(); }
        if (remarks) updates[RT_COL.REMARKS] = remarks;
        v2BatchUpdateRow_(sheet, r + 1, updates, data[r]);
        // ✅ CACHE INVALIDATION: Clear dependent caches
        var zoneId = String(data[r][RT_COL.ZONE_ID]).trim();
        if (typeof invalidateRedTagCache_ === "function") invalidateRedTagCache_(zoneId);
        return { success: true, message: "Red Tag " + tagId + " → " + newStatus };
      }
    }
    return { success: false, message: "Red Tag not found: " + tagId };
  }, "updateRedTagStatus:" + tagId, { success: false, message: "Server error." });
}

function editRedTag(tagId, updates) {
  return v2SafeExecute_(function() {
    updates = updates || {};
    var ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("RedTagRegister");
    if (!sheet) return { success: false, message: "RedTagRegister sheet not found." };
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][RT_COL.TAG_ID]).trim() !== tagId) continue;
      var editable = {};
      if (updates.itemDescription !== undefined) editable[RT_COL.ITEM_DESC] = String(updates.itemDescription).substring(0, 500);
      if (updates.itemCategory !== undefined) editable[RT_COL.ITEM_CATEGORY] = String(updates.itemCategory).substring(0, 50);
      if (updates.estimatedValue !== undefined) editable[RT_COL.EST_VALUE] = parseFloat(updates.estimatedValue) || 0;
      if (updates.proposedAction !== undefined) editable[RT_COL.PROPOSED_ACTION] = String(updates.proposedAction).substring(0, 50);
      if (updates.owner !== undefined) editable[RT_COL.OWNER] = String(updates.owner).substring(0, 100);
      if (updates.deadline !== undefined) editable[RT_COL.DEADLINE] = updates.deadline ? new Date(updates.deadline) : "";
      if (updates.reviewNotes !== undefined) editable[RT_COL.REVIEW_NOTES] = String(updates.reviewNotes).substring(0, 500);
      if (updates.remarks !== undefined) editable[RT_COL.REMARKS] = String(updates.remarks).substring(0, 500);
      v2BatchUpdateRow_(sheet, r + 1, editable, data[r]);
      try { var c = CacheService.getScriptCache(), z = String(data[r][RT_COL.ZONE_ID]).trim(), s = String(data[r][RT_COL.STATUS]).trim(); c.remove("pm5s_redtags_ALL_ALL"); c.remove("pm5s_redtags_" + z + "_ALL"); c.remove("pm5s_redtags_" + z + "_" + s); } catch(e) {}
      // Sync edits (re-item / reassign / re-deadline) to DWM — idempotent on ref.
      if (typeof DWM !== "undefined") {
        var _item  = updates.itemDescription !== undefined ? updates.itemDescription : data[r][RT_COL.ITEM_DESC];
        var _owner = updates.owner           !== undefined ? updates.owner           : data[r][RT_COL.OWNER];
        var _dl    = updates.deadline        !== undefined ? updates.deadline         : data[r][RT_COL.DEADLINE];
        DWM.syncTaskSafe({
          title: "Red Tag: " + String(_item || tagId), ref: tagId, status: "open",
          assignee: (typeof dwmResolveUser_ === "function") ? dwmResolveUser_(_owner) : (_owner || ""),
          due: _dl ? (typeof v2FormatDate_ === "function" ? v2FormatDate_(new Date(_dl)) : String(_dl)) : ""
        });
      }
      return { success: true, message: "Red Tag " + tagId + " updated." };
    }
    return { success: false, message: "Red Tag not found: " + tagId };
  }, "editRedTag:" + tagId, { success: false, message: "Server error." });
}

function deleteRedTag(tagId) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("RedTagRegister");
    if (!sheet) return { success: false, message: "RedTagRegister sheet not found." };
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][RT_COL.TAG_ID]).trim() !== tagId) continue;
      var updates = {};
      updates[RT_COL.STATUS] = STATUS.DELETED;
      updates[RT_COL.DISPOSED_BY] = v2GetCurrentUser_();
      v2BatchUpdateRow_(sheet, r + 1, updates, data[r]);
      try { var c = CacheService.getScriptCache(), z = String(data[r][RT_COL.ZONE_ID]).trim(); c.remove("pm5s_redtags_ALL_ALL"); c.remove("pm5s_redtags_" + z + "_ALL"); } catch(e) {}
      return { success: true, message: "Red Tag " + tagId + " deleted." };
    }
    return { success: false, message: "Red Tag not found: " + tagId };
  }, "deleteRedTag:" + tagId, { success: false, message: "Server error." });
}

function advanceRedTagPhase(tagId, toPhase, notes) {
  var VALID_PHASES = [STATUS.IDENTIFIED, STATUS.EVALUATED, STATUS.DISPOSED, STATUS.CLOSED];
  if (VALID_PHASES.indexOf(toPhase) === -1) return { success: false, message: "Invalid phase: " + toPhase };
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("RedTagRegister");
    if (!sheet) return { success: false, message: "RedTagRegister sheet not found." };
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][RT_COL.TAG_ID]).trim() !== tagId) continue;
      var updates = {};
      updates[RT_COL.STATUS] = toPhase;
      if (notes) updates[RT_COL.REVIEW_NOTES] = String(notes).substring(0, 500);
      if (toPhase === STATUS.DISPOSED || toPhase === STATUS.CLOSED) {
        updates[RT_COL.DISPOSED_DATE] = new Date();
        updates[RT_COL.DISPOSED_BY] = v2GetCurrentUser_();
        if (notes) updates[RT_COL.DISPOSITION] = String(notes).substring(0, 500);
      }
      v2BatchUpdateRow_(sheet, r + 1, updates, data[r]);
      try { var c = CacheService.getScriptCache(), z = String(data[r][RT_COL.ZONE_ID]).trim(); c.remove("pm5s_redtags_ALL_ALL"); c.remove("pm5s_redtags_" + z + "_ALL"); } catch(e) {}
      if (typeof DWM !== "undefined") {
        DWM.syncTaskSafe({ title: "Red Tag: " + String(data[r][RT_COL.ITEM_DESC] || tagId), ref: tagId,
          status: (toPhase === STATUS.CLOSED || toPhase === STATUS.DISPOSED ? "completed" : toPhase === STATUS.EVALUATED ? "in-progress" : "open") });
      }
      if ((toPhase === STATUS.CLOSED || toPhase === STATUS.DISPOSED) && typeof tg5sBroadcast_ === "function") {
        tg5sBroadcast_("✔️ <b>Red Tag " + toPhase.toLowerCase() + "</b> · " + String(data[r][RT_COL.ZONE_ID]).trim() +
          " — " + String(data[r][RT_COL.ITEM_DESC] || tagId) + " by " + v2GetCurrentUser_(),
          [{ text: "🏷️ Open record", url: _tg5sDeep_('?v2=1&action=record&type=rt&id=' + tagId) }]);
      }
      return { success: true, message: "Red Tag " + tagId + " → " + toPhase };
    }
    return { success: false, message: "Red Tag not found: " + tagId };
  }, "advanceRedTagPhase:" + tagId, { success: false, message: "Server error." });
}

function getRedTagData(filters) {
  return v2SafeExecute_(function() {
    filters = filters || {};
    var cacheKey = "pm5s_redtags_" + (filters.zoneId || "ALL") + "_" + (filters.status || "ALL");
    try { var cached = CacheService.getScriptCache().get(cacheKey); if (cached) return JSON.parse(cached); } catch(e) {}
    var ss = v2GetSpreadsheet_(), data = v2LoadSheet_(ss, "RedTagRegister");
    if (data.length <= 1) return [];
    var results = [];
    for (var r = 1; r < data.length; r++) {
      if (!data[r][RT_COL.TAG_ID]) continue;
      var s = String(data[r][RT_COL.STATUS] || STATUS.IDENTIFIED).trim();
      if (s === STATUS.DELETED) continue;
      if (filters.zoneId && String(data[r][RT_COL.ZONE_ID]).trim() !== filters.zoneId) continue;
      if (filters.status && s !== filters.status) continue;
      results.push({ tagId: String(data[r][RT_COL.TAG_ID]), createdDate: v2FormatDate_(data[r][RT_COL.CREATED]),
        zoneId: String(data[r][RT_COL.ZONE_ID] || ""), zoneName: String(data[r][RT_COL.ZONE_NAME] || ""),
        itemDescription: String(data[r][RT_COL.ITEM_DESC] || ""), itemCategory: String(data[r][RT_COL.ITEM_CATEGORY] || ""),
        estimatedValue: data[r][RT_COL.EST_VALUE] || 0, proposedAction: String(data[r][RT_COL.PROPOSED_ACTION] || ""),
        photoUrl: String(data[r][RT_COL.PHOTO_URL] || ""),
        taggedBy: String(data[r][RT_COL.TAGGED_BY] || ""), owner: String(data[r][RT_COL.OWNER] || ""),
        deadline: v2FormatDate_(data[r][RT_COL.DEADLINE]),
        disposition: String(data[r][RT_COL.DISPOSITION] || ""),
        disposedDate: v2FormatDate_(data[r][RT_COL.DISPOSED_DATE]),
        disposedBy: String(data[r][RT_COL.DISPOSED_BY] || ""),
        reviewNotes: String(data[r][RT_COL.REVIEW_NOTES] || ""),
        status: s, remarks: String(data[r][RT_COL.REMARKS] || "") });
    }
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(results), 300); } catch(e) {}
    return results;
  }, "getRedTagData", [], "low");
}

// ── KAIZEN SUGGESTIONS ──

function createKaizenSuggestion(kzData) {
  return v2SafeExecute_(function() {
    var v = v2ValidateInput_(kzData, {
      submitterName: { required: true, type: "string", maxLen: 100 }, zoneId: { required: true, type: "zoneId" },
      category: { required: false, type: "string", maxLen: 50, defaultVal: "5S" },
      title: { required: true, type: "string", maxLen: 200 }, description: { required: true, type: "string", maxLen: 2000 },
      expectedBenefit: { required: false, type: "string", maxLen: 500 },
      estimatedSavings: { required: false, type: "number", defaultVal: 0 }
    });
    if (!v.valid) return { success: false, kaizenId: "", message: v.errors.join("; ") };
    var d = v.data, ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("KaizenSuggestions");
    if (!sheet) return { success: false, kaizenId: "", message: "KaizenSuggestions sheet not found." };
    var kaizenId = generateKaizenId_(), now = new Date();
    var row = [];
    row[KZ_COL.KAIZEN_ID] = kaizenId; row[KZ_COL.CREATED] = now; row[KZ_COL.ZONE_ID] = d.zoneId;
    row[KZ_COL.ZONE_NAME] = v2GetZoneName_(d.zoneId); row[KZ_COL.SUBMITTER] = d.submitterName;
    row[KZ_COL.CATEGORY] = d.category; row[KZ_COL.TITLE] = d.title; row[KZ_COL.DESCRIPTION] = d.description;
    row[KZ_COL.PHOTO_URL] = ""; row[KZ_COL.EXPECTED_BENEFIT] = d.expectedBenefit || "";
    row[KZ_COL.EST_SAVINGS] = d.estimatedSavings; row[KZ_COL.STATUS] = STATUS.SUBMITTED;
    for (var i = KZ_COL.REVIEWER; i <= KZ_COL.BENEFIT_VERIFIED_BY; i++) { if (row[i] === undefined) row[i] = ""; }
    sheet.appendRow(row);
    if (typeof tg5sBroadcast_ === "function") {
      tg5sBroadcast_(_tg5sCard_({
        icon: "💡", kind: "Kaizen", id: kaizenId, link: _tg5sDeep_('?v2=1&action=kaizenboard&zone=' + d.zoneId),
        zoneId: d.zoneId, zoneName: v2GetZoneName_(d.zoneId),
        facts: [
          "📌 " + TelegramLib.esc(d.title),
          "🏷 " + TelegramLib.esc(d.category || "—") +
            (d.estimatedSavings ? " · 💰 est ₹" + d.estimatedSavings : "") +
            " · 👤 " + TelegramLib.esc(d.submitterName || "—")
        ],
        action: "review & approve",
        by: d.submitterName || "5S"
      }), [{ text: "💡 Open Kaizen", url: _tg5sDeep_('?v2=1&action=kaizenboard&zone=' + d.zoneId) }]);
    }
    return { success: true, kaizenId: kaizenId, message: "Kaizen suggestion submitted." };
  }, "createKaizenSuggestion", { success: false, kaizenId: "", message: "Server error." });
}

function updateKaizenStatus(kzId, newStatus, remarks, additionalFields) {
  return v2SafeExecute_(function() {
    additionalFields = additionalFields || {};
    var ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("KaizenSuggestions");
    if (!sheet) return { success: false, message: "KaizenSuggestions sheet not found." };
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][KZ_COL.KAIZEN_ID]).trim() === kzId) {
        var updates = {};
        updates[KZ_COL.STATUS] = newStatus;
        if (remarks) updates[KZ_COL.REMARKS] = remarks;
        if (additionalFields.reviewer) updates[KZ_COL.REVIEWER] = additionalFields.reviewer;
        if (additionalFields.reviewDate || newStatus === STATUS.UNDER_REVIEW) updates[KZ_COL.REVIEW_DATE] = new Date();
        if (additionalFields.assignedTo) updates[KZ_COL.ASSIGNED_TO] = additionalFields.assignedTo;
        if (additionalFields.targetDate) updates[KZ_COL.TARGET_DATE] = new Date(additionalFields.targetDate);
        if (additionalFields.actualSavings) updates[KZ_COL.ACTUAL_SAVINGS] = additionalFields.actualSavings;
        if (newStatus === STATUS.COMPLETED) updates[KZ_COL.COMPLETED_DATE] = new Date();
        v2BatchUpdateRow_(sheet, r + 1, updates, data[r]);
        return { success: true, message: "Kaizen " + kzId + " → " + newStatus };
      }
    }
    return { success: false, message: "Kaizen not found: " + kzId };
  }, "updateKaizenStatus:" + kzId, { success: false, message: "Server error." });
}

function getKaizenData(filters) {
  return v2SafeExecute_(function() {
    filters = filters || {};
    var ss = v2GetSpreadsheet_(), data = v2LoadSheet_(ss, "KaizenSuggestions");
    if (data.length <= 1) return [];
    var results = [];
    for (var r = 1; r < data.length; r++) {
      if (!data[r][KZ_COL.KAIZEN_ID]) continue;
      var status = String(data[r][KZ_COL.STATUS]).trim().toUpperCase();
      if (status === STATUS.DELETED) continue;
      if (filters.zoneId && String(data[r][KZ_COL.ZONE_ID]).trim() !== filters.zoneId) continue;
      if (filters.status && status !== filters.status) continue;
      results.push({ kaizenId: String(data[r][KZ_COL.KAIZEN_ID]), createdDate: v2FormatDate_(data[r][KZ_COL.CREATED]),
        zoneId: String(data[r][KZ_COL.ZONE_ID] || ""), zoneName: String(data[r][KZ_COL.ZONE_NAME] || ""),
        submitterName: String(data[r][KZ_COL.SUBMITTER] || ""), category: String(data[r][KZ_COL.CATEGORY] || ""),
        title: String(data[r][KZ_COL.TITLE] || ""), description: String(data[r][KZ_COL.DESCRIPTION] || ""),
        expectedBenefit: String(data[r][KZ_COL.EXPECTED_BENEFIT] || ""),
        estimatedSavings: data[r][KZ_COL.EST_SAVINGS] || 0, actualSavings: data[r][KZ_COL.ACTUAL_SAVINGS] || 0,
        status: String(data[r][KZ_COL.STATUS] || "") });
    }
    return results;
  }, "getKaizenData", [], "low");
}

// ── GEMBA WALK — Fix F-17: batch task creation ──

function submitGembaWalk(walkData) {
  return v2SafeExecute_(function() {
    var v = v2ValidateInput_(walkData, {
      walkType: { required: true, type: "string", maxLen: 50 }, zoneId: { required: true, type: "zoneId" },
      walkerName: { required: true, type: "string", maxLen: 100 },
      walkerEmail: { required: false, type: "string", maxLen: 100 },
      observations: { required: false, type: "string", maxLen: 2000 }, photoUrls: { required: false, type: "string", maxLen: 1000 }
    });
    if (!v.valid) return { success: false, walkId: "", taskIds: [], message: v.errors.join("; ") };
    var d = v.data, ss = v2GetSpreadsheet_(), walkSheet = ss.getSheetByName("GembaWalks");
    if (!walkSheet) return { success: false, walkId: "", taskIds: [], message: "GembaWalks sheet not found." };
    var responses = walkData.responses || {};
    var yesCount = 0, noCount = 0, naCount = 0, totalQ = 0;
    Object.keys(responses).forEach(function(qId) { totalQ++; var a = String(responses[qId]).toLowerCase();
      if (a === "yes") yesCount++; else if (a === "no") noCount++; else if (a === "na") naCount++; });
    var answeredExNA = yesCount + noCount;
    var compliancePct = answeredExNA > 0 ? Math.round((yesCount / answeredExNA) * 100) : 0;
    var walkId = generateWalkId_(), now = new Date();
    var walkRow = [];
    walkRow[GW_COL.WALK_ID] = walkId; walkRow[GW_COL.TIMESTAMP] = now; walkRow[GW_COL.WALK_TYPE] = d.walkType;
    walkRow[GW_COL.WALKER_NAME] = d.walkerName; walkRow[GW_COL.WALKER_EMAIL] = v2ResolveUser_(d.walkerEmail);
    walkRow[GW_COL.ZONE_ID] = d.zoneId; walkRow[GW_COL.ZONE_NAME] = v2GetZoneName_(d.zoneId);
    walkRow[GW_COL.RESPONSES_JSON] = JSON.stringify(responses); walkRow[GW_COL.OBSERVATIONS] = d.observations || "";
    walkRow[GW_COL.TASK_IDS_JSON] = ""; walkRow[GW_COL.PHOTO_URLS] = d.photoUrls || "";
    walkRow[GW_COL.TOTAL_Q] = totalQ; walkRow[GW_COL.YES_COUNT] = yesCount;
    walkRow[GW_COL.NO_COUNT] = noCount; walkRow[GW_COL.NA_COUNT] = naCount; walkRow[GW_COL.COMPLIANCE_PCT] = compliancePct;
    walkSheet.appendRow(walkRow);
    // Batch-create tasks (Fix F-17)
    var actionItems = walkData.actionItems || [], taskIds = [];

    // Auto-create a synced task for every "No" answer — routes through createTask
    // so each one gets DWM sync + Telegram post + cache invalidation (actionable).
    try {
      if (typeof createTask === "function") {
        var qmap = {};
        (getGembaWalkQuestions(d.walkType) || []).forEach(function (q) { qmap[q.questionId] = q.text; });
        var walkerEmail = v2ResolveUser_(d.walkerEmail);
        Object.keys(responses).forEach(function (qId) {
          if (String(responses[qId]).toLowerCase() !== "no") return;
          var tr = createTask({
            zoneId: d.zoneId,
            title: "Gemba (" + d.walkType + "): " + (qmap[qId] || qId),
            description: "Non-conformance found on the " + d.walkType + " Gemba walk (" + walkId + ").",
            priority: "medium", assignedTo: d.walkerName,
            source: "GEMBA_WALK", sourceRefId: walkId, createdBy: walkerEmail
          });
          if (tr && tr.taskId) taskIds.push(tr.taskId);
        });
      }
    } catch (e) { Logger.log("Gemba No->task skipped: " + e.message); }

    if (actionItems.length > 0) {
      var taskSheet = ss.getSheetByName("TaskBoard");
      if (taskSheet) {
        var taskRows = [];
        actionItems.forEach(function(ai) {
          if (!ai.title) return;
          var tid = generateTaskId_(); taskIds.push(tid);
          var tr = [];
          tr[TASK_COL.TASK_ID] = tid; tr[TASK_COL.CREATED] = now; tr[TASK_COL.ZONE_ID] = d.zoneId;
          tr[TASK_COL.ZONE_NAME] = v2GetZoneName_(d.zoneId); tr[TASK_COL.TITLE] = String(ai.title || "").substring(0, 200);
          tr[TASK_COL.DESCRIPTION] = String(ai.description || "").substring(0, 1000); tr[TASK_COL.CATEGORY] = d.walkType;
          tr[TASK_COL.PRIORITY] = PRIORITY.MEDIUM; tr[TASK_COL.SOURCE] = "GEMBA_WALK"; tr[TASK_COL.SOURCE_REF] = walkId;
          tr[TASK_COL.ASSIGNED_TO] = String(ai.assignedTo || "").substring(0, 100); tr[TASK_COL.DUE_DATE] = ai.dueDate || "";
          tr[TASK_COL.STATUS] = STATUS.BACKLOG; tr[TASK_COL.UPDATED] = now;
          tr[TASK_COL.CLOSED_DATE] = ""; tr[TASK_COL.CLOSED_BY] = ""; tr[TASK_COL.REMARKS] = ""; tr[TASK_COL.PHOTO_URL] = "";
          taskRows.push(tr);
        });
        if (taskRows.length > 0) taskSheet.getRange(taskSheet.getLastRow() + 1, 1, taskRows.length, taskRows[0].length).setValues(taskRows);
      }
    }
    if (taskIds.length > 0) walkSheet.getRange(walkSheet.getLastRow(), GW_COL.TASK_IDS_JSON + 1).setValue(JSON.stringify(taskIds));
    return { success: true, walkId: walkId, taskIds: taskIds, message: "Walk submitted." };
  }, "submitGembaWalk", { success: false, walkId: "", taskIds: [], message: "Server error." });
}

function getGembaWalkData(filters) {
  return v2SafeExecute_(function() {
    filters = filters || {};
    var ss = v2GetSpreadsheet_(), data = v2LoadSheet_(ss, "GembaWalks");
    if (data.length <= 1) return [];
    var results = [];
    for (var r = 1; r < data.length; r++) {
      if (!data[r][GW_COL.WALK_ID]) continue;
      if (filters.zoneId && String(data[r][GW_COL.ZONE_ID]).trim() !== filters.zoneId) continue;
      if (filters.walkType && String(data[r][GW_COL.WALK_TYPE]).trim() !== filters.walkType) continue;
      results.push({ walkId: String(data[r][GW_COL.WALK_ID]),
        timestamp: v2FormatDate_(data[r][GW_COL.TIMESTAMP], "dd-MMM-yyyy HH:mm"),
        walkType: String(data[r][GW_COL.WALK_TYPE] || ""), walkerName: String(data[r][GW_COL.WALKER_NAME] || ""),
        zoneId: String(data[r][GW_COL.ZONE_ID] || ""), zoneName: String(data[r][GW_COL.ZONE_NAME] || ""),
        totalQuestions: data[r][GW_COL.TOTAL_Q] || 0, yesCount: data[r][GW_COL.YES_COUNT] || 0,
        noCount: data[r][GW_COL.NO_COUNT] || 0, compliancePct: data[r][GW_COL.COMPLIANCE_PCT] || 0 });
    }
    return results;
  }, "getGembaWalkData", [], "low");
}

function getGembaWalkQuestions(walkType) {
  return v2SafeExecute_(function() {
    var json = PropertiesService.getScriptProperties().getProperty("GEMBA_WALK_CONFIG");
    if (!json) return [];
    try { var cfg = JSON.parse(json); return cfg[walkType] || []; } catch(e) { return []; }
  }, "getGembaWalkQuestions", [], "low");
}

function getGembaWalkTypes() {
  return v2SafeExecute_(function() {
    var json = PropertiesService.getScriptProperties().getProperty("GEMBA_WALK_CONFIG");
    if (!json) return [];
    try { return Object.keys(JSON.parse(json)); } catch(e) { return []; }
  }, "getGembaWalkTypes", [], "low");
}

// ── WDGLL & TRAINING ──

function addWDGLLPhoto(wdData) {
  return v2SafeExecute_(function() {
    var v = v2ValidateInput_(wdData, {
      zoneId: { required: true, type: "zoneId" }, criterionId: { required: true, type: "string", maxLen: 20 },
      photoUrl: { required: true, type: "string", maxLen: 500 }, description: { required: false, type: "string", maxLen: 500 }
    });
    if (!v.valid) return { success: false, message: v.errors.join("; ") };
    var d = v.data, ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("WDGLL_Library");
    if (!sheet) return { success: false, message: "WDGLL_Library sheet not found." };
    var wdId = generateWDGLLId_();
    var row = [];
    row[WD_COL.WD_ID] = wdId; row[WD_COL.ZONE_ID] = d.zoneId; row[WD_COL.CRITERION_ID] = d.criterionId;
    row[WD_COL.PHOTO_URL] = d.photoUrl; row[WD_COL.PHOTO_FILE_ID] = ""; row[WD_COL.DESCRIPTION] = d.description || "";
    row[WD_COL.UPLOADED_BY] = v2GetCurrentUser_(); row[WD_COL.UPLOADED_DATE] = new Date(); row[WD_COL.IS_ACTIVE] = true;
    sheet.appendRow(row);
    return { success: true, wdgllId: wdId, message: "WDGLL photo added." };
  }, "addWDGLLPhoto", { success: false, message: "Server error." });
}

function getWDGLLPhotos(zoneId) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_(), data = v2LoadSheet_(ss, "WDGLL_Library");
    if (data.length <= 1) return [];
    var results = [];
    for (var r = 1; r < data.length; r++) {
      if (!data[r][WD_COL.WD_ID]) continue;
      if (zoneId && String(data[r][WD_COL.ZONE_ID]).trim() !== zoneId) continue;
      if (data[r][WD_COL.IS_ACTIVE] === false) continue;
      results.push({ wdgllId: String(data[r][WD_COL.WD_ID]), zoneId: String(data[r][WD_COL.ZONE_ID] || ""),
        criterionId: String(data[r][WD_COL.CRITERION_ID] || ""), photoUrl: String(data[r][WD_COL.PHOTO_URL] || ""),
        description: String(data[r][WD_COL.DESCRIPTION] || ""), uploadedBy: String(data[r][WD_COL.UPLOADED_BY] || ""),
        uploadedDate: v2FormatDate_(data[r][WD_COL.UPLOADED_DATE]) });
    }
    return results;
  }, "getWDGLLPhotos", [], "low");
}

function addTrainingRecord(trData) {
  return v2SafeExecute_(function() {
    var v = v2ValidateInput_(trData, {
      workerName: { required: true, type: "string", maxLen: 100 }, workerEmail: { required: false, type: "string", maxLen: 100 },
      zoneId: { required: true, type: "zoneId" }, topic: { required: true, type: "string", maxLen: 200 },
      pillar: { required: false, type: "string", maxLen: 10, defaultVal: "" },
      status: { required: false, type: "string", maxLen: 20, defaultVal: "In Training" }
    });
    if (!v.valid) return { success: false, message: v.errors.join("; ") };
    var d = v.data, ss = v2GetSpreadsheet_(), sheet = ss.getSheetByName("TrainingLog");
    if (!sheet) return { success: false, message: "TrainingLog sheet not found." };
    var recId = "TR-" + Utilities.formatDate(new Date(), TZ, "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
    var row = [];
    row[TR_COL.RECORD_ID] = recId; row[TR_COL.WORKER_NAME] = d.workerName;
    row[TR_COL.WORKER_EMAIL] = d.workerEmail || ""; row[TR_COL.ZONE_ID] = d.zoneId;
    row[TR_COL.TOPIC] = d.topic; row[TR_COL.PILLAR] = d.pillar; row[TR_COL.STATUS] = d.status;
    row[TR_COL.TRAINED_DATE] = new Date();
    for (var i = TR_COL.CERTIFIED_DATE; i <= TR_COL.REMARKS; i++) { if (row[i] === undefined) row[i] = ""; }
    sheet.appendRow(row);
    return { success: true, recordId: recId, message: "Training record added." };
  }, "addTrainingRecord", { success: false, message: "Server error." });
}

function getSkillsMatrixData(zoneId) {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_(), data = v2LoadSheet_(ss, "TrainingLog");
    if (data.length <= 1) return [];
    var results = [];
    for (var r = 1; r < data.length; r++) {
      if (!data[r][TR_COL.RECORD_ID]) continue;
      if (zoneId && String(data[r][TR_COL.ZONE_ID]).trim() !== zoneId) continue;
      results.push({ recordId: String(data[r][TR_COL.RECORD_ID]), workerName: String(data[r][TR_COL.WORKER_NAME] || ""),
        zoneId: String(data[r][TR_COL.ZONE_ID] || ""), topic: String(data[r][TR_COL.TOPIC] || ""),
        pillar: String(data[r][TR_COL.PILLAR] || ""), status: String(data[r][TR_COL.STATUS] || ""),
        trainedDate: v2FormatDate_(data[r][TR_COL.TRAINED_DATE]), expiryDate: v2FormatDate_(data[r][TR_COL.EXPIRY_DATE]) });
    }
    return results;
  }, "getSkillsMatrixData", [], "low");
}

// ── GEMBA BOARD & FLOOR MAP DATA SERVICES ──

function getGembaBoardData() {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_(), zoneConfig = v2GetZoneConfig_();
    var dailyData = v2LoadSheet_(ss, "DailySubmissions");
    var capaData = v2LoadSheet_(ss, "NC_CAPA");
    var today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
    var zoneIds = Object.keys(zoneConfig).sort(), zones = [], scoreSum = 0, scoreCount = 0, now = new Date();
    zoneIds.forEach(function(zoneId) {
      var zone = zoneConfig[zoneId];
      var todayScore = null, weekScores = [], submittedToday = false;
      var openNCs = 0, overdueNCs = 0, activeCAPAs = 0;
      for (var r = dailyData.length - 1; r >= 1; r--) {
        if (String(dailyData[r][2]).trim() !== zoneId) continue;
        var ds = dailyData[r][5] instanceof Date ? Utilities.formatDate(dailyData[r][5], TZ, "yyyy-MM-dd") : String(dailyData[r][5]).trim();
        if (ds === today) { todayScore = dailyData[r][14] || 0; submittedToday = true; }
        if (weekScores.length < 7) weekScores.push(dailyData[r][14] || 0);
      }
      for (var c = 1; c < capaData.length; c++) {
        if (String(capaData[c][NC_COL.ZONE_ID]).trim() !== zoneId) continue;
        var st = String(capaData[c][NC_COL.STATUS]).trim().toUpperCase();
        if (st !== STATUS.CLOSED) { openNCs++; activeCAPAs++;
          var td = capaData[c][NC_COL.TARGET_DATE];
          if (td instanceof Date && td < now) overdueNCs++; }
      }
      var weekAvg = weekScores.length > 0 ? Math.round(weekScores.reduce(function(a,b){return a+b;},0)/weekScores.length) : 0;
      var prevWeekAvg = weekScores.length >= 7 ? Math.round(weekScores.slice(3).reduce(function(a,b){return a+b;},0)/Math.min(4,weekScores.length-3)) : weekAvg;
      var trend = weekAvg > prevWeekAvg ? "up" : (weekAvg < prevWeekAvg ? "down" : "flat");
      if (todayScore !== null) { scoreSum += todayScore; scoreCount++; }
      zones.push({ zoneId: zoneId, zoneName: zone.name, zoneNameHi: zone.nameHi || "", leader: zone.leader,
        todayScore: todayScore, weekAvg: weekAvg, trend: trend, submittedToday: submittedToday,
        openNCs: openNCs, overdueNCs: overdueNCs, activeCAPAs: activeCAPAs });
    });
    return { zones: zones, plantAvg: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
      timestamp: Utilities.formatDate(new Date(), TZ, "dd-MMM-yyyy HH:mm"), totalZones: zoneIds.length };
  }, "getGembaBoardData", { zones: [], plantAvg: 0, timestamp: "" }, "medium");
}

function getFloorMapData() {
  return v2SafeExecute_(function() {
    var ss = v2GetSpreadsheet_(), zoneConfig = v2GetZoneConfig_();
    var summaryData = v2LoadSheet_(ss, "Summary"), mapData = v2LoadSheet_(ss, "MapConfig");
    var zoneScores = {};
    for (var s = summaryData.length - 1; s >= 1; s--) {
      var zid = String(summaryData[s][0]).trim();
      // Column 11 = pct_score, Column 13 = nc_count (0-indexed)
      if (zid && !zoneScores[zid] && summaryData[s][11]) zoneScores[zid] = { weeklyPct: summaryData[s][11] || 0, openNCs: summaryData[s][13] || 0 };
    }
    var polyMap = {};
    for (var m = 1; m < mapData.length; m++) {
      var mz = String(mapData[m][0]).trim();
      if (mz) polyMap[mz] = { polygon: String(mapData[m][1] || ""), labelX: mapData[m][2] || 0, labelY: mapData[m][3] || 0 };
    }
    var zones = [];
    Object.keys(zoneConfig).sort().forEach(function(zoneId) {
      var sc = zoneScores[zoneId] || { weeklyPct: 0, openNCs: 0 }, po = polyMap[zoneId] || {};
      var pct = parseFloat(sc.weeklyPct) || 0;
      var color = pct >= 80 ? "#27ae60" : pct >= 60 ? "#f39c12" : pct > 0 ? "#e74c3c" : "#555555";
      // Use client-expected field names: id, name, score, color (not zoneId/zoneName/weeklyPct)
      zones.push({ id: zoneId, name: zoneConfig[zoneId].name, score: pct > 0 ? pct : null,
        color: color, openNCs: sc.openNCs || 0,
        polygon: po.polygon || "", labelX: po.labelX || 0, labelY: po.labelY || 0 });
    });
    // Include FLOOR_MAP_LAYOUT so FloorMap.html can position zones on the custom grid
    var layoutRaw = PropertiesService.getScriptProperties().getProperty('FLOOR_MAP_LAYOUT');
    var layout = layoutRaw ? JSON.parse(layoutRaw) : {};
    return { zones: zones, layout: layout };
  }, "getFloorMapData", { zones: [], layout: {} }, "medium");
}
