/**
 * ============================================================================
 * 00_DemoTests.gs — PackMasters 5S Self-Contained Test Suite
 * Run via: clasp run runAllTests
 * Returns: "PASS x/y | all green"  OR  "PASS x/y | FAILURES: name: reason; ..."
 * ============================================================================
 *
 * Tests are idempotent — the red-tag round-trip cleans up after itself.
 * Uses v2GetSpreadsheet_() for all direct sheet access.
 * No ES6 destructuring or default params — GAS V8 compatible var/function style.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// INLINE ASSERT HELPER
// ---------------------------------------------------------------------------

function makeAssertContext_() {
  var results = [];

  function assert(name, condition, msg) {
    results.push({ name: name, ok: !!condition, msg: msg || '' });
  }

  function getResults() { return results; }

  return { assert: assert, getResults: getResults };
}

// ---------------------------------------------------------------------------
// INDIVIDUAL TEST FUNCTIONS (each receives assert fn, returns nothing)
// ---------------------------------------------------------------------------

/** T01 — ZONES: getAllZoneIds and getZoneConfig */
function test_zones_(assert) {
  var ids = getAllZoneIds();
  assert('T01-a zones length === 28', ids.length === 28,
    'got ' + ids.length);

  var allMatch = ids.every(function(id) { return /^Z-\d{2}$/.test(id); });
  assert('T01-b all zone ids match /^Z-\\d{2}$/', allMatch,
    'bad ids: ' + ids.filter(function(id) { return !/^Z-\d{2}$/.test(id); }).join(', '));

  var cfg = getZoneConfig();
  var cfgKeys = Object.keys(cfg);
  assert('T01-c getZoneConfig has 28 keys', cfgKeys.length === 28,
    'got ' + cfgKeys.length);
}

/** T02 — ANALYTICS shape: all required keys present */
function test_analyticsShape_(assert) {
  var kpis = getAnalyticsKPIs();
  var required = [
    'plantAvg','zonesOnTarget','totalZones','bestZone','worstZone',
    'openNCs','openOFIs','overdueNCs','repeatNCs','closureRate',
    'avgAgeDays','activeRedTags','sqcdpHeatmap','pillarNCs','zoneScores'
  ];
  required.forEach(function(key) {
    assert('T02-shape-' + key, kpis.hasOwnProperty(key),
      'missing key: ' + key);
  });
}

/** T03 — ANALYTICS values sane */
function test_analyticsValues_(assert) {
  var kpis = getAnalyticsKPIs();
  assert('T03-a plantAvg 0..100',
    typeof kpis.plantAvg === 'number' && kpis.plantAvg >= 0 && kpis.plantAvg <= 100,
    'plantAvg=' + kpis.plantAvg);
  assert('T03-b totalZones >= 1',
    typeof kpis.totalZones === 'number' && kpis.totalZones >= 1,
    'totalZones=' + kpis.totalZones);
  assert('T03-c zonesOnTarget <= totalZones',
    kpis.zonesOnTarget <= kpis.totalZones,
    'zonesOnTarget=' + kpis.zonesOnTarget + ' totalZones=' + kpis.totalZones);
  assert('T03-d openNCs >= 0',
    typeof kpis.openNCs === 'number' && kpis.openNCs >= 0,
    'openNCs=' + kpis.openNCs);
  assert('T03-e closureRate 0..100',
    typeof kpis.closureRate === 'number' && kpis.closureRate >= 0 && kpis.closureRate <= 100,
    'closureRate=' + kpis.closureRate);
}

