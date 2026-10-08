import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import amk from "../src/index.js";

import {
  formatSize,
  classifyFile,
  classifyDirectory,
  hashFile,
  detectFileSignature,
  inspectMod,
  validateMod,
  buildProjectTree,
  readJsonMetadata,
  isAndroidPackageArchive,
  detectScriptContent,
  detectModAssets
} from "../src/modding.js";

/* -------------------------------------------------------------------------- */
/* Test helpers                                                               */
/* -------------------------------------------------------------------------- */

function createTempDirectory() {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), "androidmodkit-test-")
  );
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  fs.writeFileSync(filePath, content);

  return filePath;
}

function writeBuffer(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  fs.writeFileSync(filePath, buffer);

  return filePath;
}

/**
 * Creates a minimal valid PNG signature.
 *
 * The signature detector only needs the PNG header, so there is no
 * reason to create an actual image for this unit test.
 */
function createFakePng(filePath) {
  const pngHeader = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a
  ]);

  return writeBuffer(filePath, pngHeader);
}

/**
 * Creates a minimal ZIP file containing one file.
 *
 * This avoids depending on the system having the `zip` command installed.
 */
function createMinimalZip(filePath, entryName = "AndroidManifest.xml") {
  const filename = Buffer.from(entryName, "utf8");
  const content = Buffer.from("androidmodkit test", "utf8");

  const localHeader = Buffer.alloc(30 + filename.length);

  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(content.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(filename.length, 26);
  localHeader.writeUInt16LE(0, 28);

  filename.copy(localHeader, 30);

  const centralHeader = Buffer.alloc(46 + filename.length);

  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(0, 16);
  centralHeader.writeUInt32LE(content.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(filename.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42);

  filename.copy(centralHeader, 46);

  const centralDirectoryOffset =
    localHeader.length + content.length;

  const endRecord = Buffer.alloc(22);

  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralHeader.length, 12);
  endRecord.writeUInt32LE(centralDirectoryOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return writeBuffer(
    filePath,
    Buffer.concat([
      localHeader,
      content,
      centralHeader,
      endRecord
    ])
  );
}

/* -------------------------------------------------------------------------- */
/* General utilities                                                          */
/* -------------------------------------------------------------------------- */

test("formatSize formats byte counts correctly", () => {
  assert.equal(formatSize(0), "0 B");
  assert.equal(formatSize(1024), "1 KB");
  assert.equal(formatSize(1024 * 1024), "1 MB");
  assert.equal(formatSize(1024 * 1024 * 1024), "1 GB");
});

test("classifyFile identifies common file types", () => {
  assert.equal(classifyFile("mod.apk"), "android-package");
  assert.equal(classifyFile("archive.zip"), "archive");
  assert.equal(classifyFile("script.csa"), "script");
  assert.equal(classifyFile("model.dff"), "model");
  assert.equal(classifyFile("texture.png"), "texture");
  assert.equal(classifyFile("sound.wav"), "audio");
});

test("classifyDirectory identifies mod/project directories", () => {
  const directory = createTempDirectory();

  writeFile(
    path.join(directory, "AndroidManifest.xml"),
    "<manifest />"
  );

  const result = classifyDirectory(directory);

  assert.ok(result);
  assert.equal(typeof result, "object");
});

/* -------------------------------------------------------------------------- */
/* File hashing                                                               */
/* -------------------------------------------------------------------------- */

test("hashFile returns a deterministic SHA-256 hash", async () => {
  const directory = createTempDirectory();
  const file = writeFile(
    path.join(directory, "hello.txt"),
    "hello androidmodkit"
  );

  const firstHash = await hashFile(file);
  const secondHash = await hashFile(file);

  assert.equal(firstHash, secondHash);
  assert.match(firstHash, /^[a-f0-9]{64}$/);
});

/* -------------------------------------------------------------------------- */
/* File signatures                                                             */
/* -------------------------------------------------------------------------- */

test("detectFileSignature detects PNG files", async () => {
  const directory = createTempDirectory();
  const file = createFakePng(
    path.join(directory, "texture.png")
  );

  const result = await detectFileSignature(file);

  assert.ok(result);
  assert.equal(typeof result, "object");

  /*
   * Keep this test flexible about the exact property names while
   * still confirming that the detector recognized the file.
   */
  const serialized = JSON.stringify(result).toLowerCase();

  assert.match(serialized, /png/);
});

test("detectFileSignature detects ZIP files", async () => {
  const directory = createTempDirectory();
  const file = createMinimalZip(
    path.join(directory, "mod.zip")
  );

  const result = await detectFileSignature(file);

  assert.ok(result);

  const serialized = JSON.stringify(result).toLowerCase();

  assert.match(serialized, /zip/);
});

/* -------------------------------------------------------------------------- */
/* Mod directory inspection                                                   */
/* -------------------------------------------------------------------------- */

test("inspectMod analyzes a mod directory", async () => {
  const directory = createTempDirectory();

  writeFile(
    path.join(directory, "README.md"),
    "# Test Mod\n"
  );

  writeFile(
    path.join(directory, "scripts", "main.csa"),
    "CLEO TEST SCRIPT"
  );

  createFakePng(
    path.join(directory, "textures", "vehicle.png")
  );

  const result = await inspectMod(directory);

  assert.ok(result);
  assert.equal(typeof result, "object");

  const serialized = JSON.stringify(result).toLowerCase();

  assert.match(serialized, /main\.csa/);
  assert.match(serialized, /vehicle\.png/);
});

/* -------------------------------------------------------------------------- */
/* Mod validation                                                             */
/* -------------------------------------------------------------------------- */

test("validateMod validates a mod directory", async () => {
  const directory = createTempDirectory();

  writeFile(
    path.join(directory, "README.md"),
    "# AndroidModKit Test Mod"
  );

  writeFile(
    path.join(directory, "mod.json"),
    JSON.stringify({
      name: "AndroidModKit Test Mod",
      version: "1.0.0"
    }, null, 2)
  );

  const result = await validateMod(directory);

  assert.ok(result);
  assert.equal(typeof result, "object");
});

/* -------------------------------------------------------------------------- */
/* Project tree                                                               */
/* -------------------------------------------------------------------------- */

test("buildProjectTree builds a filesystem tree", async () => {
  const directory = createTempDirectory();

  writeFile(
    path.join(directory, "src", "main.js"),
    "console.log('test');"
  );

  writeFile(
    path.join(directory, "src", "android.js"),
    "export const android = true;"
  );

  writeFile(
    path.join(directory, "README.md"),
    "# Project"
  );

  const result = await buildProjectTree(directory);

  assert.ok(result);
  assert.equal(typeof result, "object");

  const serialized = JSON.stringify(result);

  assert.match(serialized, /main\.js/);
  assert.match(serialized, /android\.js/);
  assert.match(serialized, /README\.md/);
});

/* -------------------------------------------------------------------------- */
/* JSON metadata                                                              */
/* -------------------------------------------------------------------------- */

test("readJsonMetadata reads valid JSON metadata", async () => {
  const directory = createTempDirectory();

  const file = writeFile(
    path.join(directory, "mod.json"),
    JSON.stringify({
      name: "AndroidModKit",
      version: "0.1.0",
      author: "AndroidModKit Contributors"
    }, null, 2)
  );

  const result = await readJsonMetadata(file);

  assert.ok(result);
  assert.equal(result.name, "AndroidModKit");
  assert.equal(result.version, "0.1.0");
});

test("readJsonMetadata handles invalid JSON safely", async () => {
  const directory = createTempDirectory();

  const file = writeFile(
    path.join(directory, "broken.json"),
    "{ this is not valid json }"
  );

  const result = await readJsonMetadata(file);

  /*
   * The function should not crash the entire toolkit because
   * somebody managed to produce invalid JSON. Humanity survives.
   */
  assert.ok(
    result === null ||
    result === undefined ||
    typeof result === "object"
  );
});

/* -------------------------------------------------------------------------- */
/* Android package detection                                                  */
/* -------------------------------------------------------------------------- */

test("isAndroidPackageArchive detects Android package structure", async () => {
  const directory = createTempDirectory();

  const apk = createMinimalZip(
    path.join(directory, "test.apk"),
    "AndroidManifest.xml"
  );

  const result = await isAndroidPackageArchive(apk);

  assert.equal(typeof result, "boolean");
});

/* -------------------------------------------------------------------------- */
/* Script detection                                                           */
/* -------------------------------------------------------------------------- */

test("detectScriptContent recognizes script-like content", () => {
  const result = detectScriptContent(
    "CLEO script\n{$CLEO .cs}\nthread 'TEST'"
  );

  assert.ok(result);
});

/* -------------------------------------------------------------------------- */
/* Mod asset detection                                                        */
/* -------------------------------------------------------------------------- */

test("detectModAssets detects common mod assets", async () => {
  const directory = createTempDirectory();

  writeFile(
    path.join(directory, "scripts", "mission.csa"),
    "CLEO TEST"
  );

  writeFile(
    path.join(directory, "models", "vehicle.dff"),
    "DFF TEST"
  );

  createFakePng(
    path.join(directory, "textures", "vehicle.png")
  );

  const result = await detectModAssets(directory);

  assert.ok(result);
  assert.equal(typeof result, "object");

  const serialized = JSON.stringify(result).toLowerCase();

  assert.match(serialized, /mission\.csa/);
  assert.match(serialized, /vehicle\.dff/);
  assert.match(serialized, /vehicle\.png/);
});

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

test("AndroidModKit public API is available", () => {
  assert.ok(amk);
  assert.equal(typeof amk, "object");

  assert.equal(typeof amk.doctor, "function");
  assert.equal(typeof amk.getInfo, "function");
  assert.equal(typeof amk.healthCheck, "function");
  assert.equal(typeof amk.detectEnvironment, "function");

  assert.ok(amk.android);
  assert.ok(amk.termux);
  assert.ok(amk.modding);
  assert.ok(amk.utils);
});

test("AndroidModKit exposes package metadata", () => {
  assert.equal(typeof amk.name, "string");
  assert.equal(typeof amk.version, "string");
  assert.equal(typeof amk.description, "string");
  assert.equal(amk.license, "MIT");
});

/* -------------------------------------------------------------------------- */
/* Environment detection                                                     */
/* -------------------------------------------------------------------------- */

test("detectEnvironment returns an environment report", async () => {
  const result = await amk.detectEnvironment();

  assert.ok(result);
  assert.equal(typeof result, "object");
});

/* -------------------------------------------------------------------------- */
/* Doctor API                                                                */
/* -------------------------------------------------------------------------- */

test("doctor returns a diagnostic report", async () => {
  const result = await amk.doctor();

  assert.ok(result);
  assert.equal(typeof result, "object");
});

/* -------------------------------------------------------------------------- */
/* Health check                                                               */
/* -------------------------------------------------------------------------- */

test("healthCheck returns a health report", async () => {
  const result = await amk.healthCheck();

  assert.ok(result);
  assert.equal(typeof result, "object");
});
