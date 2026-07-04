/**
 * ============================================================================
 * 01_Config.gs — PackMasters 5S Integrated System
 * Phase 1: Configuration Management
 * ============================================================================
 * 
 * This file manages all system configuration via PropertiesService.
 * CONSTRAINT-2: All runtime config reads come from ScriptProperties, never Sheets.
 * CONSTRAINT-7: All operational parameters are config-driven, not code-driven.
 * 
 * Functions:
 *   initScriptProperties()  — First-time setup of all config keys
 *   refreshConfig()         — Reloads config from Zones/Checklist sheets into Properties
 *   getConfig(key)          — Runtime config reader (Properties only, never Sheets)
 *   getZoneConfig()         — Returns parsed ZONE_CONFIG object
 *   getChecklistSchema()    — Returns parsed CHECKLIST_SCHEMA object
 *   getAllZoneIds()          — Returns array of zone ID strings
 */

// ============================================================================
// DEFAULT ZONE CONFIGURATION
// ============================================================================

/**
 * Returns the default ZONE_CONFIG object.
 * This is used ONLY for initial setup. After init, all reads come from ScriptProperties.
 * Email addresses are placeholders — replace before going live.
 */
function getDefaultZoneConfig_() {
  // Delegate to 01b_ZoneData.js — keeps this file readable
  var meta = getDefaultZoneMetadata_();
  var criteria = getDefaultZoneCriteria_();
  var config = {};
  Object.keys(meta).sort().forEach(function(zid) {
    config[zid] = meta[zid];
    config[zid].criteria = criteria[zid] || [];
  });
  return config;
}