/** T04 — zoneScores: array, length matches totalZones, entries valid, sorted desc */
function test_zoneScores_(assert) {
  var kpis = getAnalyticsKPIs();
  var zs = kpis.zoneScores;
  assert('T04-a zoneScores is array', Array.isArray(zs),
    'type=' + typeof zs);
  assert('T04-b zoneScores.length === totalZones',
    Array.isArray(zs) && zs.length === kpis.totalZones,
    'zs.length=' + (Array.isArray(zs) ? zs.length : 'N/A') + ' totalZones=' + kpis.totalZones);

  if (Array.isArray(zs) && zs.length > 0) {
    var allValidIds = zs.every(function(e) { return /^Z-\d{2}$/.test(e.zoneId); });
    assert('T04-c each entry has valid zoneId', allValidIds,
      'bad: ' + zs.filter(function(e){ return !/^Z-\d{2}$/.test(e.zoneId); }).map(function(e){ return e.zoneId; }).join(', '));

    var allNumericOverall = zs.every(function(e) {
      return typeof e.overall === 'number' && e.overall >= 0 && e.overall <= 100;
    });
    assert('T04-d each entry overall is numeric 0..100', allNumericOverall,
      'bad entries found');

    var isSorted = true;
    for (var i = 1; i < zs.length; i++) {
      if (zs[i].overall > zs[i - 1].overall) { isSorted = false; break; }
    }
    assert('T04-e zoneScores sorted by overall descending', isSorted, '');
  }
}

/** T05 — sqcdpHeatmap: keys S,Q,C,D,P all numeric >=0, at least one >0 */
function test_sqcdpHeatmap_(assert) {
  var kpis = getAnalyticsKPIs();
  var hm = kpis.sqcdpHeatmap;
  var keys = ['S','Q','C','D','P'];
  var allNumeric = keys.every(function(k) {
    return hm.hasOwnProperty(k) && typeof hm[k] === 'number' && hm[k] >= 0;
  });
  assert('T05-a sqcdpHeatmap keys S,Q,C,D,P all numeric >=0', allNumeric,
    JSON.stringify(hm));
  var anyPositive = keys.some(function(k) { return hm[k] > 0; });
  assert('T05-b at least one sqcdpHeatmap value > 0', anyPositive,
    'all zeros — demo data may not be seeded');
}

/** T06 — pillarNCs: keys S1..S5 numeric >=0; sum <= openNCs */
function test_pillarNCs_(assert) {
  var kpis = getAnalyticsKPIs();
  var pnc = kpis.pillarNCs;
  var pillars = ['S1','S2','S3','S4','S5'];
  var allNumeric = pillars.every(function(p) {
    return pnc.hasOwnProperty(p) && typeof pnc[p] === 'number' && pnc[p] >= 0;
  });
  assert('T06-a pillarNCs S1..S5 all numeric >=0', allNumeric, JSON.stringify(pnc));

  var sum = pillars.reduce(function(s, p) { return s + (pnc[p] || 0); }, 0);
  // NCs with unrecognised pillar prefix won't map to S1..S5, so sum <= openNCs
  assert('T06-b sum(pillarNCs) <= openNCs (unmapped NCs may cause gap)',
    sum <= kpis.openNCs,
    'sum=' + sum + ' openNCs=' + kpis.openNCs);
}

/** T07 — getPillarTrend shape */
function test_pillarTrend_(assert) {
  var trend = getPillarTrend();
  var pillars = ['S1','S2','S3','S4','S5'];
  var allKeys = pillars.every(function(p) { return trend.hasOwnProperty(p); });
  assert('T07-a getPillarTrend has keys S1..S5', allKeys, 'keys: ' + Object.keys(trend).join(','));

  // Pick first pillar that has at least one zone series
  var foundSeries = false;
  for (var pi = 0; pi < pillars.length && !foundSeries; pi++) {
    var pillarObj = trend[pillars[pi]];
    var zoneKeys = Object.keys(pillarObj);
    if (zoneKeys.length === 0) continue;
    foundSeries = true;
    var series = pillarObj[zoneKeys[0]];
    assert('T07-b series is array', Array.isArray(series), 'pillar=' + pillars[pi] + ' zone=' + zoneKeys[0]);
    if (Array.isArray(series) && series.length > 0) {
      var firstPt = series[0];
      assert('T07-c series entry has month matching yyyy-MM',
        /^\d{4}-\d{2}$/.test(firstPt.month),
        'month=' + firstPt.month);
      assert('T07-d series entry score 0..100',
        typeof firstPt.score === 'number' && firstPt.score >= 0 && firstPt.score <= 100,
        'score=' + firstPt.score);
    }
  }
  if (!foundSeries) {
    assert('T07-b series data exists (summary sheet may be empty)', false,
      'no zone series found in any pillar');
  }
}

