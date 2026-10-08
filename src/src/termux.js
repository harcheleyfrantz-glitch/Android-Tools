/**
 * AndroidModKit
 * Termux environment utilities.
 *
 * This module is responsible for detecting and inspecting
 * Termux environments. It does not modify packages, install
 * software, or change device configuration.
 *
 * Node.js built-ins only.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Common Termux filesystem locations.
 */
const TERMUX_PATHS = Object.freeze({
  prefix: "/data/data/com.termux/files/usr",
  home: "/data/data/com.termux/files/home",
  bin: "/data/data/com.termux/files/usr/bin",
  lib: "/data/data/com.termux/files/usr/lib",
  etc: "/data/data/com.termux/files/usr/etc",
  tmp: "/data/data/com.termux/files/usr/tmp",
  var: "/data/data/com.termux/files/usr/var",
  share: "/data/data/com.termux/files/usr/share",
  apt: "/data/data/com.termux/files/usr/var/lib/apt",
  packages: "/data/data/com.termux/files/usr/var/lib/dpkg/status"
});

/**
 * Important Termux environment variables.
 */
const TERMUX_ENVIRONMENT_KEYS = Object.freeze([
  "PREFIX",
  "HOME",
  "TMPDIR",
  "TERMUX_VERSION",
  "TERMUX_APK_RELEASE",
  "TERMUX_APP_PACKAGE_MANAGER",
  "TERMUX_MAIN_PACKAGE_FORMAT",
  "TERMUX__PREFIX",
  "LD_PRELOAD",
  "PATH",
  "SHELL",
  "LANG",
  "LC_ALL",
  "PWD"
]);

/**
 * Commands commonly used by Termux developers.
 */
const IMPORTANT_COMMANDS = Object.freeze([
  "pkg",
  "apt",
  "apt-cache",
  "dpkg",
  "bash",
  "sh",
  "git",
  "curl",
  "wget",
  "python",
  "python3",
  "node",
  "npm",
  "npx",
  "clang",
  "cmake",
  "make",
  "gcc",
  "g++",
  "tar",
  "unzip",
  "zip",
  "grep",
  "sed",
  "awk",
  "find",
  "ssh",
  "openssl"
]);

/**
 * Safely check whether a filesystem path exists.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function exists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine whether a path is a directory.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Determine whether a path is readable.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function isReadable(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine whether a path is writable.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function isWritable(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command safely.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {object} options
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string, code: number|null}>}
 */
async function runCommand(command, args = [], options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      timeout: options.timeout ?? 5000,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      windowsHide: true
    });

    return {
      ok: true,
      stdout: result.stdout?.trim() ?? "",
      stderr: result.stderr?.trim() ?? "",
      code: 0
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.trim() ?? "",
      stderr: error.stderr?.trim() ?? "",
      code:
        typeof error.code === "number"
          ? error.code
          : null
    };
  }
}

/**
 * Determine whether the current environment is Termux.
 *
 * Multiple indicators are used because environment variables
 * can be changed or missing in custom Termux configurations.
 *
 * @returns {boolean}
 */
export function isTermux() {
  const prefix = process.env.PREFIX ?? "";

  const environmentIndicators = [
    Boolean(process.env.TERMUX_VERSION),
    Boolean(process.env.TERMUX_APK_RELEASE),
    prefix.includes("/com.termux/"),
    prefix.includes("/data/data/com.termux/")
  ];

  const filesystemIndicators = [
    exists(TERMUX_PATHS.prefix),
    exists(TERMUX_PATHS.home),
    exists(TERMUX_PATHS.bin)
  ];

  return (
    environmentIndicators.some(Boolean) ||
    filesystemIndicators.some(Boolean)
  );
}

/**
 * Get Termux-related environment variables.
 *
 * Sensitive or unrelated process variables are deliberately
 * excluded from the returned object.
 *
 * @returns {object}
 */
export function getTermuxEnvironment() {
  return Object.fromEntries(
    TERMUX_ENVIRONMENT_KEYS.map((key) => [
      key,
      process.env[key] ?? null
    ])
  );
}

/**
 * Determine the active Termux prefix.
 *
 * @returns {string}
 */
export function getPrefix() {
  return (
    process.env.PREFIX ||
    TERMUX_PATHS.prefix
  );
}

/**
 * Determine the active Termux home directory.
 *
 * @returns {string}
 */
export function getHomeDirectory() {
  return (
    process.env.HOME ||
    TERMUX_PATHS.home
  );
}

/**
 * Inspect the standard Termux filesystem.
 *
 * @returns {object}
 */
export function getFilesystemStatus() {
  const result = {};

  for (const [name, targetPath] of Object.entries(
    TERMUX_PATHS
  )) {
    result[name] = {
      path: targetPath,
      exists: exists(targetPath),
      directory: isDirectory(targetPath),
      readable: isReadable(targetPath),
      writable: isWritable(targetPath)
    };
  }

  return result;
}

