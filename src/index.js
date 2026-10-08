/**
 * AndroidModKit
 *
 * Public API entry point.
 *
 * This module intentionally contains orchestration and API
 * composition rather than low-level Android, Termux, or
 * modding logic.
 *
 * @module androidmodkit
 */

import {
  ANDROID,
  isAndroid,
  getSystemProperty,
  getSystemProperties,
  getAndroidBuildInfo,
  getAndroidArchitecture,
  getNodeRuntimeInfo,
  getAndroidMemoryInfo,
  getAndroidFilesystemStatus,
  getAndroidEnvironment,
  getCommandAvailability,
  runAndroidDiagnostics,
  getAndroidSnapshot
} from "./android.js";

import {
  TERMUX,
  isTermux,
  getTermuxEnvironment,
  getTermuxPrefix,
  getTermuxHome,
  getTermuxFilesystemStatus,
  getTermuxCommandAvailability,
  getTermuxToolVersions,
  getTermuxPackageManagerInfo,
  getTermuxSharedStorageStatus,
  getTermuxShellInfo,
  getTermuxInstallationInfo,
  runTermuxDiagnostics,
  getTermuxSnapshot,
  getTermuxSummary
} from "./termux.js";

import {
  MODDING,
  formatSize,
  classifyFile,
  classifyDirectory,
  hashFile,
  detectFileSignature,
  inspectZipArchive,
  inspectModDirectory,
  inspectModFile,
  inspectMod,
  validateMod,
  summarizeArchiveEntries,
  isAndroidPackageArchive,
  detectScriptContent,
  detectModAssets,
  buildArchiveReport,
  buildProjectTree,
  readJsonMetadata,
  loadProjectMetadata,
  inspectTextFile,
  analyzeArchiveSecurity
} from "./modding.js";

/* -------------------------------------------------------------------------- */
/* Package information                                                        */
/* -------------------------------------------------------------------------- */

export const VERSION = "0.1.0";

export const NAME = "AndroidModKit";

export const PACKAGE_NAME = "androidmodkit";

export const DESCRIPTION =
  "An open-source toolkit for Android development, Termux workflows, and game modding.";

export const PLATFORM = "android";

export const RUNTIME = "node";

export const LICENSE = "MIT";

/* -------------------------------------------------------------------------- */
/* Feature information                                                        */
/* -------------------------------------------------------------------------- */

export const FEATURES = Object.freeze({
  androidDiagnostics: true,
  termuxDiagnostics: true,
  filesystemInspection: true,
  archiveInspection: true,
  apkInspection: true,
  modInspection: true,
  modValidation: true,
  fileClassification: true,
  fileHashing: true,
  scriptDetection: true,
  assetDetection: true,
  projectTree: true,
  metadataInspection: true,
  archiveSecurityAnalysis: true,

  /*
   * These are intentionally false until their actual
   * implementations exist.
   */
  archiveExtraction: false,
  fileModification: false,
  packageInstallation: false,
  packageRemoval: false,
  automaticModInstallation: false,
  cleoCompilation: false,
  androidGui: false
});

/* -------------------------------------------------------------------------- */
/* Capability detection                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Detect the current AndroidModKit environment.
 *
 * This function does not modify the system.
 *
 * @returns {Promise<object>}
 */
