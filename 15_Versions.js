/**
 * ============================================================================
 * 15_Versions.gs — PackMasters 5S Integrated System
 * Phase 5: Version Tracking
 * ============================================================================
 */

var PROJECT_VERSION = {
  current: "1.0.0",
  system: "PackMasters 5S Integrated Management System",
  compliance: "ZED-2 & ISO 9001:2015",
  phases: {
    "1.0.0": {
      date: "2025-04-01",
      phases: "1-5 (Complete)",
      description: "Full system deployment: Config, Forms, Automation, Dashboards, Hardening",
      files: [
        "01_Config.gs", "02_SheetSetup.gs", "03_QRGenerator.gs", "04_AdminUtils.gs",
        "05_WebApp.gs", "06_Triggers.gs", "07_Aggregation.gs", "08_CAPAEngine.gs",
        "09_EmailEngine.gs", "10_Archive.gs", "11_DataService.gs",
        "12_ErrorHandling.gs", "13_TestSuite.gs", "14_HealthCheck.gs", "15_Versions.gs",
        "HomePage.html", "LandingPage.html", "DailyForm.html", "WeeklyForm.html",
        "CommonStyles.html", "ServiceWorker.js",
        "ZoneDashboard.html", "AuditReport.html", "MRMSummary.html",
        "CAPATracker.html", "PhotoGallery.html", "HistoricalView.html"
      ]
    }
  }
};

/**
 * Returns the current project version string.
 * @returns {string}
 */
function getProjectVersion() {
  return PROJECT_VERSION.current;
}

/**
 * Returns full version info.
 * @returns {Object}
 */
function getVersionInfo() {
  return PROJECT_VERSION;
}