/**
 * Find a command using the shell's command lookup.
 *
 * @param {string} command
 * @returns {Promise<string|null>}
 */
async function findCommand(command) {
  const result = await runCommand(
    "sh",
    ["-c", `command -v ${command}`],
    {
      timeout: 2500,
      maxBuffer: 64 * 1024
    }
  );

  if (!result.ok || !result.stdout) {
    return null;
  }

  return result.stdout.split("\n")[0].trim() || null;
}

/**
 * Inspect availability and paths of important commands.
 *
 * @returns {Promise<object>}
 */
export async function getCommandStatus() {
  const entries = await Promise.all(
    IMPORTANT_COMMANDS.map(async (command) => {
      const location = await findCommand(command);

      return [
        command,
        {
          installed: Boolean(location),
          path: location
        }
      ];
    })
  );

  return Object.fromEntries(entries);
}

/**
 * Get versions for important development tools.
 *
 * Commands are only executed when available.
 *
 * @returns {Promise<object>}
 */
export async function getToolVersions() {
  const tools = {
    node: ["node", ["--version"]],
    npm: ["npm", ["--version"]],
    python: ["python", ["--version"]],
    python3: ["python3", ["--version"]],
    git: ["git", ["--version"]],
    clang: ["clang", ["--version"]],
    cmake: ["cmake", ["--version"]],
    make: ["make", ["--version"]],
    curl: ["curl", ["--version"]],
    openssl: ["openssl", ["version"]]
  };

  const results = {};

  for (const [name, [command, args]] of Object.entries(
    tools
  )) {
    const location = await findCommand(command);

    if (!location) {
      results[name] = {
        installed: false,
        version: null
      };

      continue;
    }

    const result = await runCommand(
      command,
      args,
      {
        timeout: 4000,
        maxBuffer: 512 * 1024
      }
    );

    const output = result.stdout || result.stderr;

    const firstLine =
      output
        ?.split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? null;

    results[name] = {
      installed: result.ok,
      path: location,
      version: firstLine
    };
  }

  return results;
}

/**
 * Retrieve Termux package-manager information.
 *
 * Supports both pkg and apt environments.
 *
 * @returns {Promise<object>}
 */
export async function getPackageManagerInfo() {
  const pkg = await findCommand("pkg");
  const apt = await findCommand("apt");
  const dpkg = await findCommand("dpkg");

  let packageCount = null;

  if (dpkg) {
    const result = await runCommand(
      "dpkg",
      ["--get-selections"],
      {
        timeout: 5000,
        maxBuffer: 4 * 1024 * 1024
      }
    );

    if (result.ok) {
      packageCount = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .length;
    }
  }

  return {
    pkg: {
      available: Boolean(pkg),
      path: pkg
    },
    apt: {
      available: Boolean(apt),
      path: apt
    },
    dpkg: {
      available: Boolean(dpkg),
      path: dpkg
    },
    installedPackageCount: packageCount
  };
}

/**
 * Check whether Termux storage integration appears
 * to be available.
 *
 * This does not request permissions or modify storage.
 *
 * @returns {Promise<object>}
 */
export async function getStorageStatus() {
  const sharedStorage =
    process.env.EXTERNAL_STORAGE ||
    "/storage/emulated/0";

  const home =
    getHomeDirectory();

  const storagePaths = {
    sharedStorage,
    home,
    downloads: path.join(
      sharedStorage,
      "Download"
    ),
    documents: path.join(
      sharedStorage,
      "Documents"
    ),
    dcim: path.join(
      sharedStorage,
      "DCIM"
    ),
    pictures: path.join(
      sharedStorage,
      "Pictures"
    )
  };

  const result = {};

  for (const [name, targetPath] of Object.entries(
    storagePaths
  )) {
    result[name] = {
      path: targetPath,
      exists: exists(targetPath),
      readable: isReadable(targetPath),
      writable: isWritable(targetPath)
    };
  }

  return result;
}

/**
 * Inspect shell information.
 *
 * @returns {Promise<object>}
 */
export async function getShellInfo() {
  const shell =
    process.env.SHELL ||
    "/bin/sh";

  const shellName =
    path.basename(shell);

  const shellCheck = await runCommand(
    shell,
    ["--version"],
    {
      timeout: 2500,
      maxBuffer: 512 * 1024
    }
  );

  return {
    path: shell,
    name: shellName,
    available: exists(shell),
    version:
      shellCheck.stdout
        ?.split("\n")
        .map((line) => line.trim())
        .find(Boolean) ??
      shellCheck.stderr
        ?.split("\n")
        .map((line) => line.trim())
        .find(Boolean) ??
      null
  };
}