function getDefaultZoneConfig__PLACEHOLDER_DO_NOT_USE_() {
  // Old 8-zone placeholder removed. See 01b_ZoneData.js for real data.
  return {
    "Z-01": {
      id: "Z-01", name: "Security + Meter Room", nameHi: "सिक्योरिटी + मीटर रूम",
      leader: "Mr. Tarun", supervisor: "Mr. Rajesh Dubey", email: "tarun@packmasters.in",
      auditDay: "Monday", auditDayNum: 1, department: "Security & Logistics", driveFolderId: "",
      criteria: [
        { id: "S1-1", pillar: "S1", labelEn: "No obsolete paper accumulation at entry post", labelHi: "पुरानी रजिस्टर, नोटिस या कागज एंट्री पर नहीं", maxScore: 4 },
        { id: "S1-2", pillar: "S1", labelEn: "Broken/worn tools and jigs removed or red-tagged for repair", labelHi: "टूटे या घिसे औज़ार हटाओ, रेड टैग लगाओ", maxScore: 4 },
        { id: "S1-3", pillar: "S1", labelEn: "Rejected packs/waste segregated immediately — not mixed with WIP", labelHi: "खराब माल अलग डिब्बे में डालो — अच्छे माल में मत मिलाओ", maxScore: 4 },
        { id: "S2-1", pillar: "S2", labelEn: "Packing line positions marked — materials, bins, tools each at designated spot", labelHi: "हर चीज़ की जगह तय है — वही रखो जहाँ निशान लगा है", maxScore: 4 },
        { id: "S2-2", pillar: "S2", labelEn: "Material flow lanes clear and unobstructed (gangway width maintained)", labelHi: "रास्ता खाली रखो — बीच में कुछ मत रखो", maxScore: 4 },
        { id: "S2-3", pillar: "S2", labelEn: "Shadow board/tool rack in use — missing items visible at a glance", labelHi: "शैडो बोर्ड पर औज़ार रखो — एक नज़र में पता चले क्या गायब है", maxScore: 4 },
        { id: "S3-1", pillar: "S3", labelEn: "Packing machines cleaned after each batch — no dust, adhesive, or powder residue", labelHi: "हर बैच के बाद मशीन साफ करो — धूल, गोंद, पाउडर कुछ न रहे", maxScore: 4 },
        { id: "S3-2", pillar: "S3", labelEn: "Floor swept between shifts — no packaging scraps, film offcuts, or spillage", labelHi: "पाली के बाद फर्श झाड़ो — पैकिंग का कचरा, फिल्म के टुकड़े न रहें", maxScore: 4 },
        { id: "S3-3", pillar: "S3", labelEn: "Waste bins labelled by type (dry waste / reject / recyclable) and emptied each shift", labelHi: "कूड़ेदान पर लिखा हो क्या डालना है — हर पाली में खाली करो", maxScore: 4 },
        { id: "S4-1", pillar: "S4", labelEn: "Batch packing SOP displayed at workstation and current revision", labelHi: "काम की SOP सामने लगी हो — पुरानी वाली नहीं", maxScore: 4 },
        { id: "S4-2", pillar: "S4", labelEn: "Line clearance checklist completed and signed before each new batch", labelHi: "नया बैच शुरू करने से पहले लाइन क्लीयरेंस चेकलिस्ट भरो और साइन करो", maxScore: 4 },
        { id: "S4-3", pillar: "S4", labelEn: "Speed/pressure/temperature settings at standard — deviation logged immediately", labelHi: "मशीन की सेटिंग सही हो — फर्क दिखे तो तुरंत लिखो", maxScore: 4 },
        { id: "S5-1", pillar: "S5", labelEn: "Daily 5S checksheet submitted before shift end", labelHi: "पाली खत्म होने से पहले 5S चेकशीट भरो", maxScore: 4 },
        { id: "S5-2", pillar: "S5", labelEn: "Previous audit NCs closed within agreed timeline", labelHi: "पिछले ऑडिट की कमियाँ तय समय में बंद करो", maxScore: 4 },
        { id: "S5-3", pillar: "S5", labelEn: "At least one kaizen/improvement suggestion submitted this month by team", labelHi: "इस महीने टीम से कम से कम एक सुधार का सुझाव आना चाहिए", maxScore: 4 }
      ]
    },
    "Z-02": {
      id: "Z-02", name: "Production Floor B", nameHi: "उत्पादन फ्लोर बी",
      leader: "Mr. Rajesh Kumar", email: "rajesh.kumar@packmasters.in",
      auditDay: "Monday", auditDayNum: 1, department: "Production & Ops", driveFolderId: "",
      criteria: [
        { id: "S1-1", pillar: "S1", labelEn: "Obsolete mould/die sets not in use removed from line area", labelHi: "जो मोल्ड/डाई काम में नहीं, वो लाइन से हटाओ", maxScore: 4 },
        { id: "S1-2", pillar: "S1", labelEn: "Non-conforming material physically separated with red identification", labelHi: "खराब माल को लाल टैग लगाकर अलग रखो", maxScore: 4 },
        { id: "S1-3", pillar: "S1", labelEn: "Personal items (bags, food) stored only in designated area, not on production floor", labelHi: "बैग, खाना — फ्लोर पर नहीं, जहाँ बताया है वहाँ रखो", maxScore: 4 },
        { id: "S2-1", pillar: "S2", labelEn: "WIP staging area marked — no WIP placed outside marked zone", labelHi: "WIP सिर्फ निशान वाली जगह पर रखो — बाहर मत रखो", maxScore: 4 },
        { id: "S2-2", pillar: "S2", labelEn: "Consumables (tape, labels, film) at point of use — no hoarding at workstation", labelHi: "टेप, लेबल, फिल्म — काम की जगह पर रखो, ज़्यादा जमा मत करो", maxScore: 4 },
        { id: "S2-3", pillar: "S2", labelEn: "Inspection instruments returned to calibrated storage after use", labelHi: "नाप के उपकरण इस्तेमाल के बाद वापस उनकी जगह रखो", maxScore: 4 },
        { id: "S3-1", pillar: "S3", labelEn: "Equipment lubrication points clean — no oil drips on floor or product", labelHi: "मशीन के तेल वाली जगह साफ हो — फर्श या माल पर तेल न टपके", maxScore: 4 },
        { id: "S3-2", pillar: "S3", labelEn: "Conveyor belts and chutes free of product buildup and debris", labelHi: "बेल्ट और चुट पर माल जमा न हो, कचरा न हो", maxScore: 4 },
        { id: "S3-3", pillar: "S3", labelEn: "Cleaning equipment (mops, brushes) clean, stored in designated location", labelHi: "पोछा, ब्रश साफ हो और अपनी जगह पर रखा हो", maxScore: 4 },
        { id: "S4-1", pillar: "S4", labelEn: "Visual production board updated every shift (target vs actual)", labelHi: "हर पाली में बोर्ड अपडेट करो — टार्गेट और असल काम लिखो", maxScore: 4 },
        { id: "S4-2", pillar: "S4", labelEn: "Quality alert/defect samples displayed for worker awareness", labelHi: "खराबी के नमूने और अलर्ट सबको दिखते हों", maxScore: 4 },
        { id: "S4-3", pillar: "S4", labelEn: "PPE (gloves, hairnet, shoes) worn correctly by all workers on floor", labelHi: "सभी लोग दस्ताने, हेयरनेट, जूते सही तरीके से पहनें", maxScore: 4 },
        { id: "S5-1", pillar: "S5", labelEn: "5S audit score trend visible on floor — improving or stable", labelHi: "5S स्कोर का चार्ट फ्लोर पर लगा हो — सुधर रहा है या टिका है", maxScore: 4 },
        { id: "S5-2", pillar: "S5", labelEn: "Operator competency matrix displayed and current", labelHi: "कौन क्या काम जानता है — वो चार्ट लगा हो और नया हो", maxScore: 4 },
        { id: "S5-3", pillar: "S5", labelEn: "Shift handover completed with 5S status noted in logbook", labelHi: "पाली बदलते वक्त 5S की स्थिति लॉगबुक में लिखो", maxScore: 4 }
      ]
    },
    "Z-03": {
      id: "Z-03", name: "Raw Material Store", nameHi: "कच्चा माल भंडार",
      leader: "Mr. Suresh Yadav", email: "suresh.yadav@packmasters.in",
      auditDay: "Tuesday", auditDayNum: 2, department: "Stores & Inventory", driveFolderId: "",
      criteria: [
        { id: "S1-1", pillar: "S1", labelEn: "Expired/rejected materials in quarantine zone — not mixed with approved stock", labelHi: "एक्सपायर या रिजेक्ट माल अलग क्वारंटीन में रखो — अच्छे माल में मत मिलाओ", maxScore: 4 },
        { id: "S1-2", pillar: "S1", labelEn: "Damaged/broken pallets removed — only sound pallets in use", labelHi: "टूटे पैलेट हटाओ — सिर्फ ठीक पैलेट इस्तेमाल करो", maxScore: 4 },
        { id: "S1-3", pillar: "S1", labelEn: "Empty containers, drums, and packaging returned or disposed — not accumulating", labelHi: "खाली डिब्बे, ड्रम वापस करो या हटाओ — जमा मत करो", maxScore: 4 },
        { id: "S2-1", pillar: "S2", labelEn: "Each material has a fixed bin/rack location with location card (item, lot, qty)", labelHi: "हर माल की जगह तय हो — लोकेशन कार्ड पर आइटम, लॉट, मात्रा लिखी हो", maxScore: 4 },
        { id: "S2-2", pillar: "S2", labelEn: "FIFO lanes marked and followed — older stock issued before newer", labelHi: "पहले आया माल पहले निकालो — FIFO का पालन करो", maxScore: 4 },
        { id: "S2-3", pillar: "S2", labelEn: "GRN tag/lot number visible on every material in storage", labelHi: "रखे हर माल पर GRN टैग या लॉट नंबर दिखना चाहिए", maxScore: 4 },
        { id: "S3-1", pillar: "S3", labelEn: "Aisle floors clean — no spillage, powder, or film offcuts", labelHi: "रास्ते का फर्श साफ हो — गिरा हुआ पाउडर, फिल्म के टुकड़े न हों", maxScore: 4 },
        { id: "S3-2", pillar: "S3", labelEn: "Shelves and racks dusted — no cobwebs or moisture stains", labelHi: "रैक और अलमारी साफ हों — जाले या नमी के दाग न हों", maxScore: 4 },
        { id: "S3-3", pillar: "S3", labelEn: "Pest control bait stations checked and recorded this week", labelHi: "इस हफ्ते कीड़े-मकोड़े का जाल चेक करो और लिखो", maxScore: 4 },
        { id: "S4-1", pillar: "S4", labelEn: "Min/max stock levels displayed at each location — reorder triggered at min", labelHi: "हर जगह कम से कम और ज़्यादा से ज़्यादा कितना माल — लिखा हो, कम होने पर ऑर्डर दो", maxScore: 4 },
        { id: "S4-2", pillar: "S4", labelEn: "Inward inspection register updated for every GRN received", labelHi: "हर GRN पर जाँच रजिस्टर भरो", maxScore: 4 },
        { id: "S4-3", pillar: "S4", labelEn: "Hazardous/chemical materials stored per MSDS requirements (signage, segregation)", labelHi: "खतरनाक केमिकल अलग रखो — बोर्ड लगा हो, MSDS के हिसाब से", maxScore: 4 },
        { id: "S5-1", pillar: "S5", labelEn: "Daily stock reconciliation completed — physical vs system count matches", labelHi: "रोज़ गिनती मिलाओ — असल माल और सिस्टम में एक जैसा होना चाहिए", maxScore: 4 },
        { id: "S5-2", pillar: "S5", labelEn: "All issuances recorded in issue register — no unrecorded material movements", labelHi: "जो भी माल निकला — इश्यू रजिस्टर में लिखो, बिना लिखे कुछ न जाए", maxScore: 4 },
        { id: "S5-3", pillar: "S5", labelEn: "Temperature/humidity log maintained daily (if climate-sensitive materials stored)", labelHi: "रोज़ तापमान और नमी लिखो — खासकर अगर संवेदनशील माल रखा है", maxScore: 4 }
      ]
    },
    "Z-04": {
      id: "Z-04", name: "Finished Goods Store", nameHi: "तैयार माल भंडार",
      leader: "Mr. Vikram Singh", email: "vikram.singh@packmasters.in",
      auditDay: "Tuesday", auditDayNum: 2, department: "Stores & Inventory", driveFolderId: "",
      criteria: [
        { id: "S1-1", pillar: "S1", labelEn: "Quarantine/rejected FG physically separated and clearly labelled — not in dispatch zone", labelHi: "रोका हुआ या खराब माल डिस्पैच एरिया से दूर, साफ लेबल के साथ अलग रखो", maxScore: 4 },
        { id: "S1-2", pillar: "S1", labelEn: "Damaged/dented cartons segregated — not shipped to customers", labelHi: "टूटे-फटे कार्टन अलग करो — ग्राहक को मत भेजो", maxScore: 4 },
        { id: "S1-3", pillar: "S1", labelEn: "Empty pallets and packing materials stacked in designated area — not scattered", labelHi: "खाली पैलेट और पैकिंग सामान तय जगह पर रखो — बिखरे न हों", maxScore: 4 },
        { id: "S2-1", pillar: "S2", labelEn: "Customer-wise product locations marked — no mixing of different customer orders", labelHi: "हर ग्राहक का माल अलग जगह — एक का माल दूसरे में मत मिलाओ", maxScore: 4 },
        { id: "S2-2", pillar: "S2", labelEn: "FIFO dispatch maintained — oldest manufactured batch dispatched first", labelHi: "पुराना बैच पहले भेजो — FIFO फॉलो करो", maxScore: 4 },
        { id: "S2-3", pillar: "S2", labelEn: "Dispatch lanes clear — no stock blocking vehicle access path", labelHi: "गाड़ी का रास्ता खाली रखो — माल बीच में मत रखो", maxScore: 4 },
        { id: "S3-1", pillar: "S3", labelEn: "Floor free of packing waste, shrink film, and strapping bands", labelHi: "फर्श पर पैकिंग का कचरा, फिल्म या पट्टियाँ न पड़ी हों", maxScore: 4 },
        { id: "S3-2", pillar: "S3", labelEn: "Pallets and cartons clean — no dust accumulation on long-stored stock", labelHi: "पैलेट और कार्टन साफ हों — पुराने माल पर धूल न जमे", maxScore: 4 },
        { id: "S3-3", pillar: "S3", labelEn: "Pest traps checked and no signs of infestation near FG", labelHi: "कीड़े का जाल चेक करो — माल के पास कीड़े-मकोड़े के निशान न हों", maxScore: 4 },
        { id: "S4-1", pillar: "S4", labelEn: "Every pallet/stack has batch card showing: product, batch no., qty, mfg date, customer", labelHi: "हर पैलेट पर कार्ड लगो हो — माल, बैच नं., मात्रा, तारीख, ग्राहक का नाम", maxScore: 4 },
        { id: "S4-2", pillar: "S4", labelEn: "Dispatch checklist completed for every outgoing shipment", labelHi: "हर शिपमेंट भेजने से पहले डिस्पैच चेकलिस्ट पूरी भरो", maxScore: 4 },
        { id: "S4-3", pillar: "S4", labelEn: "Stock register/WMS updated within 2 hours of goods receipt and dispatch", labelHi: "माल आने-जाने के 2 घंटे के अंदर रजिस्टर या सिस्टम अपडेट करो", maxScore: 4 },
        { id: "S5-1", pillar: "S5", labelEn: "Inventory accuracy ≥98% verified in last cycle count", labelHi: "आखिरी गिनती में 98% से ज़्यादा माल मिला हो — सही होना चाहिए", maxScore: 4 },
        { id: "S5-2", pillar: "S5", labelEn: "Customer complaint related to dispatch errors — zero in current month", labelHi: "इस महीने डिस्पैच की गलती की कोई शिकायत नहीं आनी चाहिए", maxScore: 4 },
        { id: "S5-3", pillar: "S5", labelEn: "Daily FG report submitted to production/planning team on time", labelHi: "रोज़ FG रिपोर्ट समय पर प्रोडक्शन और प्लानिंग को भेजो", maxScore: 4 }
      ]
    },
    "Z-05": {
      id: "Z-05", name: "Quality Lab", nameHi: "गुणवत्ता प्रयोगशाला",
      leader: "Mr. Amit Sharma", email: "amit.sharma@packmasters.in",
      auditDay: "Wednesday", auditDayNum: 3, department: "Quality Assurance", driveFolderId: "",
      criteria: [
        { id: "S1-1", pillar: "S1", labelEn: "Expired reagents, standards, and reference samples disposed — COD register updated", labelHi: "एक्सपायर हो गए केमिकल और नमूने हटाओ — COD रजिस्टर में लिखो", maxScore: 4 },
        { id: "S1-2", pillar: "S1", labelEn: "Retention samples beyond retention period cleared and logged", labelHi: "जिन सैम्पल की मियाद खत्म हो गई, हटाओ और लिखो", maxScore: 4 },
        { id: "S1-3", pillar: "S1", labelEn: "Redundant glassware, broken instruments removed — not occupying bench space", labelHi: "टूटे काँच के बर्तन और खराब उपकरण हटाओ — बेंच पर जगह घेरने का काम नहीं", maxScore: 4 },
        { id: "S2-1", pillar: "S2", labelEn: "All instruments at designated positions — calibration sticker visible on each", labelHi: "हर उपकरण अपनी जगह पर हो — कैलिब्रेशन का स्टिकर दिखना चाहिए", maxScore: 4 },
        { id: "S2-2", pillar: "S2", labelEn: "Reagents and chemicals in labelled storage — incompatibles segregated", labelHi: "केमिकल लेबल वाली जगह पर रखो — जो साथ नहीं रख सकते, उन्हें अलग रखो", maxScore: 4 },
        { id: "S2-3", pillar: "S2", labelEn: "Testing workbench layout matches standard — no clutter between tests", labelHi: "बेंच का सामान तय तरीके से लगा हो — एक टेस्ट के बाद अगले से पहले साफ करो", maxScore: 4 },
        { id: "S3-1", pillar: "S3", labelEn: "Work surfaces and instruments cleaned after each test session", labelHi: "हर टेस्ट के बाद बेंच और उपकरण साफ करो", maxScore: 4 },
        { id: "S3-2", pillar: "S3", labelEn: "Balance/weighing area free of powder residue and spillage", labelHi: "तराज़ू वाली जगह पर पाउडर या कुछ गिरा न हो", maxScore: 4 },
        { id: "S3-3", pillar: "S3", labelEn: "Chemical waste disposed per SOP — not left in open containers overnight", labelHi: "केमिकल का कचरा SOP के हिसाब से फेंको — रात भर खुला मत छोड़ो", maxScore: 4 },
        { id: "S4-1", pillar: "S4", labelEn: "Instrument calibration records current — no overdue calibrations", labelHi: "सभी उपकरणों का कैलिब्रेशन समय पर हो — कोई पिछड़ा न हो", maxScore: 4 },
        { id: "S4-2", pillar: "S4", labelEn: "Test methods/SOPs displayed at workstation — correct version in use", labelHi: "टेस्ट की SOP सामने लगी हो — नई वाली, पुरानी नहीं", maxScore: 4 },
        { id: "S4-3", pillar: "S4", labelEn: "COA / test reports issued within agreed TAT for every batch tested", labelHi: "हर बैच की रिपोर्ट तय समय में दो", maxScore: 4 },
        { id: "S5-1", pillar: "S5", labelEn: "Open NCRs/CAPAs reviewed weekly — no overdue actions", labelHi: "हर हफ्ते खुली NCR और CAPA देखो — कोई पिछड़ा काम न रहे", maxScore: 4 },
        { id: "S5-2", pillar: "S5", labelEn: "Lab personnel training matrix current — all staff trained on relevant SOPs", labelHi: "लैब का ट्रेनिंग चार्ट नया हो — सब लोग अपनी SOP जानते हों", maxScore: 4 },
        { id: "S5-3", pillar: "S5", labelEn: "Lab 5S self-audit completed and findings acted upon this month", labelHi: "इस महीने लैब का खुद का 5S ऑडिट हुआ हो और कमियाँ सुधारी हों", maxScore: 4 }
      ]
    },
    "Z-06": {
      id: "Z-06", name: "Maintenance Workshop", nameHi: "रखरखाव कार्यशाला",
      leader: "Mr. Deepak Joshi", email: "deepak.joshi@packmasters.in",
      auditDay: "Wednesday", auditDayNum: 3, department: "Maintenance", driveFolderId: "",
      criteria: [
        { id: "S1-1", pillar: "S1", labelEn: "Scrap metal, worn-out parts, and end-of-life spares removed from workshop", labelHi: "कबाड़, घिसे पुर्जे और पुराने स्पेयर वर्कशॉप से हटाओ", maxScore: 4 },
        { id: "S1-2", pillar: "S1", labelEn: "Only current job work-in-progress on workbench — completed jobs returned to store", labelHi: "बेंच पर सिर्फ चालू काम रखो — जो हो गया, स्टोर में वापस करो", maxScore: 4 },
        { id: "S1-3", pillar: "S1", labelEn: "Oil drums and lubricant containers without labels removed or relabelled", labelHi: "बिना लेबल के तेल के डिब्बे हटाओ या लेबल लगाओ", maxScore: 4 },
        { id: "S2-1", pillar: "S2", labelEn: "Hand tools on shadow board — every tool has a home, missing tools visible instantly", labelHi: "हर औज़ार शैडो बोर्ड पर — एक नज़र में पता चले कौन सा गायब है", maxScore: 4 },
        { id: "S2-2", pillar: "S2", labelEn: "Spare parts in labelled bins by equipment/machine — correct location cards", labelHi: "स्पेयर पार्ट्स मशीन के हिसाब से लेबल किए डिब्बे में — जगह का कार्ड लगा हो", maxScore: 4 },
        { id: "S2-3", pillar: "S2", labelEn: "PPM schedule board current — overdue PMs highlighted in red", labelHi: "PM शेड्यूल बोर्ड नया हो — जो पिछड़ गया है वो लाल रंग में दिखे", maxScore: 4 },
        { id: "S3-1", pillar: "S3", labelEn: "Workshop floor free of oil puddles, metal filings, and welding slag", labelHi: "फर्श पर तेल का गड्ढा, धातु का बुरादा या वेल्डिंग का मैल न हो", maxScore: 4 },
        { id: "S3-2", pillar: "S3", labelEn: "Tools cleaned and oiled before returning to storage — no rust or grease build-up", labelHi: "औज़ार साफ करके तेल लगाकर रखो — जंग या पुराना ग्रीस न जमा हो", maxScore: 4 },
        { id: "S3-3", pillar: "S3", labelEn: "Used oil/coolant collected in labelled containers — no open drain discharge", labelHi: "पुराना तेल/कूलेंट लेबल वाले डिब्बे में भरो — नाली में मत बहाओ", maxScore: 4 },
        { id: "S4-1", pillar: "S4", labelEn: "PPM completion rate ≥90% for current month — logged in maintenance system", labelHi: "इस महीने 90% से ज़्यादा PM काम हुआ हो — सिस्टम में दर्ज हो", maxScore: 4 },
        { id: "S4-2", pillar: "S4", labelEn: "Breakdown maintenance log updated within 1 hour of each breakdown", labelHi: "मशीन बंद पड़े तो 1 घंटे में लॉग में लिखो", maxScore: 4 },
        { id: "S4-3", pillar: "S4", labelEn: "Root cause and corrective action documented for every repeat breakdown", labelHi: "जो खराबी बार-बार आए — उसकी जड़ ढूंढो और लिखो कि क्या किया", maxScore: 4 },
        { id: "S5-1", pillar: "S5", labelEn: "Mean Time Between Failures (MTBF) trend displayed and improving", labelHi: "मशीन कितनी देर बिना टूटे चलती है — वो ट्रेंड दिखाई दे और बेहतर हो रहा हो", maxScore: 4 },
        { id: "S5-2", pillar: "S5", labelEn: "Technician skills matrix updated — training gaps identified and planned", labelHi: "कौन तकनीशियन क्या जानता है — चार्ट नया हो, कमी की ट्रेनिंग प्लान हो", maxScore: 4 },
        { id: "S5-3", pillar: "S5", labelEn: "Safety incidents / near misses in workshop reported and investigated this month", labelHi: "इस महीने वर्कशॉप में कोई हादसा या बाल-बाल बचने वाली बात रिपोर्ट हुई हो", maxScore: 4 }
      ]
    },
    "Z-07": {
      id: "Z-07", name: "Office & Admin Area", nameHi: "कार्यालय और प्रशासन",
      leader: "Mr. Sanjay Gupta", email: "sanjay.gupta@packmasters.in",
      auditDay: "Thursday", auditDayNum: 4, department: "Administration", driveFolderId: "",
      criteria: [
        { id: "S1-1", pillar: "S1", labelEn: "Desk surface clear of papers older than 1 week — only active documents on desk", labelHi: "डेस्क पर 1 हफ्ते से पुराने कागज़ न हों — सिर्फ चालू काम के दस्तावेज़ रखो", maxScore: 4 },
        { id: "S1-2", pillar: "S1", labelEn: "Obsolete forms, old circulars, and superseded SOPs removed from notice boards", labelHi: "नोटिस बोर्ड से पुराने फॉर्म, सर्कुलर और पुरानी SOP हटाओ", maxScore: 4 },
        { id: "S1-3", pillar: "S1", labelEn: "Unused equipment (printers, monitors, chairs) not in office space — tagged and stored", labelHi: "जो प्रिंटर, कुर्सी, स्क्रीन काम में नहीं — टैग लगाकर बाहर रखो", maxScore: 4 },
        { id: "S2-1", pillar: "S2", labelEn: "Files in labelled folders/cabinets — any document retrievable in under 1 minute", labelHi: "फाइलें लेबल वाले फोल्डर/कैबिनेट में हों — कोई भी कागज़ 1 मिनट में मिलना चाहिए", maxScore: 4 },
        { id: "S2-2", pillar: "S2", labelEn: "Stationery at designated location — replenished to standard quantity", labelHi: "स्टेशनरी तय जगह पर हो — कम हो तो भर दो", maxScore: 4 },
        { id: "S2-3", pillar: "S2", labelEn: "Desk clear at end of each day — nothing left out overnight", labelHi: "दिन खत्म होने पर डेस्क साफ करो — रात भर कुछ बाहर न छोड़ो", maxScore: 4 },
        { id: "S3-1", pillar: "S3", labelEn: "Workstations and screens dusted — keyboards clean", labelHi: "मेज़, स्क्रीन और कीबोर्ड साफ हों", maxScore: 4 },
        { id: "S3-2", pillar: "S3", labelEn: "Common areas (pantry, meeting room) cleaned daily — no food left out", labelHi: "पैंट्री और मीटिंग रूम रोज़ साफ हो — खाना बाहर न छोड़ो", maxScore: 4 },
        { id: "S3-3", pillar: "S3", labelEn: "Waste paper bins emptied daily — shredding done for confidential documents", labelHi: "कागज़ की टोकरी रोज़ खाली करो — ज़रूरी कागज़ श्रेड करो", maxScore: 4 },
        { id: "S4-1", pillar: "S4", labelEn: "Notice board has only current announcements — outdated notices removed same day", labelHi: "नोटिस बोर्ड पर सिर्फ नई सूचनाएँ हों — पुरानी उसी दिन हटाओ", maxScore: 4 },
        { id: "S4-2", pillar: "S4", labelEn: "Document control register current — all SOPs at latest revision, old copies destroyed", labelHi: "SOP की नई कॉपी ही रखो — पुरानी नष्ट करो, रजिस्टर अपडेट हो", maxScore: 4 },
        { id: "S4-3", pillar: "S4", labelEn: "Meeting minutes and action items recorded and circulated within 24 hours", labelHi: "मीटिंग के 24 घंटे में मिनट्स और एक्शन पॉइंट सबको भेजो", maxScore: 4 },
        { id: "S5-1", pillar: "S5", labelEn: "HR records (attendance, leave, training) up to date — no backlogs", labelHi: "हाज़िरी, छुट्टी और ट्रेनिंग के रिकॉर्ड नए हों — कोई पेंडिंग न हो", maxScore: 4 },
        { id: "S5-2", pillar: "S5", labelEn: "Monthly 5S review meeting held — minutes available", labelHi: "हर महीने 5S की बैठक हो — मिनट्स उपलब्ध हों", maxScore: 4 },
        { id: "S5-3", pillar: "S5", labelEn: "Customer/visitor feedback on office cleanliness — positive or improvement noted", labelHi: "ग्राहक या विजिटर ने दफ्तर की सफाई पर अच्छा कहा हो या सुधार नोट हो", maxScore: 4 }
      ]
    },
    "Z-08": {
      id: "Z-08", name: "Dispatch & Loading Bay", nameHi: "प्रेषण और लोडिंग बे",
      leader: "Mr. Manoj Tiwari", email: "manoj.tiwari@packmasters.in",
      auditDay: "Thursday", auditDayNum: 4, department: "Logistics", driveFolderId: "",
      criteria: [
        { id: "S1-1", pillar: "S1", labelEn: "Empty pallets stacked neatly in designated zone — not scattered across dock", labelHi: "खाली पैलेट तय जगह पर रखो — डॉक पर इधर-उधर मत बिखेरो", maxScore: 4 },
        { id: "S1-2", pillar: "S1", labelEn: "Scrap packaging (straps, film, damaged cartons) removed from dock area same day", labelHi: "पट्टियाँ, फिल्म, टूटे कार्टन — उसी दिन डॉक से हटाओ", maxScore: 4 },
        { id: "S1-3", pillar: "S1", labelEn: "Loading equipment (trolleys, hand trucks) in working condition — damaged tagged", labelHi: "ट्रॉली और हैंड ट्रक ठीक हालत में हों — खराब पर टैग लगाओ", maxScore: 4 },
        { id: "S2-1", pillar: "S2", labelEn: "Dock positions numbered/marked — each vehicle assigned to its lane", labelHi: "डॉक की जगह नंबर से चिह्नित हो — हर गाड़ी अपनी लेन में जाए", maxScore: 4 },
        { id: "S2-2", pillar: "S2", labelEn: "Dispatch documents (LR, invoice, packing list) organized per shipment — not loose", labelHi: "LR, चालान, पैकिंग लिस्ट — शिपमेंट के हिसाब से साथ रखो, बिखरे नहीं", maxScore: 4 },
        { id: "S2-3", pillar: "S2", labelEn: "Weighbridge/scale at designated spot, calibrated — result pasted on dispatch note", labelHi: "काँटा तय जगह हो, कैलिब्रेट हो — वजन डिस्पैच नोट पर चिपकाओ", maxScore: 4 },
        { id: "S3-1", pillar: "S3", labelEn: "Loading bay floor swept after each truck departs — no debris, water, or oil", labelHi: "हर ट्रक जाने के बाद फर्श झाड़ो — मलबा, पानी, तेल न रहे", maxScore: 4 },
        { id: "S3-2", pillar: "S3", labelEn: "Dock levellers and seals clean and functional — no accumulated grime", labelHi: "डॉक लेवलर और सील साफ और काम करते हों — गंदगी जमी न हो", maxScore: 4 },
        { id: "S3-3", pillar: "S3", labelEn: "Pest control at dock entry (strip curtains, traps in place) — maintained and checked", labelHi: "डॉक के दरवाज़े पर पर्दे और कीड़े का जाल लगा हो — चेक करो", maxScore: 4 },
        { id: "S4-1", pillar: "S4", labelEn: "Vehicle condition checklist completed before loading every outgoing truck", labelHi: "हर ट्रक में माल भरने से पहले गाड़ी की जाँच चेकलिस्ट भरो", maxScore: 4 },
        { id: "S4-2", pillar: "S4", labelEn: "Loading sequence follows customer packing list — no shortages or extras", labelHi: "ग्राहक की पैकिंग लिस्ट के हिसाब से लोडिंग करो — न कम, न ज़्यादा", maxScore: 4 },
        { id: "S4-3", pillar: "S4", labelEn: "eWay bill / LR generated before truck departure — no post-departure documentation", labelHi: "ट्रक चलने से पहले eWay bill और LR बन जाए — बाद में नहीं", maxScore: 4 },
        { id: "S5-1", pillar: "S5", labelEn: "On-time dispatch rate ≥95% for the current month — tracked on dispatch board", labelHi: "इस महीने 95% डिस्पैच समय पर हों — डिस्पैच बोर्ड पर ट्रैक हो", maxScore: 4 },
        { id: "S5-2", pillar: "S5", labelEn: "Driver safety briefing conducted for every outgoing vehicle — log signed", labelHi: "हर गाड़ी के ड्राइवर को सेफ्टी समझाओ — लॉग में साइन लो", maxScore: 4 },
        { id: "S5-3", pillar: "S5", labelEn: "Transit damage claims — zero in current month, else root cause documented", labelHi: "इस महीने रास्ते में माल खराब होने की कोई शिकायत न आए — आए तो कारण लिखो", maxScore: 4 }
      ]
    }
  };
}

