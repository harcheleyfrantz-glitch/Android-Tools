/**
 * AndroidModKit
 * Android environment and device utilities.
 *
 * This module intentionally uses Node.js built-ins only.
 * It is designed to work in Termux without requiring
 * additional native dependencies.
 */

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Common Android filesystem locations.
 * Availability varies depending on Android version,
 * Termux configuration, and device permissions.
 */
const ANDROID_PATHS = Object.freeze({
  system: "/system",
  systemBin: "/system/bin",
  vendor: "/vendor",
  data: "/data",
  dataLocal: "/data/local",
  dataLocalTmp: "/data/local/tmp",
  sdcard: "/sdcard",
  storage: "/storage/emulated/0",
  termuxHome: "/data/data/com.termux/files/home",
  termuxPrefix: "/data/data/com.termux/files/usr"
});

/**
 * Environment variables commonly exposed by Android,
 * Termux, or Android-compatible environments.
 */
const ENVIRONMENT_KEYS = Object.freeze([
  "ANDROID_ROOT",
  "ANDROID_DATA",
  "ANDROID_STORAGE",
  "EXTERNAL_STORAGE",
  "PREFIX",
  "TERMUX_VERSION",
  "TERMUX_APK_RELEASE",
  "HOME",
  "PATH"
]);

/**
 * Safely determine whether a path exists.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read a text file.
 *
 * @param {string} filePath
 * @returns {string|null}
 */
function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * Read an Android system property using getprop.
 *
 * @param {string} property
 * @returns {Promise<string|null>}
 */
