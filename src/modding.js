/**
 * AndroidModKit
 * Modding and project inspection utilities.
 *
 * Design goals:
 * - Read-only by default
 * - No arbitrary command execution
 * - No automatic extraction
 * - No modification of user files
 * - Dependency-free
 * - Safe handling of untrusted archives
 * - Useful structured results for CLI and future GUI clients
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_INSPECTION_FILE_SIZE = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;
const MAX_STRING_LENGTH = 500;

const MOD_EXTENSIONS = Object.freeze({
  archives: new Set([
    ".zip",
    ".7z",
    ".rar",
    ".tar",
    ".gz",
    ".tgz",
    ".bz2",
    ".xz"
  ]),

  androidPackages: new Set([
    ".apk",
    ".apks",
    ".xapk",
    ".aab"
  ]),

  scripts: new Set([
    ".cs",
    ".csa",
    ".csi",
    ".lua",
    ".js",
    ".py",
    ".json",
    ".xml",
    ".ini",
    ".cfg",
    ".txt"
  ]),

  models: new Set([
    ".dff",
    ".obj",
    ".fbx",
    ".gltf",
    ".glb",
    ".dae",
    ".3ds"
  ]),

  textures: new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tga",
    ".dds"
  ]),

  audio: new Set([
    ".wav",
    ".ogg",
    ".mp3",
    ".flac",
    ".m4a"
  ])
});

const KNOWN_PROJECT_FILES = Object.freeze([
  "mod.json",
  "mod.toml",
  "mod.yaml",
  "mod.yml",
  "manifest.json",
  "manifest.toml",
  "package.json",
  "README.md",
  "README.txt",
  "LICENSE"
]);

const KNOWN_ANDROID_FILES = Object.freeze([
  "AndroidManifest.xml",
  "resources.arsc",
  "classes.dex",
  "classes2.dex",
  "classes3.dex",
  "lib"
]);

const KNOWN_GAME_DIRECTORIES = Object.freeze([
  "assets",
  "data",
  "files",
  "mods",
  "scripts",
  "cleo",
  "models",
  "textures",
  "audio",
  "sound",
  "plugins",
  "lib",
  "res"
]);

/* -------------------------------------------------------------------------- */
/* Generic filesystem helpers                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Safely obtain filesystem statistics.
 *
 * @param {string} targetPath
 * @returns {fs.Stats|null}
 */