// ============================================================================
// DEFAULT CHECKLIST SCHEMA
// ============================================================================

/**
 * Returns the default CHECKLIST_SCHEMA object.
 * 20 criteria across 5 pillars. Each criterion scores 0–4 in weekly audits.
 * Daily checksheets use Pass(1)/Fail(0) per criterion.
 * Total max score for weekly audit: 80 (20 criteria × 4 points each).
 */
function getDefaultChecklistSchema_() {
  return {
    pillars: ["S1", "S2", "S3", "S4", "S5"],
    pillarNames: {
      "S1": { en: "Sort (Seiri)", hi: "छंटाई (सेइरी)" },
      "S2": { en: "Set in Order (Seiton)", hi: "व्यवस्था (सेइतोन)" },
      "S3": { en: "Shine (Seiso)", hi: "सफाई (सेइसो)" },
      "S4": { en: "Standardize (Seiketsu)", hi: "मानकीकरण (सेइकेत्सु)" },
      "S5": { en: "Sustain (Shitsuke)", hi: "अनुशासन (शित्सुके)" }
    },
    criteria: [
      // S1 — Sort
      { id: "S1-C1", pillar: "S1", labelEn: "Unnecessary items removed (Red Tag system used)", labelHi: "अनावश्यक वस्तुएं हटाई गईं (रेड टैग प्रणाली)", maxScore: 4 },
      { id: "S1-C2", pillar: "S1", labelEn: "Red Tag register updated", labelHi: "रेड टैग रजिस्टर अपडेट किया गया", maxScore: 4 },
      { id: "S1-C3", pillar: "S1", labelEn: "Before/after photos for removed items", labelHi: "हटाई गई वस्तुओं के पहले/बाद के फोटो", maxScore: 4 },
      { id: "S1-C4", pillar: "S1", labelEn: "Floor gangways clear and marked", labelHi: "फर्श गैंगवे साफ और चिन्हित", maxScore: 4 },

      // S2 — Set in Order
      { id: "S2-C1", pillar: "S2", labelEn: "Designated places for all items (shadow boards/labels)", labelHi: "सभी वस्तुओं के लिए निर्धारित स्थान", maxScore: 4 },
      { id: "S2-C2", pillar: "S2", labelEn: "Storage areas labelled and colour-coded", labelHi: "भंडारण क्षेत्र लेबल और रंग-कोडित", maxScore: 4 },
      { id: "S2-C3", pillar: "S2", labelEn: "FIFO system maintained for materials", labelHi: "सामग्री के लिए FIFO प्रणाली बनाए रखी", maxScore: 4 },
      { id: "S2-C4", pillar: "S2", labelEn: "Tools returned to designated locations after use", labelHi: "उपयोग के बाद उपकरण निर्धारित स्थानों पर लौटाए गए", maxScore: 4 },

      // S3 — Shine
      { id: "S3-C1", pillar: "S3", labelEn: "Work area clean and free of debris", labelHi: "कार्य क्षेत्र साफ और मलबे से मुक्त", maxScore: 4 },
      { id: "S3-C2", pillar: "S3", labelEn: "Cleaning schedule displayed and followed", labelHi: "सफाई अनुसूची प्रदर्शित और अनुसरण", maxScore: 4 },
      { id: "S3-C3", pillar: "S3", labelEn: "Equipment clean and well-maintained", labelHi: "उपकरण साफ और अच्छी तरह से रखरखाव", maxScore: 4 },
      { id: "S3-C4", pillar: "S3", labelEn: "Waste bins available, labelled, and not overflowing", labelHi: "कचरा पात्र उपलब्ध, लेबल और अतिप्रवाह नहीं", maxScore: 4 },

      // S4 — Standardize
      { id: "S4-C1", pillar: "S4", labelEn: "SOPs displayed at workstations", labelHi: "कार्यस्थलों पर SOP प्रदर्शित", maxScore: 4 },
      { id: "S4-C2", pillar: "S4", labelEn: "Visual management boards updated", labelHi: "दृश्य प्रबंधन बोर्ड अपडेट", maxScore: 4 },
      { id: "S4-C3", pillar: "S4", labelEn: "Standard operating conditions maintained", labelHi: "मानक परिचालन स्थितियां बनाए रखी गईं", maxScore: 4 },
      { id: "S4-C4", pillar: "S4", labelEn: "Safety signage visible and correct", labelHi: "सुरक्षा संकेत दृश्यमान और सही", maxScore: 4 },

      // S5 — Sustain
      { id: "S5-C1", pillar: "S5", labelEn: "5S training records up to date", labelHi: "5S प्रशिक्षण रिकॉर्ड अद्यतित", maxScore: 4 },
      { id: "S5-C2", pillar: "S5", labelEn: "Daily checksheets completed on time", labelHi: "दैनिक चेकशीट समय पर पूर्ण", maxScore: 4 },
      { id: "S5-C3", pillar: "S5", labelEn: "Improvement suggestions submitted this month", labelHi: "इस महीने सुधार सुझाव प्रस्तुत", maxScore: 4 },
      { id: "S5-C4", pillar: "S5", labelEn: "Previous audit NCs closed within target", labelHi: "पिछले ऑडिट NC लक्ष्य के भीतर बंद", maxScore: 4 }
    ],
    totalCriteria: 20,
    maxTotalScore: 80,
    dailyMaxPerCriterion: 1,
    weeklyMaxPerCriterion: 4,
    ncThreshold: 1  // Weekly score <= this value triggers NC
  };
}


// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * First-time setup: writes all configuration to ScriptProperties.
 * Call this ONCE when setting up the project, or from the Admin Menu → Refresh Config.
 * 
 * IMPORTANT: This function also reads from the Zones and ChecklistSchema sheets
 * if they exist and contain data. If they are empty, it uses defaults.
 * After this function runs, no other function should ever read those sheets.
 */
function initScriptProperties() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Attempt to read from Zones sheet; fall back to defaults
  var zoneConfig = getDefaultZoneConfig_();
  var zonesSheet = ss.getSheetByName("Zones");
  if (zonesSheet && zonesSheet.getLastRow() > 1) {
    var zonesData = zonesSheet.getDataRange().getValues(); // BATCH_READ
    var headers = zonesData[0];
    for (var r = 1; r < zonesData.length; r++) {
      var row = zonesData[r];
      var zoneId = String(row[0]).trim();
      if (zoneId && zoneConfig[zoneId]) {
        zoneConfig[zoneId].name = row[1] || zoneConfig[zoneId].name;
        zoneConfig[zoneId].nameHi = row[2] || zoneConfig[zoneId].nameHi;
        zoneConfig[zoneId].leader = row[3] || zoneConfig[zoneId].leader;
        zoneConfig[zoneId].email = row[4] || zoneConfig[zoneId].email;
        zoneConfig[zoneId].auditDay = row[5] || zoneConfig[zoneId].auditDay;
        zoneConfig[zoneId].auditDayNum = row[6] !== undefined ? row[6] : zoneConfig[zoneId].auditDayNum;
        zoneConfig[zoneId].department = row[7] || zoneConfig[zoneId].department;
        // driveFolderId is populated by createAllSheets(), not from this sheet
        if (row[8]) {
          zoneConfig[zoneId].driveFolderId = row[8];
        }
        // targetScore — column J (index 9), written by MasterSettings save
        if (row.length > 9 && row[9] !== "" && row[9] !== null && row[9] !== undefined) {
          zoneConfig[zoneId].targetScore = parseFloat(row[9]) || 70;
        }
      }
    }
  }

  // Attempt to read from ChecklistSchema sheet; fall back to defaults
  var checklistSchema = getDefaultChecklistSchema_();
  var schemaSheet = ss.getSheetByName("ChecklistSchema");
  if (schemaSheet && schemaSheet.getLastRow() > 1) {
    var schemaData = schemaSheet.getDataRange().getValues(); // BATCH_READ
    var customCriteria = [];
    for (var r = 1; r < schemaData.length; r++) {
      var sRow = schemaData[r];
      if (sRow[0] && sRow[1]) {
        customCriteria.push({
          id: String(sRow[0]).trim(),
          pillar: String(sRow[1]).trim(),
          labelEn: String(sRow[2] || ""),
          labelHi: String(sRow[3] || ""),
          maxScore: parseInt(sRow[4], 10) || 4
        });
      }
    }
    if (customCriteria.length > 0) {
      checklistSchema.criteria = customCriteria;
      checklistSchema.totalCriteria = customCriteria.length;
      checklistSchema.maxTotalScore = customCriteria.reduce(function(sum, c) { return sum + c.maxScore; }, 0);
      // Rebuild pillars list from criteria
      var pillarSet = {};
      customCriteria.forEach(function(c) { pillarSet[c.pillar] = true; });
      checklistSchema.pillars = Object.keys(pillarSet).sort();
    }
  }

  // Store everything in ScriptProperties
  props.setProperties({
    "ZONE_CONFIG": JSON.stringify(zoneConfig),
    "CHECKLIST_SCHEMA": JSON.stringify(checklistSchema),
    "DEPLOY_ID": props.getProperty("DEPLOY_ID") || "NOT_SET",
    "QR_VERSION": props.getProperty("QR_VERSION") || "1",
    "CONFIG_VERSION": String((parseInt(props.getProperty("CONFIG_VERSION") || "0", 10) + 1)),
    "MC_EMAIL": props.getProperty("MC_EMAIL") || "tarun.mishra@packmasters.in",
    "TOP_EMAIL": props.getProperty("TOP_EMAIL") || "balkrishna.mishra@packmasters.in",
    "MC_WHITELIST": props.getProperty("MC_WHITELIST") || JSON.stringify([
      "tarun.mishra@packmasters.in"
    ]),
    "SPREADSHEET_ID": ss.getId()
  }, false);

  // Log to AdminLog
  logAdminAction_("initScriptProperties", "Config initialized. Version: " + props.getProperty("CONFIG_VERSION"));

  Logger.log("✅ ScriptProperties initialized. CONFIG_VERSION: " + props.getProperty("CONFIG_VERSION"));
}