async function getSystemProperty(property) {
  try {
    const { stdout } = await execFileAsync(
      "getprop",
      [property],
      {
        timeout: 3000,
        maxBuffer: 1024 * 1024
      }
    );

    const value = stdout.trim();

    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Read several Android system properties.
 *
 * @param {string[]} properties
 * @returns {Promise<Record<string, string|null>>}
 */
async function getSystemProperties(properties) {
  const entries = await Promise.all(
    properties.map(async (property) => {
      return [property, await getSystemProperty(property)];
    })
  );

  return Object.fromEntries(entries);
}

/**
 * Detect whether the current process appears to be running
 * inside an Android environment.
 *
 * This intentionally uses multiple indicators instead of
 * relying on a single environment variable.
 *
 * @returns {Promise<boolean>}
 */
export async function isAndroid() {
  const indicators = [
    process.env.ANDROID_ROOT,
    process.env.ANDROID_DATA,
    process.env.ANDROID_STORAGE,
    process.env.EXTERNAL_STORAGE
  ];

  if (indicators.some(Boolean)) {
    return true;
  }

  const filesystemIndicators = [
    ANDROID_PATHS.system,
    ANDROID_PATHS.vendor,
    ANDROID_PATHS.data
  ];

  if (filesystemIndicators.some(pathExists)) {
    return true;
  }

  const release = await getSystemProperty("ro.build.version.release");
  const sdk = await getSystemProperty("ro.build.version.sdk");

  return Boolean(release || sdk);
}

/**
 * Determine whether the current environment is probably
 * running inside Termux.
 *
 * @returns {boolean}
 */
export function isTermux() {
  const prefix = process.env.PREFIX ?? "";
  const termuxVersion = process.env.TERMUX_VERSION;
  const termuxRelease = process.env.TERMUX_APK_RELEASE;

  if (termuxVersion || termuxRelease) {
    return true;
  }

  return (
    prefix.includes("/com.termux/") ||
    prefix.includes("/data/data/com.termux/") ||
    pathExists(ANDROID_PATHS.termuxPrefix)
  );
}

/**
 * Retrieve basic Android build information.
 *
 * @returns {Promise<object>}
 */
export async function getAndroidBuildInfo() {
  const properties = await getSystemProperties([
    "ro.build.version.release",
    "ro.build.version.sdk",
    "ro.build.version.codename",
    "ro.build.version.security_patch",
    "ro.build.id",
    "ro.build.display.id",
    "ro.build.type",
    "ro.build.tags",
    "ro.product.brand",
    "ro.product.manufacturer",
    "ro.product.model",
    "ro.product.device",
    "ro.product.name",
    "ro.product.board",
    "ro.hardware",
    "ro.bootloader",
    "ro.build.version.incremental"
  ]);

  return {
    androidVersion: properties["ro.build.version.release"],
    sdkVersion: properties["ro.build.version.sdk"],
    codename: properties["ro.build.version.codename"],
    securityPatch: properties["ro.build.version.security_patch"],
    buildId: properties["ro.build.id"],
    displayId: properties["ro.build.display.id"],
    buildType: properties["ro.build.type"],
    buildTags: properties["ro.build.tags"],
    brand: properties["ro.product.brand"],
    manufacturer: properties["ro.product.manufacturer"],
    model: properties["ro.product.model"],
    device: properties["ro.product.device"],
    product: properties["ro.product.name"],
    board: properties["ro.product.board"],
    hardware: properties["ro.hardware"],
    bootloader: properties["ro.bootloader"],
    incrementalBuild: properties["ro.build.version.incremental"]
  };
}

/**
 * Determine CPU architecture using Node's runtime
 * and Android system properties when available.
 *
 * @returns {Promise<object>}
 */
export async function getArchitectureInfo() {
  const [supportedAbis, primaryAbi] = await Promise.all([
    getSystemProperty("ro.product.cpu.abilist"),
    getSystemProperty("ro.product.cpu.abi")
  ]);

  const nodeArchitecture = process.arch;

  const abiList = supportedAbis
    ? supportedAbis
        .split(",")
        .map((abi) => abi.trim())
        .filter(Boolean)
    : [];

  return {
    nodeArchitecture,
    primaryAbi,
    supportedAbis: abiList,
    isArm64:
      nodeArchitecture === "arm64" ||
      abiList.includes("arm64-v8a"),
    isArm32:
      nodeArchitecture === "arm" ||
      abiList.includes("armeabi-v7a"),
    isX64:
      nodeArchitecture === "x64" ||
      abiList.includes("x86_64"),
    isX86:
      nodeArchitecture === "ia32" ||
      abiList.includes("x86")
  };
}

/**
 * Get information about the Node.js runtime currently
 * executing AndroidModKit.
 *
 * @returns {object}
 */
export function getRuntimeInfo() {
  return {
    nodeVersion: process.version,
    nodeMajorVersion: Number.parseInt(
      process.versions.node.split(".")[0],
      10
    ),
    platform: process.platform,
    architecture: process.arch,
    operatingSystem: os.type(),
    kernelRelease: os.release(),
    hostname: os.hostname(),
    uptimeSeconds: os.uptime(),
    cpuCount: os.cpus().length
  };
}

/**
 * Get memory information available to the Node process.
 *
 * @returns {object}
 */
export function getMemoryInfo() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();

  const usedBytes = Math.max(
    0,
    totalBytes - freeBytes
  );

  const toMiB = (bytes) =>
    Math.round(bytes / 1024 / 1024);

  const toGiB = (bytes) =>
    Number((bytes / 1024 / 1024 / 1024).toFixed(2));

  return {
    totalBytes,
    freeBytes,
    usedBytes,
    totalMiB: toMiB(totalBytes),
    freeMiB: toMiB(freeBytes),
    usedMiB: toMiB(usedBytes),
    totalGiB: toGiB(totalBytes),
    freeGiB: toGiB(freeBytes),
    usedGiB: toGiB(usedBytes),
    usagePercent: Number(
      ((usedBytes / totalBytes) * 100).toFixed(1)
    )
  };
}

/**
 * Check whether common Android filesystem locations
 * are accessible.
 *
 * @returns {object}
 */
export function getFilesystemStatus() {
  const result = {};

  for (const [name, targetPath] of Object.entries(
    ANDROID_PATHS
  )) {
    result[name] = {
      path: targetPath,
      exists: pathExists(targetPath)
    };
  }

  return result;
}

/**
 * Retrieve selected environment variables without exposing
 * the entire process environment.
 *
 * @returns {object}
 */
export function getAndroidEnvironment() {
  return Object.fromEntries(
    ENVIRONMENT_KEYS.map((key) => [
      key,
      process.env[key] ?? null
    ])
  );
}

/**
 * Determine whether useful Android command-line tools
 * are available.
 *
 * @returns {Promise<object>}
 */
export async function getCommandAvailability() {
  const commands = [
    "adb",
    "am",
    "pm",
    "getprop",
    "settings",
    "termux-info",
    "pkg",
    "git",
    "python",
    "node",
    "npm"
  ];

  const result = {};

  for (const command of commands) {
    try {
      await execFileAsync(
        "sh",
        ["-c", `command -v ${command}`],
        {
          timeout: 2000,
          maxBuffer: 64 * 1024
        }
      );

      result[command] = true;
    } catch {
      result[command] = false;
    }
  }

  return result;
}

/**
 * Run a lightweight Android health check.
 *
 * This function does not modify the device and does not
 * install packages or change permissions.
 *
 * @returns {Promise<object>}
 */
export async function runAndroidDiagnostics() {
  const android = await isAndroid();
  const termux = isTermux();

  const [
    build,
    architecture,
    commands
  ] = await Promise.all([
    getAndroidBuildInfo(),
    getArchitectureInfo(),
    getCommandAvailability()
  ]);

  const filesystem = getFilesystemStatus();
  const runtime = getRuntimeInfo();
  const memory = getMemoryInfo();

  const warnings = [];
  const errors = [];

  if (!android) {
    errors.push(
      "Android could not be confirmed from the available environment."
    );
  }

  if (android && !build.sdkVersion) {
    warnings.push(
      "Android SDK version could not be detected."
    );
  }

  if (termux && !commands.node) {
    warnings.push(
      "Node.js is not available in the current PATH."
    );
  }

  if (termux && !commands.git) {
    warnings.push(
      "Git is not available in the current PATH."
    );
  }

  if (memory.totalGiB < 2) {
    warnings.push(
      "The environment reports less than 2 GiB of total memory."
    );
  }

  return {
    timestamp: new Date().toISOString(),

    environment: {
      isAndroid: android,
      isTermux: termux
    },

    build,
    architecture,
    runtime,
    memory,
    filesystem,
    commands,

    warnings,
    errors,

    healthy:
      errors.length === 0 &&
      warnings.length === 0
  };
}

/**
 * Return a complete environment snapshot.
 *
 * This is intended for `amk info`, diagnostics,
 * bug reports, and future support tooling.
 *
 * @returns {Promise<object>}
 */
export async function getAndroidSnapshot() {
  const [
    android,
    build,
    architecture,
    commands,
    diagnostics
  ] = await Promise.all([
    isAndroid(),
    getAndroidBuildInfo(),
    getArchitectureInfo(),
    getCommandAvailability(),
    runAndroidDiagnostics()
  ]);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),

    environment: {
      isAndroid: android,
      isTermux: isTermux()
    },

    android: {
      build,
      architecture,
      filesystem: getFilesystemStatus(),
      environment: getAndroidEnvironment()
    },

    runtime: getRuntimeInfo(),
    memory: getMemoryInfo(),
    commands,

    diagnostics: {
      warnings: diagnostics.warnings,
      errors: diagnostics.errors,
      healthy: diagnostics.healthy
    }
  };
}

/**
 * Export Android path constants for other AndroidModKit
 * modules without exposing mutable internal state.
 */
export const ANDROID = Object.freeze({
  paths: ANDROID_PATHS
});