/**
 * Detect common Termux installation characteristics.
 *
 * @returns {Promise<object>}
 */
export async function getInstallationInfo() {
  const environment = getTermuxEnvironment();

  const version =
    environment.TERMUX_VERSION;

  const apkRelease =
    environment.TERMUX_APK_RELEASE;

  const packageManager =
    environment.TERMUX_APP_PACKAGE_MANAGER;

  const packageFormat =
    environment.TERMUX_MAIN_PACKAGE_FORMAT;

  const packageDatabase =
    TERMUX_PATHS.packages;

  return {
    detected: isTermux(),
    version,
    apkRelease,
    packageManager,
    packageFormat,
    packageDatabase: {
      path: packageDatabase,
      exists: exists(packageDatabase),
      readable: isReadable(packageDatabase)
    }
  };
}

/**
 * Run a safe Termux health check.
 *
 * The diagnostic system only reads information.
 * It never installs, removes, upgrades, or changes packages.
 *
 * @returns {Promise<object>}
 */
export async function runTermuxDiagnostics() {
  const detected = isTermux();

  if (!detected) {
    return {
      detected: false,
      healthy: false,
      warnings: [],
      errors: [
        "Termux could not be confirmed in the current environment."
      ]
    };
  }

  const [
    filesystem,
    commands,
    tools,
    packages,
    storage,
    shell,
    installation
  ] = await Promise.all([
    Promise.resolve(getFilesystemStatus()),
    getCommandStatus(),
    getToolVersions(),
    getPackageManagerInfo(),
    getStorageStatus(),
    getShellInfo(),
    getInstallationInfo()
  ]);

  const warnings = [];
  const errors = [];

  if (!filesystem.prefix.exists) {
    errors.push(
      "The Termux prefix directory could not be found."
    );
  }

  if (!filesystem.home.exists) {
    warnings.push(
      "The configured Termux home directory does not exist."
    );
  }

  if (!filesystem.prefix.writable) {
    warnings.push(
      "The Termux prefix does not appear to be writable."
    );
  }

  if (!commands.git.installed) {
    warnings.push(
      "Git is not installed or is not available in PATH."
    );
  }

  if (!commands.node.installed) {
    warnings.push(
      "Node.js is not installed or is not available in PATH."
    );
  }

  if (!commands.python.installed &&
      !commands.python3.installed) {
    warnings.push(
      "Python is not installed or is not available in PATH."
    );
  }

  if (!commands.clang.installed) {
    warnings.push(
      "Clang is not available. Native Android/Termux builds may not work."
    );
  }

  if (!storage.sharedStorage.exists) {
    warnings.push(
      "Shared Android storage is not currently accessible."
    );
  }

  if (
    storage.sharedStorage.exists &&
    !storage.sharedStorage.writable
  ) {
    warnings.push(
      "Shared Android storage exists but is not writable."
    );
  }

  if (!packages.pkg.available &&
      !packages.apt.available) {
    errors.push(
      "No supported Termux package manager was detected."
    );
  }

  return {
    detected,
    healthy:
      errors.length === 0 &&
      warnings.length === 0,

    warnings,
    errors,

    installation,
    filesystem,
    commands,
    tools,
    packages,
    storage,
    shell
  };
}

/**
 * Generate a complete Termux environment snapshot.
 *
 * Useful for diagnostics, support reports, and future
 * AndroidModKit troubleshooting tools.
 *
 * @returns {Promise<object>}
 */
export async function getTermuxSnapshot() {
  const diagnostics =
    await runTermuxDiagnostics();

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),

    environment: getTermuxEnvironment(),

    system: {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      kernel: os.release(),
      hostname: os.hostname()
    },

    paths: TERMUX_PATHS,

    diagnostics
  };
}

/**
 * Return a compact summary suitable for CLI output.
 *
 * @returns {Promise<object>}
 */
export async function getTermuxSummary() {
  const diagnostics =
    await runTermuxDiagnostics();

  const installedTools =
    Object.entries(
      diagnostics.commands ?? {}
    )
      .filter(([, info]) => info.installed)
      .map(([name]) => name);

  return {
    detected: diagnostics.detected,
    healthy: diagnostics.healthy,
    termuxVersion:
      diagnostics.installation?.version ?? null,
    packageManager:
      diagnostics.installation?.packageManager ??
      (diagnostics.packages?.pkg?.available
        ? "pkg"
        : diagnostics.packages?.apt?.available
          ? "apt"
          : null),
    installedTools,
    warnings: diagnostics.warnings ?? [],
    errors: diagnostics.errors ?? []
  };
}

/**
 * Export immutable path information for other
 * AndroidModKit modules.
 */
export const TERMUX = Object.freeze({
  paths: TERMUX_PATHS,
  commands: IMPORTANT_COMMANDS
});