/**
 * Refreshes config from Zones and ChecklistSchema sheets into ScriptProperties.
 * This is the ONLY function that reads from those sheets.
 * Called from Admin Menu → Refresh Config.
 */
function refreshConfig() {
  initScriptProperties();
  Logger.log("✅ Config refreshed from Sheets and stored in ScriptProperties.");
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Configuration refreshed successfully. Version: " +
    PropertiesService.getScriptProperties().getProperty("CONFIG_VERSION"),
    "Config Refresh", 5
  );
}


// ============================================================================
// RUNTIME CONFIG READERS
// ============================================================================
// These functions are the ONLY way to read config at runtime.
// They NEVER touch Google Sheets. They read from PropertiesService only.

/**
 * Returns a parsed config value from ScriptProperties.
 * @param {string} key — The ScriptProperties key
 * @returns {*} Parsed JSON value, or raw string if not JSON
 */
function getConfig(key) {
  var val = PropertiesService.getScriptProperties().getProperty(key);
  if (val === null) {
    throw new Error("Config key not found: " + key + ". Run initScriptProperties() first.");
  }
  try {
    return JSON.parse(val);
  } catch (e) {
    return val; // Return raw string if not JSON
  }
}

/**
 * Returns the parsed ZONE_CONFIG object.
 * @returns {Object} Zone configuration keyed by zone ID
 */