/** T08 — getNcDetail: real NC and nonexistent NC */
function test_ncDetail_(assert) {
  var ss = v2GetSpreadsheet_();
  var sh = ss.getSheetByName('NC_CAPA');
  if (!sh || sh.getLastRow() <= 1) {
    assert('T08-skip NC_CAPA has data rows', false, 'sheet empty or missing');
    return;
  }
  var data = sh.getDataRange().getValues();
  // Find first row with a non-empty NC_ID (col 0)
  var firstNcId = null;
  var firstZoneId = null;
  for (var r = 1; r < data.length; r++) {
    if (data[r][NC_COL.NC_ID]) {
      firstNcId = String(data[r][NC_COL.NC_ID]);
      firstZoneId = String(data[r][NC_COL.ZONE_ID]);
      break;
    }
  }
  assert('T08-a NC_CAPA has at least one NC row', !!firstNcId, 'no NC_ID found in any row');

  if (firstNcId) {
    var detail = getNcDetail(firstNcId);
    assert('T08-b getNcDetail returns non-null for real id', !!detail, 'returned null for ' + firstNcId);
    if (detail) {
      assert('T08-c returned id matches queried id', detail.id === firstNcId,
        'expected ' + firstNcId + ' got ' + detail.id);
      assert('T08-d zoneId matches /^Z-\\d{2}$/',
        /^Z-\d{2}$/.test(detail.zoneId),
        'zoneId=' + detail.zoneId);
      assert('T08-e status is non-empty string',
        typeof detail.status === 'string' && detail.status.length > 0,
        'status=' + JSON.stringify(detail.status));
    }
  }

  var missing = getNcDetail('NC-NONEXISTENT-999');
  assert('T08-f getNcDetail returns null for nonexistent id', missing === null,
    'returned: ' + JSON.stringify(missing));
}

/** T09 — Red tag round-trip (idempotent — cleans up after itself) */
function test_redTagRoundTrip_(assert) {
  var ss = v2GetSpreadsheet_();
  var sh = ss.getSheetByName('RedTagRegister');
  assert('T09-a RedTagRegister sheet exists', !!sh, '');
  if (!sh) return;

  // Count active red tags before
  var beforeData = sh.getLastRow() > 1 ? sh.getDataRange().getValues() : [[]];
  var beforeCount = beforeData.slice(1).filter(function(r) {
    if (!r[RT_COL.TAG_ID]) return false;
    var st = String(r[RT_COL.STATUS]);
    return st !== 'Disposed' && st !== 'Returned' && st !== 'Scrapped';
  }).length;
  assert('T09-b active red tag count before is numeric', typeof beforeCount === 'number', '');

  // Raise a test red tag
  var result = raiseRedTag({
    zone: 'Z-01',
    item: 'TEST_AUTORT',
    quantity: 1,
    category: 'TestCat',
    reason: 'unit test',
    action: 'dispose',
    taggedBy: 'tester'
  });

  assert('T09-c raiseRedTag returns truthy result', !!result, 'returned: ' + JSON.stringify(result));
  var isOk = result && (result.ok === true || result.success === true);
  assert('T09-d result has ok or success === true', isOk, JSON.stringify(result));
  var tagNo = result && result.tagNo;
  assert('T09-e result has tagNo', !!tagNo, 'tagNo=' + tagNo);

  if (tagNo) {
    // Read sheet again and find the new row
    var afterData = sh.getDataRange().getValues();
    var newRowIndex = -1;
    for (var r = 1; r < afterData.length; r++) {
      if (String(afterData[r][RT_COL.TAG_ID]) === tagNo) {
        newRowIndex = r + 1; // 1-based sheet row
        var rowData = afterData[r];
        assert('T09-f ITEM_CATEGORY === TestCat',
          String(rowData[RT_COL.ITEM_CATEGORY]) === 'TestCat',
          'got: ' + String(rowData[RT_COL.ITEM_CATEGORY]));
        assert('T09-g STATUS === IDENTIFIED',
          String(rowData[RT_COL.STATUS]) === 'IDENTIFIED',
          'got: ' + String(rowData[RT_COL.STATUS]));
        break;
      }
    }
    assert('T09-h new row found in sheet by tagNo', newRowIndex > 1, 'tagNo=' + tagNo);

    // CLEAN UP — delete the test row so test is idempotent
    if (newRowIndex > 1) {
      try {
        sh.deleteRow(newRowIndex);
        assert('T09-i cleanup: test row deleted', true, '');
        // Bust caches
        CacheService.getScriptCache().removeAll(['KANBAN_DATA', 'ANALYTICS_KPIS']);
      } catch (e) {
        assert('T09-i cleanup: test row deleted', false, e.message);
      }
    }
  }
}