function getStats(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

/**
 * Determine whether a path exists.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function exists(targetPath) {
  return getStats(targetPath) !== null;
}

/**
 * Determine whether a path is a regular file.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function isFile(targetPath) {
  const stats = getStats(targetPath);
  return Boolean(stats?.isFile());
}

/**
 * Determine whether a path is a directory.
 *
 * @param {string} targetPath
 * @returns {boolean}
 */
function isDirectory(targetPath) {
  const stats = getStats(targetPath);
  return Boolean(stats?.isDirectory());
}

/**
 * Normalize a path without resolving it outside the user's
 * intended filesystem context.
 *
 * @param {string} targetPath
 * @returns {string}
 */
function normalizePath(targetPath) {
  return path.normalize(
    path.resolve(targetPath)
  );
}

/**
 * Get a lowercase extension.
 *
 * @param {string} filename
 * @returns {string}
 */
function getExtension(filename) {
  return path.extname(filename).toLowerCase();
}

/**
 * Convert bytes into a human-readable size.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "unknown";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB"
  ];

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value =
    bytes / Math.pow(1024, exponent);

  return `${value.toFixed(
    exponent === 0 ? 0 : 2
  )} ${units[exponent]}`;
}

/* -------------------------------------------------------------------------- */
/* File classification                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Classify a file based on its extension.
 *
 * @param {string} filename
 * @returns {string}
 */
export function classifyFile(filename) {
  const extension = getExtension(filename);

  if (MOD_EXTENSIONS.androidPackages.has(extension)) {
    return "android-package";
  }

  if (MOD_EXTENSIONS.archives.has(extension)) {
    return "archive";
  }

  if (MOD_EXTENSIONS.scripts.has(extension)) {
    return "script";
  }

  if (MOD_EXTENSIONS.models.has(extension)) {
    return "model";
  }

  if (MOD_EXTENSIONS.textures.has(extension)) {
    return "texture";
  }

  if (MOD_EXTENSIONS.audio.has(extension)) {
    return "audio";
  }

  return "unknown";
}

/**
 * Classify an entire directory recursively.
 *
 * @param {string} directory
 * @returns {object}
 */
export function classifyDirectory(directory) {
  const result = {
    totalFiles: 0,
    totalDirectories: 0,
    categories: {},
    extensions: {},
    files: []
  };

  const root = normalizePath(directory);

  function walk(currentPath, relativePath = "") {
    let entries;

    try {
      entries = fs.readdirSync(currentPath, {
        withFileTypes: true
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath =
        path.join(currentPath, entry.name);

      const relativeFilePath =
        path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        result.totalDirectories += 1;
        walk(
          absolutePath,
          relativeFilePath
        );
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      result.totalFiles += 1;

      const category =
        classifyFile(entry.name);

      const extension =
        getExtension(entry.name) ||
        "[no extension]";

      result.categories[category] =
        (result.categories[category] ?? 0) + 1;

      result.extensions[extension] =
        (result.extensions[extension] ?? 0) + 1;

      result.files.push({
        path: relativeFilePath,
        name: entry.name,
        extension,
        category
      });
    }
  }

  walk(root);

  return result;
}

/* -------------------------------------------------------------------------- */
/* Hashing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Calculate a cryptographic hash of a file.
 *
 * SHA-256 is used because it is widely available and
 * suitable for identifying files.
 *
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function hashFile(
  filePath,
  algorithm = "sha256"
) {
  const target = normalizePath(filePath);

  if (!isFile(target)) {
    throw new Error(
      `File does not exist: ${target}`
    );
  }

  const stats = getStats(target);

  if (
    stats.size >
    MAX_INSPECTION_FILE_SIZE
  ) {
    throw new Error(
      `File exceeds inspection limit of ${formatSize(
        MAX_INSPECTION_FILE_SIZE
      )}.`
    );
  }

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(
      algorithm
    );

    const stream =
      fs.createReadStream(target);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });

    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });

    stream.on("error", reject);
  });
}

/* -------------------------------------------------------------------------- */
/* Binary file signatures                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Read the first bytes of a file.
 *
 * @param {string} filePath
 * @param {number} length
 * @returns {Buffer}
 */
function readHeader(filePath, length = 32) {
  const file = fs.openSync(
    filePath,
    "r"
  );

  try {
    const buffer = Buffer.alloc(length);

    const bytesRead = fs.readSync(
      file,
      buffer,
      0,
      length,
      0
    );

    return buffer.subarray(
      0,
      bytesRead
    );
  } finally {
    fs.closeSync(file);
  }
}

/**
 * Identify common binary formats using magic bytes.
 *
 * @param {string} filePath
 * @returns {string|null}
 */
export function detectFileSignature(
  filePath
) {
  if (!isFile(filePath)) {
    return null;
  }

  let header;

  try {
    header = readHeader(filePath);
  } catch {
    return null;
  }

  if (
    header.length >= 4 &&
    header.subarray(0, 4).equals(
      Buffer.from([0x50, 0x4b, 0x03, 0x04])
    )
  ) {
    return "zip";
  }

  if (
    header.length >= 4 &&
    header.subarray(0, 4).equals(
      Buffer.from([0x50, 0x4b, 0x05, 0x06])
    )
  ) {
    return "zip-empty";
  }

  if (
    header.length >= 8 &&
    header.subarray(0, 8).equals(
      Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a
      ])
    )
  ) {
    return "png";
  }

  if (
    header.length >= 3 &&
    header.subarray(0, 3).equals(
      Buffer.from([
        0xff,
        0xd8,
        0xff
      ])
    )
  ) {
    return "jpeg";
  }

  if (
    header.length >= 4 &&
    header.subarray(0, 4).equals(
      Buffer.from("RIFF")
    )
  ) {
    return "riff";
  }

  if (
    header.length >= 4 &&
    header.subarray(0, 4).equals(
      Buffer.from("OggS")
    )
  ) {
    return "ogg";
  }

  if (
    header.length >= 4 &&
    header.subarray(0, 4).equals(
      Buffer.from("PK\u0003\u0004")
    )
  ) {
    return "zip";
  }

  if (
    header.length >= 4 &&
    header.subarray(0, 4).equals(
      Buffer.from([0x7f, 0x45, 0x4c, 0x46])
    )
  ) {
    return "elf";
  }

  if (
    header.length >= 4 &&
    header.subarray(0, 4).equals(
      Buffer.from("dex\n")
    )
  ) {
    return "dex";
  }

  if (
    header.length >= 4 &&
    header.subarray(0, 4).equals(
      Buffer.from("Unity")
    )
  ) {
    return "unity";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Archive inspection                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Parse a ZIP central directory without extracting files.
 *
 * This is intentionally implemented with Node's built-in
 * filesystem APIs so AndroidModKit does not need a third-party
 * archive dependency for basic inspection.
 *
 * @param {string} filePath
 * @returns {object}
 */
export function inspectZipArchive(
  filePath
) {
  const target = normalizePath(filePath);

  if (!isFile(target)) {
    throw new Error(
      `Archive does not exist: ${target}`
    );
  }

  const stats = getStats(target);

  if (
    stats.size >
    MAX_INSPECTION_FILE_SIZE
  ) {
    throw new Error(
      `Archive exceeds inspection limit of ${formatSize(
        MAX_INSPECTION_FILE_SIZE
      )}.`
    );
  }

  const buffer =
    fs.readFileSync(target);

  /*
   * Locate End of Central Directory.
   *
   * ZIP allows a variable-length comment after the
   * EOCD record, so search backwards from the end.
   */
  const EOCD_SIGNATURE = 0x06054b50;

  let eocdOffset = -1;

  const minimumEOCD = 22;

  for (
    let offset =
      buffer.length - minimumEOCD;
    offset >= 0;
    offset--
  ) {
    if (
      buffer.readUInt32LE(offset) ===
      EOCD_SIGNATURE
    ) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error(
      "A valid ZIP end-of-central-directory record could not be found."
    );
  }

  const diskNumber =
    buffer.readUInt16LE(
      eocdOffset + 4
    );

  const centralDirectoryDisk =
    buffer.readUInt16LE(
      eocdOffset + 6
    );

  const entriesOnDisk =
    buffer.readUInt16LE(
      eocdOffset + 8
    );

  const totalEntries =
    buffer.readUInt16LE(
      eocdOffset + 10
    );

  const centralDirectorySize =
    buffer.readUInt32LE(
      eocdOffset + 12
    );

  const centralDirectoryOffset =
    buffer.readUInt32LE(
      eocdOffset + 16
    );

  const commentLength =
    buffer.readUInt16LE(
      eocdOffset + 20
    );

  if (
    totalEntries >
    MAX_ARCHIVE_ENTRIES
  ) {
    throw new Error(
      `Archive contains too many entries: ${totalEntries}.`
    );
  }

  const entries = [];

  let cursor =
    centralDirectoryOffset;

  const CENTRAL_DIRECTORY_SIGNATURE =
    0x02014b50;

  for (
    let index = 0;
    index < totalEntries;
    index++
  ) {
    if (
      cursor + 46 >
      buffer.length
    ) {
      throw new Error(
        "ZIP central directory is truncated."
      );
    }

    const signature =
      buffer.readUInt32LE(cursor);

    if (
      signature !==
      CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new Error(
        "Invalid ZIP central directory entry."
      );
    }

    const compressionMethod =
      buffer.readUInt16LE(
        cursor + 10
      );

    const compressedSize =
      buffer.readUInt32LE(
        cursor + 20
      );

    const uncompressedSize =
      buffer.readUInt32LE(
        cursor + 24
      );

    const fileNameLength =
      buffer.readUInt16LE(
        cursor + 28
      );

    const extraLength =
      buffer.readUInt16LE(
        cursor + 30
      );

    const entryCommentLength =
      buffer.readUInt16LE(
        cursor + 32
      );

    const externalAttributes =
      buffer.readUInt32LE(
        cursor + 38
      );

    const localHeaderOffset =
      buffer.readUInt32LE(
        cursor + 42
      );

    const nameStart =
      cursor + 46;

    const nameEnd =
      nameStart + fileNameLength;

    if (
      nameEnd >
      buffer.length
    ) {
      throw new Error(
        "ZIP filename extends beyond archive bounds."
      );
    }

    const filename =
      buffer
        .subarray(
          nameStart,
          nameEnd
        )
        .toString("utf8");

    const directory =
      filename.endsWith("/");

    entries.push({
      name: filename,
      directory,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      compressedSizeFormatted:
        formatSize(compressedSize),
      uncompressedSizeFormatted:
        formatSize(uncompressedSize),
      localHeaderOffset,
      externalAttributes,
      category: directory
        ? "directory"
        : classifyFile(filename)
    });

    cursor +=
      46 +
      fileNameLength +
      extraLength +
      entryCommentLength;
  }

  return {
    format: "zip",
    size: stats.size,
    sizeFormatted: formatSize(
      stats.size
    ),
    entries: {
      total: totalEntries,
      onDisk: entriesOnDisk
    },
    centralDirectory: {
      offset: centralDirectoryOffset,
      size: centralDirectorySize
    },
    archive: {
      diskNumber,
      centralDirectoryDisk,
      commentLength
    },
    files: entries
  };
}

/* -------------------------------------------------------------------------- */
/* Mod project inspection                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Find known project metadata files in a directory.
 *
 * @param {string} directory
 * @returns {string[]}
 */
function findProjectMetadata(directory) {
  const matches = [];

  let entries;

  try {
    entries = fs.readdirSync(
      directory,
      {
        withFileTypes: true
      }
    );
  } catch {
    return matches;
  }

  const names = new Set(
    entries.map((entry) => entry.name)
  );

  for (const filename of KNOWN_PROJECT_FILES) {
    if (names.has(filename)) {
      matches.push(filename);
    }
  }

  return matches;
}

/**
 * Identify common game/mod directories.
 *
 * @param {string} directory
 * @returns {string[]}
 */
function findGameDirectories(directory) {
  let entries;

  try {
    entries = fs.readdirSync(
      directory,
      {
        withFileTypes: true
      }
    );
  } catch {
    return [];
  }

  const known =
    new Set(
      KNOWN_GAME_DIRECTORIES
    );

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        known.has(
          entry.name.toLowerCase()
        )
    )
    .map(
      (entry) => entry.name
    );
}

/**
 * Inspect a local mod directory.
 *
 * @param {string} directory
 * @returns {object}
 */
export function inspectModDirectory(
  directory
) {
  const root =
    normalizePath(directory);

  if (!isDirectory(root)) {
    throw new Error(
      `Mod directory does not exist: ${root}`
    );
  }

  const stats =
    getStats(root);

  const classification =
    classifyDirectory(root);

  const metadata =
    findProjectMetadata(root);

  const gameDirectories =
    findGameDirectories(root);

  const likelyCLEO =
    classification.files.some(
      (file) =>
        [".csa", ".csi", ".cs"]
          .includes(file.extension)
    );

  const likelyAndroid =
    classification.files.some(
      (file) =>
        file.name ===
        "AndroidManifest.xml"
    );

  return {
    type: "directory",
    path: root,

    metadata: {
      files: metadata,
      hasProjectMetadata:
        metadata.length > 0
    },

    indicators: {
      likelyCLEO,
      likelyAndroid,
      gameDirectories
    },

    statistics: classification,

    filesystem: {
      created:
        stats?.birthtime?.toISOString() ??
        null,
      modified:
        stats?.mtime?.toISOString() ??
        null
    }
  };
}

/**
 * Inspect a single mod file.
 *
 * @param {string} filePath
 * @returns {Promise<object>}
 */
export async function inspectModFile(
  filePath
) {
  const target =
    normalizePath(filePath);

  if (!isFile(target)) {
    throw new Error(
      `File does not exist: ${target}`
    );
  }

  const stats =
    getStats(target);

  if (
    stats.size >
    MAX_INSPECTION_FILE_SIZE
  ) {
    throw new Error(
      `File exceeds inspection limit of ${formatSize(
        MAX_INSPECTION_FILE_SIZE
      )}.`
    );
  }

  const extension =
    getExtension(target);

  const category =
    classifyFile(target);

  const signature =
    detectFileSignature(target);

  const hash =
    await hashFile(target);

  const result = {
    type: "file",

    path: target,

    file: {
      name: path.basename(target),
      extension,
      category,
      size: stats.size,
      sizeFormatted:
        formatSize(stats.size),
      modified:
        stats.mtime.toISOString(),
      created:
        stats.birthtime.toISOString()
    },

    format: {
      extension,
      detectedSignature:
        signature
    },

    integrity: {
      sha256: hash
    }
  };

  /*
   * ZIP-based formats such as APK are inspected through
   * their central directory without extracting them.
   */
  if (
    signature === "zip" ||
    signature === "zip-empty"
  ) {
    try {
      const archive =
        inspectZipArchive(target);

      result.archive = {
        format: archive.format,
        entries: archive.entries,
        centralDirectory:
          archive.centralDirectory,

        statistics:
          summarizeArchiveEntries(
            archive.files
          ),

        files:
          archive.files
      };
    } catch (error) {
      result.archive = {
        error:
          error instanceof Error
            ? error.message
            : String(error)
      };
    }
  }

  return result;
}

/**
 * Summarize archive contents.
 *
 * @param {object[]} entries
 * @returns {object}
 */
export function summarizeArchiveEntries(
  entries
) {
  const summary = {
    total: entries.length,
    directories: 0,
    files: 0,
    categories: {},
    extensions: {},
        compressedBytes: 0,
    uncompressedBytes: 0
  };

  for (const entry of entries) {
    if (entry.directory) {
      summary.directories += 1;
      continue;
    }

    summary.files += 1;

    const category =
      entry.category ?? "unknown";

    const extension =
      getExtension(entry.name) ||
      "[no extension]";

    summary.categories[category] =
      (summary.categories[category] ?? 0) + 1;

    summary.extensions[extension] =
      (summary.extensions[extension] ?? 0) + 1;

    summary.compressedBytes +=
      entry.compressedSize ?? 0;

    summary.uncompressedBytes +=
      entry.uncompressedSize ?? 0;
  }

  summary.compressedSize =
    formatSize(
      summary.compressedBytes
    );

  summary.uncompressedSize =
    formatSize(
      summary.uncompressedBytes
    );

  return summary;
}

/* -------------------------------------------------------------------------- */
/* Generic inspection API                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Inspect a mod path.
 *
 * This is the primary entry point intended for the CLI.
 *
 * @param {string} targetPath
 * @returns {Promise<object>}
 */
export async function inspectMod(
  targetPath
) {
  if (
    typeof targetPath !== "string" ||
    targetPath.trim().length === 0
  ) {
    throw new TypeError(
      "A mod file or directory path is required."
    );
  }

  const target =
    normalizePath(targetPath);

  if (!exists(target)) {
    throw new Error(
      `Path does not exist: ${target}`
    );
  }

  if (isDirectory(target)) {
    return inspectModDirectory(target);
  }

  return inspectModFile(target);
}

/* -------------------------------------------------------------------------- */
/* Mod validation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Validate a mod/project path without modifying it.
 *
 * @param {string} targetPath
 * @returns {Promise<object>}
 */
export async function validateMod(
  targetPath
) {
  const issues = [];
  const warnings = [];

  let inspection;

  try {
    inspection =
      await inspectMod(targetPath);
  } catch (error) {
    return {
      valid: false,
      issues: [
        error instanceof Error
          ? error.message
          : String(error)
      ],
      warnings: [],
      inspection: null
    };
  }

  if (inspection.type === "directory") {
    if (
      inspection.statistics.totalFiles === 0
    ) {
      issues.push(
        "The mod directory does not contain any files."
      );
    }

    if (
      !inspection.metadata.hasProjectMetadata
    ) {
      warnings.push(
        "No recognized project metadata file was found."
      );
    }

    const categories =
      inspection.statistics.categories;

    const hasRecognizedContent =
      (categories.script ?? 0) > 0 ||
      (categories.model ?? 0) > 0 ||
      (categories.texture ?? 0) > 0 ||
      (categories.audio ?? 0) > 0 ||
      (categories["android-package"] ?? 0) > 0;

    if (!hasRecognizedContent) {
      warnings.push(
        "No common script, model, texture, audio, or Android package files were detected."
      );
    }
  }

  if (inspection.type === "file") {
    if (
      inspection.file.size === 0
    ) {
      issues.push(
        "The inspected file is empty."
      );
    }

    if (
      inspection.archive?.error
    ) {
      issues.push(
        `Archive inspection failed: ${inspection.archive.error}`
      );
    }

    if (
      inspection.file.category === "android-package" &&
      inspection.archive &&
      !inspection.archive.error
    ) {
      const archiveFiles =
        inspection.archive.files ?? [];

      const names =
        new Set(
          archiveFiles
            .filter(
              (entry) => !entry.directory
            )
            .map(
              (entry) => entry.name
            )
        );

      if (
        !names.has("AndroidManifest.xml")
      ) {
        warnings.push(
          "The file appears to be an Android package, but AndroidManifest.xml was not found in the archive."
        );
      }

      const hasDex =
        [...names].some(
          (name) =>
            /^classes(?:\d+)?\.dex$/i.test(
              path.basename(name)
            )
        );

      if (!hasDex) {
        warnings.push(
          "No classes*.dex file was detected."
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    inspection
  };
}

/* -------------------------------------------------------------------------- */
/* Archive analysis helpers                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Detect whether an archive appears to contain
 * Android package structures.
 *
 * @param {object[]} entries
 * @returns {boolean}
 */
export function isAndroidPackageArchive(
  entries
) {
  if (!Array.isArray(entries)) {
    return false;
  }

  const files =
    entries
      .filter(
        (entry) => !entry.directory
      )
      .map(
        (entry) => entry.name
      );

  const hasManifest =
    files.some(
      (name) =>
        name === "AndroidManifest.xml"
    );

  const hasDex =
    files.some(
      (name) =>
        /^classes(?:\d+)?\.dex$/i.test(
          path.basename(name)
        )
    );

  const hasResources =
    files.some(
      (name) =>
        name === "resources.arsc"
    );

  return (
    hasManifest &&
    (hasDex || hasResources)
  );
}

/**
 * Detect likely CLEO/script content inside
 * an archive.
 *
 * @param {object[]} entries
 * @returns {object}
 */
export function detectScriptContent(
  entries
) {
  const result = {
    detected: false,
    files: [],
    extensions: {}
  };

  if (!Array.isArray(entries)) {
    return result;
  }

  for (const entry of entries) {
    if (entry.directory) {
      continue;
    }

    const extension =
      getExtension(entry.name);

    if (
      !MOD_EXTENSIONS.scripts.has(
        extension
      )
    ) {
      continue;
    }

    result.detected = true;

    result.files.push({
      name: entry.name,
      extension,
      size: entry.uncompressedSize,
      sizeFormatted:
        formatSize(
          entry.uncompressedSize
        )
    });

    result.extensions[extension] =
      (result.extensions[extension] ?? 0) + 1;
  }

  return result;
}

/**
 * Detect likely mod assets inside an archive.
 *
 * @param {object[]} entries
 * @returns {object}
 */
export function detectModAssets(
  entries
) {
  const result = {
    models: [],
    textures: [],
    audio: [],
    other: []
  };

  if (!Array.isArray(entries)) {
    return result;
  }

  for (const entry of entries) {
    if (entry.directory) {
      continue;
    }

    const category =
      classifyFile(entry.name);

    const asset = {
      name: entry.name,
      extension:
        getExtension(entry.name),
      size:
        entry.uncompressedSize,
      sizeFormatted:
        formatSize(
          entry.uncompressedSize
        )
    };

    if (category === "model") {
      result.models.push(asset);
      continue;
    }

    if (category === "texture") {
      result.textures.push(asset);
      continue;
    }

    if (category === "audio") {
      result.audio.push(asset);
      continue;
    }

    result.other.push(asset);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Enhanced archive report                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Build a higher-level report from archive entries.
 *
 * @param {object[]} entries
 * @returns {object}
 */
export function buildArchiveReport(
  entries
) {
  const statistics =
    summarizeArchiveEntries(
      entries
    );

  const scripts =
    detectScriptContent(
      entries
    );

  const assets =
    detectModAssets(
      entries
    );

  const androidPackage =
    isAndroidPackageArchive(
      entries
    );

  const suspiciousPaths = [];

  for (const entry of entries) {
    if (entry.directory) {
      continue;
    }

    const normalized =
      entry.name
        .replaceAll("\\", "/");

    /*
     * ZIP entries containing ../ can represent
     * path traversal attempts when extracted by
     * unsafe software.
     */
    if (
      normalized
        .split("/")
        .includes("..")
    ) {
      suspiciousPaths.push({
        name: entry.name,
        reason:
          "Path traversal sequence detected"
      });
    }

    /*
     * Absolute Unix paths.
     */
    if (
      normalized.startsWith("/")
    ) {
      suspiciousPaths.push({
        name: entry.name,
        reason:
          "Absolute Unix path detected"
      });
    }

    /*
     * Windows drive-letter paths.
     */
    if (
      /^[a-zA-Z]:\//.test(
        normalized
      )
    ) {
      suspiciousPaths.push({
        name: entry.name,
        reason:
          "Absolute Windows path detected"
      });
    }
  }

  return {
    statistics,

    classification: {
      androidPackage,
      containsScripts:
        scripts.detected,

      containsModels:
        assets.models.length > 0,

      containsTextures:
        assets.textures.length > 0,

      containsAudio:
        assets.audio.length > 0
    },

    scripts,

    assets,

    security: {
      suspiciousPaths,
      pathTraversalDetected:
        suspiciousPaths.length > 0
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Project tree                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build a shallow project tree.
 *
 * This intentionally limits recursion so a massive mod
 * does not produce an absurdly large CLI response.
 *
 * @param {string} directory
 * @param {number} maxDepth
 * @returns {object}
 */
export function buildProjectTree(
  directory,
  maxDepth = 4
) {
  const root =
    normalizePath(directory);

  if (!isDirectory(root)) {
    throw new Error(
      `Directory does not exist: ${root}`
    );
  }

  function build(current, depth) {
    if (depth > maxDepth) {
      return {
        name:
          path.basename(current),
        type: "directory",
        truncated: true
      };
    }

    let entries;

    try {
      entries =
        fs.readdirSync(
          current,
          {
            withFileTypes: true
          }
        );
    } catch {
      return {
        name:
          path.basename(current),
        type: "directory",
        unreadable: true
      };
    }

    const children = [];

    for (const entry of entries) {
      const fullPath =
        path.join(
          current,
          entry.name
        );

      if (entry.isDirectory()) {
        children.push(
          build(
            fullPath,
            depth + 1
          )
        );

        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stats =
        getStats(fullPath);

      children.push({
        name: entry.name,
        type: "file",
        category:
          classifyFile(entry.name),
        extension:
          getExtension(entry.name),
        size:
          stats?.size ?? null,
        sizeFormatted:
          stats
            ? formatSize(stats.size)
            : "unknown"
      });
    }

    return {
      name:
        path.basename(current),
      type: "directory",
      children
    };
  }

  return build(root, 0);
}

/* -------------------------------------------------------------------------- */
/* Project metadata                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Safely parse a JSON metadata file.
 *
 * @param {string} filePath
 * @returns {object|null}
 */
export function readJsonMetadata(
  filePath
) {
  if (!isFile(filePath)) {
    return null;
  }

  const stats =
    getStats(filePath);

  if (
    !stats ||
    stats.size > 2 * 1024 * 1024
  ) {
    return null;
  }

  try {
    const content =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Locate and parse common JSON metadata files.
 *
 * @param {string} directory
 * @returns {object|null}
 */
export function loadProjectMetadata(
  directory
) {
  const root =
    normalizePath(directory);

  if (!isDirectory(root)) {
    return null;
  }

  const candidates = [
    "mod.json",
    "manifest.json",
    "package.json"
  ];

  for (const filename of candidates) {
    const target =
      path.join(
        root,
        filename
      );

    if (!isFile(target)) {
      continue;
    }

    const metadata =
      readJsonMetadata(target);

    if (metadata !== null) {
      return {
        file: filename,
        data: metadata
      };
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Safe text inspection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Read a text file safely for diagnostics.
 *
 * @param {string} filePath
 * @param {number} maxBytes
 * @returns {object}
 */
export function inspectTextFile(
  filePath,
  maxBytes = 1024 * 1024
) {
  const target =
    normalizePath(filePath);

  if (!isFile(target)) {
    throw new Error(
      `File does not exist: ${target}`
    );
  }

  const stats =
    getStats(target);

  if (
    stats.size > maxBytes
  ) {
    return {
      readable: false,
      reason:
        `File exceeds text inspection limit of ${formatSize(
          maxBytes
        )}.`
    };
  }

  try {
    const content =
      fs.readFileSync(
        target,
        "utf8"
      );

    return {
      readable: true,
      bytes: stats.size,
      lines:
        content.length === 0
          ? 0
          : content.split(/\r?\n/).length,
      characters:
        content.length,
      preview:
        content.slice(
          0,
          MAX_STRING_LENGTH
        )
    };
  } catch (error) {
    return {
      readable: false,
      reason:
        error instanceof Error
          ? error.message
          : String(error)
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Security checks                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Analyze archive paths for extraction hazards.
 *
 * @param {object[]} entries
 * @returns {object}
 */
export function analyzeArchiveSecurity(
  entries
) {
  const findings = [];

  if (!Array.isArray(entries)) {
    return {
      safe: true,
      findings
    };
  }

  for (const entry of entries) {
    if (!entry?.name) {
      continue;
    }

    const original =
      String(entry.name);

    const normalized =
      original
        .replaceAll("\\", "/");

    const segments =
      normalized.split("/");

    if (
      segments.includes("..")
    ) {
      findings.push({
        severity: "high",
        type: "path-traversal",
        path: original,
        message:
          "Archive entry contains parent-directory traversal."
      });
    }

    if (
      normalized.startsWith("/")
    ) {
      findings.push({
        severity: "high",
        type: "absolute-path",
        path: original,
        message:
          "Archive entry uses an absolute Unix-style path."
      });
    }

    if (
      /^[a-zA-Z]:\//.test(
        normalized
      )
    ) {
      findings.push({
        severity: "high",
        type: "absolute-path",
        path: original,
        message:
          "Archive entry uses an absolute Windows-style path."
      });
    }

    if (
      original.includes("\0")
    ) {
      findings.push({
        severity: "critical",
        type: "null-byte",
        path: original,
        message:
          "Archive entry contains a null byte."
      });
    }
  }

  return {
    safe:
      findings.length === 0,
    findings
  };
}

/* -------------------------------------------------------------------------- */
/* Public module information                                                   */
/* -------------------------------------------------------------------------- */

export const MODDING = Object.freeze({
  version: "0.1.0",

  limits: {
    maxInspectionFileSize:
      MAX_INSPECTION_FILE_SIZE,

    maxArchiveEntries:
      MAX_ARCHIVE_ENTRIES
  },

  extensions: {
    archives: [
      ...MOD_EXTENSIONS.archives
    ],

    androidPackages: [
      ...MOD_EXTENSIONS.androidPackages
    ],

    scripts: [
      ...MOD_EXTENSIONS.scripts
    ],

    models: [
      ...MOD_EXTENSIONS.models
    ],

    textures: [
      ...MOD_EXTENSIONS.textures
    ],

    audio: [
      ...MOD_EXTENSIONS.audio
    ]
  },

  projectFiles: [
    ...KNOWN_PROJECT_FILES
  ],

  androidFiles: [
    ...KNOWN_ANDROID_FILES
  ],

  gameDirectories: [
    ...KNOWN_GAME_DIRECTORIES
  ]
});