function getZoneConfig() {
  return getConfig("ZONE_CONFIG");
}

/**
 * Returns the parsed CHECKLIST_SCHEMA object.
 * @returns {Object} Checklist schema with pillars, criteria, totals
 */
function getChecklistSchema() {
  return getConfig("CHECKLIST_SCHEMA");
}

/**
 * Returns an array of all zone IDs.
 * @returns {string[]} e.g. ["Z-01","Z-02",...,"Z-08"]
 */
function getAllZoneIds() {
  var config = getZoneConfig();
  return Object.keys(config).sort();
}

/**
 * Returns config for a single zone.
 * @param {string} zoneId — e.g. "Z-01"
 * @returns {Object} Zone config object
 */
function getZoneById(zoneId) {
  var config = getZoneConfig();
  if (!config[zoneId]) {
    throw new Error("Unknown zone ID: " + zoneId);
  }
  return config[zoneId];
}


/**
 * Returns the 5S criteria for a specific zone.
 * Falls back to the global CHECKLIST_SCHEMA criteria if the zone has none.
 * @param {string} zoneId
 * @returns {Array}
 */
function getZoneCriteria(zoneId) {
  var config = getZoneConfig();
  if (config[zoneId] && config[zoneId].criteria && config[zoneId].criteria.length > 0) {
    return config[zoneId].criteria;
  }
  return getChecklistSchema().criteria || [];
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Logs an admin action to the AdminLog sheet.
 * @param {string} action — Action name
 * @param {string} details — Description
 * @private
 */
function logAdminAction_(action, details) {
  try {
    var ss = (typeof v2GetSpreadsheet_ === "function") ? v2GetSpreadsheet_() : SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName("AdminLog");
    if (logSheet) {
      logSheet.appendRow([
        new Date(),
        Session.getActiveUser().getEmail() || "system",
        action,
        details,
        PropertiesService.getScriptProperties().getProperty("CONFIG_VERSION") || "0"
      ]);
    }
  } catch (e) {
    Logger.log("Warning: Could not write to AdminLog: " + e.message);
  }
}

/**
 * Updates the ZONE_CONFIG in ScriptProperties with new Drive folder IDs.
 * Called by 02_SheetSetup.gs after creating zone folders.
 * @param {Object} folderIdMap — { "Z-01": "folderId1", "Z-02": "folderId2", ... }
 */
function updateZoneFolderIds(folderIdMap) {
  var config = getZoneConfig();
  for (var zoneId in folderIdMap) {
    if (config[zoneId]) {
      config[zoneId].driveFolderId = folderIdMap[zoneId];
    }
  }
  PropertiesService.getScriptProperties().setProperty("ZONE_CONFIG", JSON.stringify(config));
  logAdminAction_("updateZoneFolderIds", "Updated folder IDs for " + Object.keys(folderIdMap).length + " zones.");
}

/**
 * Refreshes each zone's criteria in the live ZONE_CONFIG from the defaults in
 * 01b_ZoneData.js (getDefaultZoneCriteria_) WITHOUT touching folder IDs, names,
 * leaders or any other runtime field. Run this after editing the zone criteria
 * so the deployed audit forms pick up the new labels. Idempotent.
 * @returns {Object} { zones: N, updated: N }
 */
function reseedZoneCriteria() {
  var config = getZoneConfig();
  var defaults = getDefaultZoneCriteria_();
  var updated = 0;
  Object.keys(defaults).forEach(function (zid) {
    if (config[zid]) { config[zid].criteria = defaults[zid]; updated++; }
  });
  PropertiesService.getScriptProperties().setProperty("ZONE_CONFIG", JSON.stringify(config));
  logAdminAction_("reseedZoneCriteria", "Refreshed criteria for " + updated + " zones from defaults.");
  return { zones: Object.keys(config).length, updated: updated };
}


// ============================================================================
// MAP EDITOR — SERVER-SIDE FUNCTIONS
// ============================================================================

/**
 * Returns zone config and floor map layout for the Map Editor page.
 * Callable via google.script.run.getMapEditorData()
 * @returns {{ success:boolean, zones:Object, layout:Object }}
 */
function getMapEditorData() {
  try {
    var zones = getZoneConfig();
    var layoutJson = PropertiesService.getScriptProperties().getProperty('FLOOR_MAP_LAYOUT');
    var layout = layoutJson ? JSON.parse(layoutJson) : {};
    return { success: true, zones: zones, layout: layout };
  } catch (e) {
    logAdminAction_('getMapEditorData_ERROR', e.message);
    return { success: false, message: e.message, zones: {}, layout: {} };
  }
}

/**
 * Saves all zone data and floor map layout from the Map Editor.
 * Writes to the Zones sheet, updates ZONE_CONFIG and FLOOR_MAP_LAYOUT in ScriptProperties.
 * Callable via google.script.run.saveMapEditorData(data)
 * @param {{ zones: Array, layout: Object }} data
 * @returns {{ success:boolean, message:string }}
 */
function saveMapEditorData(data) {
  try {
    if (!data || !data.zones || !Array.isArray(data.zones)) {
      return { success: false, message: 'Invalid data: zones array required.' };
    }

    // Build ZONE_CONFIG object from zones array
    var newZoneConfig = {};
    data.zones.forEach(function(z) {
      if (!z.id || !/^Z-\d{2}$/.test(z.id)) return;
      newZoneConfig[z.id] = {
        id: z.id,
        name: z.name || '',
        nameHi: z.nameHi || '',
        leader: z.leader || '',
        email: z.email || '',
        auditDay: z.auditDay || 'Monday',
        auditDayNum: parseInt(z.auditDayNum, 10) || 1,
        department: z.dept || z.department || '',
        driveFolderId: z.driveFolderId || ''
      };
      if (z.targetScore) {
        newZoneConfig[z.id].targetScore = parseFloat(z.targetScore) || 70;
      }
    });

    if (Object.keys(newZoneConfig).length === 0) {
      return { success: false, message: 'No valid zones provided (IDs must match Z-XX format).' };
    }

    // Write zones to the Zones sheet (clear rows 2+ then rewrite)
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var zonesSheet = ss.getSheetByName('Zones');
    if (!zonesSheet) {
      return { success: false, message: 'Zones sheet not found in spreadsheet.' };
    }
    var lastRow = zonesSheet.getLastRow();
    if (lastRow > 1) {
      zonesSheet.getRange(2, 1, lastRow - 1, 10).clearContent();
    }
    var sortedIds = Object.keys(newZoneConfig).sort();
    var rows = sortedIds.map(function(id) {
      var z = newZoneConfig[id];
      return [z.id, z.name, z.nameHi, z.leader, z.email,
              z.auditDay, z.auditDayNum, z.department, z.driveFolderId,
              z.targetScore || ''];
    });
    if (rows.length > 0) {
      zonesSheet.getRange(2, 1, rows.length, 10).setValues(rows);
    }

    // Save ZONE_CONFIG and FLOOR_MAP_LAYOUT directly to ScriptProperties
    var props = PropertiesService.getScriptProperties();
    props.setProperty('ZONE_CONFIG', JSON.stringify(newZoneConfig));
    props.setProperty('FLOOR_MAP_LAYOUT', JSON.stringify(data.layout || {}));

    logAdminAction_('SAVE_MAP_EDITOR', 'zones:' + sortedIds.length + ' layout-keys:' + Object.keys(data.layout || {}).length);
    return { success: true, message: 'Saved ' + sortedIds.length + ' zones and floor layout.' };

  } catch (e) {
    logAdminAction_('SAVE_MAP_EDITOR_ERROR', e.message);
    return { success: false, message: 'Save failed: ' + e.message };
  }
}

/**
 * Adds a single new zone. Validates ID format and checks for duplicates.
 * Public wrapper for addZone_().
 * @param {Object} zoneObj — {id, name, nameHi?, leader?, email?, auditDay?, dept?}
 * @returns {{ success:boolean, message:string }}
 */
function addZone(zoneObj) {
  return addZone_(zoneObj);
}

/** @private */
function addZone_(zoneObj) {
  try {
    if (!zoneObj || !zoneObj.id) return { success: false, message: 'Zone ID is required.' };
    if (!/^Z-\d{2}$/.test(zoneObj.id)) {
      return { success: false, message: 'Zone ID must match format Z-XX (e.g. Z-09).' };
    }

    var config = getZoneConfig();
    if (config[zoneObj.id]) {
      return { success: false, message: 'Zone ' + zoneObj.id + ' already exists.' };
    }

    config[zoneObj.id] = {
      id: zoneObj.id,
      name: zoneObj.name || zoneObj.id,
      nameHi: zoneObj.nameHi || '',
      leader: zoneObj.leader || '',
      email: zoneObj.email || '',
      auditDay: zoneObj.auditDay || 'Monday',
      auditDayNum: parseInt(zoneObj.auditDayNum, 10) || 1,
      department: zoneObj.dept || zoneObj.department || '',
      driveFolderId: zoneObj.driveFolderId || ''
    };

    // Append row to Zones sheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var zonesSheet = ss.getSheetByName('Zones');
    if (zonesSheet) {
      var z = config[zoneObj.id];
      zonesSheet.appendRow([z.id, z.name, z.nameHi, z.leader, z.email,
                            z.auditDay, z.auditDayNum, z.department, z.driveFolderId, '']);
    }

    PropertiesService.getScriptProperties().setProperty('ZONE_CONFIG', JSON.stringify(config));
    logAdminAction_('ADD_ZONE', zoneObj.id + ': ' + (zoneObj.name || ''));
    return { success: true, message: 'Zone ' + zoneObj.id + ' added successfully.' };

  } catch (e) {
    return { success: false, message: 'Add zone failed: ' + e.message };
  }
}

/**
 * Deletes a zone by ID. Clears the matching row in the Zones sheet (does NOT delete the row).
 * Public wrapper for deleteZone_().
 * @param {string} zoneId — e.g. "Z-09"
 * @returns {{ success:boolean, message:string }}
 */
function deleteZone(zoneId) {
  return deleteZone_(zoneId);
}

/** @private */
function deleteZone_(zoneId) {
  try {
    if (!zoneId) return { success: false, message: 'Zone ID required.' };

    var config = getZoneConfig();
    if (!config[zoneId]) return { success: false, message: 'Zone ' + zoneId + ' not found.' };

    delete config[zoneId];
    PropertiesService.getScriptProperties().setProperty('ZONE_CONFIG', JSON.stringify(config));

    // Clear matching row in Zones sheet (preserve row numbering)
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var zonesSheet = ss.getSheetByName('Zones');
    if (zonesSheet && zonesSheet.getLastRow() > 1) {
      var sheetData = zonesSheet.getRange(2, 1, zonesSheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < sheetData.length; i++) {
        if (String(sheetData[i][0]).trim() === zoneId) {
          zonesSheet.getRange(i + 2, 1, 1, 10).clearContent();
          break;
        }
      }
    }

    logAdminAction_('DELETE_ZONE', zoneId);
    return { success: true, message: 'Zone ' + zoneId + ' deleted.' };

  } catch (e) {
    return { success: false, message: 'Delete zone failed: ' + e.message };
  }
}

/**
 * Returns the floor map layout from ScriptProperties.
 * Callable via google.script.run.getFloorMapLayout()
 * @returns {Object|null} Layout object or null if not set
 */
function getFloorMapLayout() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('FLOOR_MAP_LAYOUT');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