/** T10 — Sheet integrity: required sheets exist, phantom 'RedTags' absent */
function test_sheetIntegrity_(assert) {
  var ss = v2GetSpreadsheet_();
  var required = ['Summary', 'NC_CAPA', 'RedTagRegister'];
  required.forEach(function(name) {
    assert('T10-' + name + ' exists', !!ss.getSheetByName(name), name + ' not found');
  });
  var phantom = ss.getSheetByName('RedTags');
  // Record as WARNING-level failure if it exists (stale phantom name)
  assert('T10-no phantom RedTags sheet [WARNING if fails]', !phantom,
    'Sheet named "RedTags" exists — this is the old phantom name; verify it is intentional');
}

/** T11 — getKanbanData returns data; red tag entries (if any) have zone ids */
function test_kanbanData_(assert) {
  var data = getKanbanData();
  assert('T11-a getKanbanData returns object', !!data && typeof data === 'object', '');
  assert('T11-b has ncs array', data && Array.isArray(data.ncs), '');
  assert('T11-c has redTags array', data && Array.isArray(data.redTags), '');
  if (data && Array.isArray(data.redTags) && data.redTags.length > 0) {
    var allHaveZone = data.redTags.every(function(rt) {
      return typeof rt.zone === 'string' && rt.zone.length > 0;
    });
    assert('T11-d red tag entries have non-empty zone', allHaveZone,
      'some entries missing zone');
  }
}


// ---------------------------------------------------------------------------
// MAIN ENTRY POINT
// ---------------------------------------------------------------------------

/**
 * Runs all test functions, collects results, returns summary string.
 * Safe: catches exceptions per-test, never throws.
 *
 * @returns {string} "PASS x/y | all green" or "PASS x/y | FAILURES: ..."
 */
function runDemoTests() {
  var ctx = makeAssertContext_();
  var assert = ctx.assert;

  var tests = [
    { name: 'T01-zones',           fn: test_zones_           },
    { name: 'T02-analyticsShape',  fn: test_analyticsShape_  },
    { name: 'T03-analyticsValues', fn: test_analyticsValues_ },
    { name: 'T04-zoneScores',      fn: test_zoneScores_      },
    { name: 'T05-sqcdpHeatmap',    fn: test_sqcdpHeatmap_    },
    { name: 'T06-pillarNCs',       fn: test_pillarNCs_       },
    { name: 'T07-pillarTrend',     fn: test_pillarTrend_     },
    { name: 'T08-ncDetail',        fn: test_ncDetail_        },
    { name: 'T09-redTagRoundTrip', fn: test_redTagRoundTrip_ },
    { name: 'T10-sheetIntegrity',  fn: test_sheetIntegrity_  },
    { name: 'T11-kanbanData',      fn: test_kanbanData_      }
  ];

  tests.forEach(function(t) {
    try {
      t.fn(assert);
    } catch (e) {
      assert(t.name + ' [exception]', false, e.message || String(e));
    }
  });

  var results = ctx.getResults();
  var total = results.length;
  var passed = results.filter(function(r) { return r.ok; }).length;
  var failures = results.filter(function(r) { return !r.ok; });

  Logger.log('runAllTests: ' + passed + '/' + total);
  results.forEach(function(r) {
    Logger.log((r.ok ? '  PASS' : '  FAIL') + ' ' + r.name + (r.msg ? ' — ' + r.msg : ''));
  });

  if (failures.length === 0) {
    return 'PASS ' + passed + '/' + total + ' | all green';
  }

  var failDesc = failures.map(function(r) {
    return r.name + ': ' + (r.msg || 'assertion failed');
  }).join('; ');

  return 'PASS ' + passed + '/' + total + ' | FAILURES: ' + failDesc;
}