export async function detectEnvironment() {
  const android =
    await getAndroidSnapshot();

  const termux =
    await getTermuxSnapshot();

  return {
    android,
    termux,

    platform: {
      isAndroid: android.isAndroid,
      isTermux: termux.isTermux
    },

    runtime: {
      node: process.version,
      architecture: process.arch,
      platform: process.platform
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Combined diagnostics                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Run the complete AndroidModKit diagnostic suite.
 *
 * Android diagnostics and Termux diagnostics are executed
 * independently so a failure in one subsystem does not
 * destroy the entire report.
 *
 * @returns {Promise<object>}
 */
export async function doctor() {
  const startedAt =
    new Date().toISOString();

  const diagnostics = {
    android: null,
    termux: null
  };

  const errors = [];

  try {
    diagnostics.android =
      await runAndroidDiagnostics();
  } catch (error) {
    errors.push({
      subsystem: "android",
      message:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }

  try {
    diagnostics.termux =
      await runTermuxDiagnostics();
  } catch (error) {
    errors.push({
      subsystem: "termux",
      message:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }

  const completedAt =
    new Date().toISOString();

  return {
    ok: errors.length === 0,

    startedAt,

    completedAt,

    durationMs:
      Date.parse(completedAt) -
      Date.parse(startedAt),

    diagnostics,

    errors
  };
}

/* -------------------------------------------------------------------------- */
/* System information                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Get a concise AndroidModKit system report.
 *
 * This is intended for `amk info`.
 *
 * @returns {Promise<object>}
 */
export async function getInfo() {
  const android =
    await getAndroidSnapshot();

  const termux =
    await getTermuxSnapshot();

  return {
    androidModKit: {
      name: NAME,
      version: VERSION,
      package: PACKAGE_NAME,
      description: DESCRIPTION,
      license: LICENSE
    },

    runtime: {
      node: process.version,
      architecture: process.arch,
      platform: process.platform,
      executable: process.execPath
    },

    android: {
      detected:
        android.isAndroid,

      build:
        android.build,

      architecture:
        android.architecture,

      memory:
        android.memory
    },

    termux: {
      detected:
        termux.isTermux,

      prefix:
        termux.prefix,

      home:
        termux.home,

      shell:
        termux.shell
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Health check                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Determine whether the current environment is usable
 * for AndroidModKit.
 *
 * @returns {Promise<object>}
 */
export async function healthCheck() {
  const results = {
    node: {
      available: true,
      version: process.version
    },

    android: {
      detected: false
    },

    termux: {
      detected: false
    },

    filesystem: {
      readable: true
    },

    healthy: false
  };

  try {
    results.android.detected =
      await isAndroid();
  } catch {
    results.android.detected = false;
  }

  try {
    results.termux.detected =
      await isTermux();
  } catch {
    results.termux.detected = false;
  }

  /*
   * AndroidModKit can technically operate outside Android
   * for archive/mod inspection, so Android detection is not
   * treated as a hard failure.
   */
  results.healthy =
    results.node.available &&
    results.filesystem.readable;

  return results;
}

/* -------------------------------------------------------------------------- */
/* API namespaces                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Android subsystem.
 *
 * Consumers can use:
 *
 *   amk.android.isAndroid()
 *   amk.android.getBuildInfo()
 *   amk.android.diagnostics()
 */
export const android = Object.freeze({
  constants: ANDROID,

  isAndroid,

  getSystemProperty,

  getSystemProperties,

  getBuildInfo:
    getAndroidBuildInfo,

  getArchitecture:
    getAndroidArchitecture,

  getNodeRuntime:
    getNodeRuntimeInfo,

  getMemory:
    getAndroidMemoryInfo,

  getFilesystem:
    getAndroidFilesystemStatus,

  getEnvironment:
    getAndroidEnvironment,

  getCommands:
    getCommandAvailability,

  diagnostics:
    runAndroidDiagnostics,

  snapshot:
    getAndroidSnapshot
});

/**
 * Termux subsystem.
 *
 * Consumers can use:
 *
 *   amk.termux.isTermux()
 *   amk.termux.getSummary()
 *   amk.termux.diagnostics()
 */
export const termux = Object.freeze({
  constants: TERMUX,

  isTermux,

  getEnvironment:
    getTermuxEnvironment,

  getPrefix:
    getTermuxPrefix,

  getHome:
    getTermuxHome,

  getFilesystem:
    getTermuxFilesystemStatus,

  getCommands:
    getTermuxCommandAvailability,

  getToolVersions:
    getTermuxToolVersions,

  getPackageManager:
    getTermuxPackageManagerInfo,

  getSharedStorage:
    getTermuxSharedStorageStatus,

  getShell:
    getTermuxShellInfo,

  getInstallation:
    getTermuxInstallationInfo,

  diagnostics:
    runTermuxDiagnostics,

  snapshot:
    getTermuxSnapshot,

  summary:
    getTermuxSummary
});

/**
 * Modding subsystem.
 *
 * Consumers can use:
 *
 *   amk.modding.inspect("mod.apk")
 *   amk.modding.validate("mod.zip")
 *   amk.modding.hash("file")
 */
export const modding = Object.freeze({
  constants: MODDING,

  formatSize,

  classifyFile,

  classifyDirectory,

  hash:
    hashFile,

  detectSignature:
    detectFileSignature,

  inspectZip:
    inspectZipArchive,

  inspectDirectory:
    inspectModDirectory,

  inspectFile:
    inspectModFile,

  inspect:
    inspectMod,

  validate:
    validateMod,

  summarizeArchive:
    summarizeArchiveEntries,

  isAndroidPackage:
    isAndroidPackageArchive,

  detectScripts:
    detectScriptContent,

  detectAssets:
    detectModAssets,

  buildArchiveReport,

  buildProjectTree,

  readJsonMetadata,

  loadProjectMetadata,

  inspectText:
    inspectTextFile,

  analyzeArchiveSecurity
});

/* -------------------------------------------------------------------------- */
/* Utility namespace                                                           */
/* -------------------------------------------------------------------------- */

/**
 * General-purpose utilities exposed by AndroidModKit.
 */
export const utils = Object.freeze({
  formatSize,

  classifyFile,

  classifyDirectory,

  hashFile,

  detectFileSignature
});

/* -------------------------------------------------------------------------- */
/* Default API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Main AndroidModKit API.
 *
 * This object provides a stable interface for:
 *
 * - CLI
 * - future GUI
 * - plugins
 * - scripts
 * - external applications
 */
const AndroidModKit = Object.freeze({
  name: NAME,

  package: PACKAGE_NAME,

  version: VERSION,

  description: DESCRIPTION,

  license: LICENSE,

  platform: PLATFORM,

  runtime: RUNTIME,

  features: FEATURES,

  android,

  termux,

  modding,

  utils,

  detectEnvironment,

  doctor,

  getInfo,

  healthCheck
});

export default AndroidModKit;
