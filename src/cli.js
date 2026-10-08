#!/usr/bin/env node

/**
 * AndroidModKit CLI
 *
 * Command-line interface for AndroidModKit.
 *
 * Usage:
 *
 *   amk doctor
 *   amk info
 *   amk health
 *   amk env
 *   amk mod inspect <path>
 *   amk mod validate <path>
 *   amk mod tree <directory>
 *   amk mod hash <file>
 *   amk mod signature <file>
 *   amk mod archive <file>
 *   amk mod security <file>
 *
 * The CLI intentionally uses no third-party dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import amk from "./index.js";

/* -------------------------------------------------------------------------- */
/* CLI metadata                                                               */
/* -------------------------------------------------------------------------- */

const CLI_NAME = "amk";

const VERSION =
  amk.version;

const DESCRIPTION =
  amk.description;

/* -------------------------------------------------------------------------- */
/* Terminal helpers                                                           */
/* -------------------------------------------------------------------------- */

const isTTY =
  Boolean(process.stdout.isTTY);

const isColorSupported =
  isTTY &&
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== "dumb";

const COLORS = Object.freeze({
  reset:
    "\x1b[0m",

  bold:
    "\x1b[1m",

  dim:
    "\x1b[2m",

  red:
    "\x1b[31m",

  green:
    "\x1b[32m",

  yellow:
    "\x1b[33m",

  blue:
    "\x1b[34m",

  cyan:
    "\x1b[36m",

  white:
    "\x1b[37m"
});

/**
 * Apply terminal styling when supported.
 *
 * @param {string} text
 * @param {string} color
 * @returns {string}
 */
function colorize(
  text,
  color
) {
  if (!isColorSupported) {
    return text;
  }

  return `${color}${text}${COLORS.reset}`;
}

/**
 * Print a normal message.
 *
 * @param {string} message
 */
function log(message = "") {
  process.stdout.write(
    `${message}\n`
  );
}

/**
 * Print an error message.
 *
 * @param {string} message
 */
function errorLog(message) {
  process.stderr.write(
    `${colorize(
      "Error:",
      COLORS.red
    )} ${message}\n`
  );
}

/**
 * Print a warning.
 *
 * @param {string} message
 */
function warn(message) {
  process.stderr.write(
    `${colorize(
      "Warning:",
      COLORS.yellow
    )} ${message}\n`
  );
}

/**
 * Print a success message.
 *
 * @param {string} message
 */
function success(message) {
  log(
    colorize(
      message,
      COLORS.green
    )
  );
}

/* -------------------------------------------------------------------------- */
/* Output helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Determine whether JSON output was requested.
 *
 * @param {object} options
 * @returns {boolean}
 */
function wantsJson(options) {
  return Boolean(
    options.json ||
    process.env.AMK_JSON === "1"
  );
}

/**
 * Print JSON safely.
 *
 * @param {unknown} value
 */
function printJson(value) {
  log(
    JSON.stringify(
      value,
      null,
      2
    )
  );
}

/**
 * Print an object using the requested format.
 *
 * @param {unknown} value
 * @param {object} options
 */
function output(
  value,
  options = {}
) {
  if (wantsJson(options)) {
    printJson(value);
    return;
  }

  printObject(value);
}

/**
 * Print nested JavaScript data in a readable CLI format.
 *
 * @param {unknown} value
 * @param {number} depth
 * @param {string} prefix
 */
function printObject(
  value,
  depth = 0,
  prefix = ""
) {
  const indentation =
    "  ".repeat(depth);

  if (
    value === null ||
    value === undefined
  ) {
    log(
      `${indentation}${prefix}${colorize(
        "null",
        COLORS.dim
      )}`
    );

    return;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    log(
      `${indentation}${prefix}${String(
        value
      )}`
    );

    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      log(
        `${indentation}${prefix}[]`
      );

      return;
    }

    for (
      let index = 0;
      index < value.length;
      index++
    ) {
      const item =
        value[index];

      if (
        item !== null &&
        typeof item === "object"
      ) {
        log(
          `${indentation}${prefix}${index}:`
        );

        printObject(
          item,
          depth + 1
        );
      } else {
        log(
          `${indentation}${prefix}${index}: ${String(
            item
          )}`
        );
      }
    }

    return;
  }

  if (
    typeof value === "object"
  ) {
    const entries =
      Object.entries(value);

    if (entries.length === 0) {
      log(
        `${indentation}${prefix}{}`
      );

      return;
    }

    for (
      const [
        key,
        item
      ] of entries
    ) {
      if (
        item !== null &&
        typeof item === "object"
      ) {
        log(
          `${indentation}${prefix}${colorize(
            key,
            COLORS.cyan
          )}:`
        );

        printObject(
          item,
          depth + 1
        );
      } else {
        log(
          `${indentation}${prefix}${colorize(
            key,
            COLORS.cyan
          )}: ${String(item)}`
        );
      }
    }

    return;
  }

  log(
    `${indentation}${prefix}${String(
      value
    )}`
  );
}

/* -------------------------------------------------------------------------- */
/* Argument parsing                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Parse command-line arguments.
 *
 * Supports:
 *
 *   --json
 *   --no-color
 *   --verbose
 *   --quiet
 *   --help
 *   --version
 *
 * @param {string[]} argv
 * @returns {object}
 */
function parseArguments(argv) {
  const positional = [];
  const options = {};

  for (
    let index = 0;
    index < argv.length;
    index++
  ) {
    const argument =
      argv[index];

    if (
      argument === "--"
    ) {
      positional.push(
        ...argv.slice(index + 1)
      );

      break;
    }

    if (
      argument === "--help" ||
      argument === "-h"
    ) {
      options.help = true;
      continue;
    }

    if (
      argument === "--version" ||
      argument === "-v"
    ) {
      options.version = true;
      continue;
    }

    if (
      argument === "--json" ||
      argument === "-j"
    ) {
      options.json = true;
      continue;
    }

    if (
      argument === "--verbose"
    ) {
      options.verbose = true;
      continue;
    }

    if (
      argument === "--quiet" ||
      argument === "-q"
    ) {
      options.quiet = true;
      continue;
    }

    if (
      argument === "--no-color"
    ) {
      options.noColor = true;
      continue;
    }

    if (
      argument.startsWith("--")
    ) {
      const equalsIndex =
        argument.indexOf("=");

      if (
        equalsIndex !== -1
      ) {
        const key =
          argument.slice(
            2,
            equalsIndex
          );

        const value =
          argument.slice(
            equalsIndex + 1
          );

        options[key] = value;
      } else {
        options[
          argument.slice(2)
        ] = true;
      }

      continue;
    }

    if (
      argument.startsWith("-") &&
      argument.length > 1
    ) {
      /*
       * Support simple short options such as
       * -j and -v. Unknown short flags remain
       * positional so command-specific validation
       * can provide a useful error.
       */
      for (
        const flag of argument.slice(1)
      ) {
        if (flag === "j") {
          options.json = true;
        } else if (flag === "v") {
          options.version = true;
        } else if (flag === "h") {
          options.help = true;
        } else if (flag === "q") {
          options.quiet = true;
        } else {
          positional.push(
            `-${flag}`
          );
        }
      }

      continue;
    }

    positional.push(
      argument
    );
  }

  return {
    positional,
    options
  };
}

/* -------------------------------------------------------------------------- */
/* Help                                                                       */
/* -------------------------------------------------------------------------- */

const HELP_TEXT = `
${colorize(
  "AndroidModKit",
  COLORS.bold
)} v${VERSION}

${DESCRIPTION}

Usage:
  ${CLI_NAME} <command> [options]

Global commands:
  doctor                         Run Android + Termux diagnostics
  info                           Show system and project information
  health                         Run a lightweight health check
  env                            Show detected environment
  version                        Show AndroidModKit version
  help                           Show this help message

Mod commands:
  mod inspect <path>             Inspect a mod, APK, ZIP, or directory
  mod validate <path>            Validate a mod/project
  mod tree <directory>           Show a project directory tree
  mod hash <file>                Calculate SHA-256 hash
  mod signature <file>           Detect binary file signature
  mod archive <file>             Analyze ZIP/APK archive
  mod security <file>            Analyze archive extraction risks

Options:
  -h, --help                     Show help
  -v, --version                  Show version
  -j, --json                     Output machine-readable JSON
  -q, --quiet                    Reduce terminal output
      --verbose                  Show additional diagnostic information
      --no-color                 Disable terminal colors

Examples:
  ${CLI_NAME} doctor
  ${CLI_NAME} doctor --json

  ${CLI_NAME} info
  ${CLI_NAME} health
  ${CLI_NAME} env

  ${CLI_NAME} mod inspect ./my-mod.apk
  ${CLI_NAME} mod inspect ./my-mod.zip --json
  ${CLI_NAME} mod validate ./my-mod
  ${CLI_NAME} mod tree ./my-mod

  ${CLI_NAME} mod hash ./script.csa
  ${CLI_NAME} mod signature ./game.apk
  ${CLI_NAME} mod archive ./game.apk
  ${CLI_NAME} mod security ./game.apk

AndroidModKit is read-only by default.
Inspection commands do not install, modify, or execute mod content.
`;

/**
 * Print CLI help.
 */
function showHelp() {
  log(HELP_TEXT.trim());
}

/**
 * Show mod-specific help.
 */
function showModHelp() {
  log(`
${colorize(
  "AndroidModKit Modding",
  COLORS.bold
)}

Usage:
  ${CLI_NAME} mod <command> <path>

Commands:
  inspect <path>       Inspect a mod, APK, ZIP, or directory
  validate <path>      Validate a mod/project
  tree <directory>     Display a project tree
  hash <file>          Calculate SHA-256
  signature <file>     Detect file signature
  archive <file>       Analyze ZIP/APK contents
  security <file>      Check archive paths for hazards

Options:
  -j, --json           Output JSON
  -h, --help           Show this help
`);
}

/* -------------------------------------------------------------------------- */
/* Command validation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Require a positional argument.
 *
 * @param {string[]} args
 * @param {string} name
 * @returns {string}
 */
function requireArgument(
  args,
  name
) {
  const value =
    args[0];

  if (
    !value ||
    value.startsWith("-")
  ) {
    throw new Error(
      `Missing required ${name}.`
    );
  }

  return value;
}

/**
 * Check that a file exists.
 *
 * @param {string} target
 */
function requireFile(
  target
) {
  const resolved =
    path.resolve(target);

  let stats;

  try {
    stats =
      fs.statSync(resolved);
  } catch {
    throw new Error(
      `File does not exist: ${resolved}`
    );
  }

  if (!stats.isFile()) {
    throw new Error(
      `Expected a file: ${resolved}`
    );
  }

  return resolved;
}

/**
 * Check that a directory exists.
 *
 * @param {string} target
 */
function requireDirectory(
  target
) {
  const resolved =
    path.resolve(target);

  let stats;

  try {
    stats =
      fs.statSync(resolved);
  } catch {
    throw new Error(
      `Directory does not exist: ${resolved}`
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(
      `Expected a directory: ${resolved}`
    );
  }

  return resolved;
}

/* -------------------------------------------------------------------------- */
/* Doctor command                                                             */
/* -------------------------------------------------------------------------- */

async function commandDoctor(
  options
) {
  if (!options.quiet) {
    log(
      colorize(
        "AndroidModKit Doctor",
        COLORS.bold
      )
    );

    log(
      colorize(
        "Running environment diagnostics...",
        COLORS.dim
      )
    );

    log();
  }

  const result =
    await amk.doctor();

  if (wantsJson(options)) {
    printJson(result);
    return result.ok
      ? 0
      : 1;
  }

  printObject(result);

  log();

  if (result.ok) {
    success(
      "Diagnostics completed successfully."
    );
  } else {
    errorLog(
      "One or more diagnostics failed."
    );
  }

  return result.ok
    ? 0
    : 1;
}

/* -------------------------------------------------------------------------- */
/* Info command                                                               */
/* -------------------------------------------------------------------------- */

async function commandInfo(
  options
) {
  const info =
    await amk.getInfo();

  output(
    info,
    options
  );

  return 0;
}

/* -------------------------------------------------------------------------- */
/* Health command                                                             */
/* -------------------------------------------------------------------------- */

async function commandHealth(
  options
) {
  const health =
    await amk.healthCheck();

  output(
    health,
    options
  );

  return health.healthy
    ? 0
    : 1;
}

/* -------------------------------------------------------------------------- */
/* Environment command                                                        */
/* -------------------------------------------------------------------------- */

async function commandEnvironment(
  options
) {
  const environment =
    await amk.detectEnvironment();

  output(
    environment,
    options
  );

  return 0;
}

/* -------------------------------------------------------------------------- */
/* Version command                                                            */
/* -------------------------------------------------------------------------- */

function commandVersion(
  options
) {
  if (wantsJson(options)) {
    printJson({
      name: amk.name,
      package: amk.package,
      version: amk.version
    });
  } else {
    log(
      `${amk.name} v${amk.version}`
    );
  }

  return 0;
}

/* -------------------------------------------------------------------------- */
/* Mod inspect                                                               */
/* -------------------------------------------------------------------------- */

async function commandModInspect(
  args,
  options
) {
  const target =
    requireArgument(
      args,
      "path"
    );

  const resolved =
    path.resolve(target);

  if (!options.quiet) {
    log(
      `${colorize(
        "Inspecting:",
        COLORS.bold
      )} ${resolved}`
    );

    log();
  }

  const result =
    await amk.modding.inspect(
      resolved
    );

  /*
   * Add higher-level archive intelligence
   * without changing the original inspection
   * result returned by modding.js.
   */
  if (
    result.type === "file" &&
    Array.isArray(
      result.archive?.files
    )
  ) {
    result.archive.report =
      amk.modding.buildArchiveReport(
        result.archive.files
      );
  }

  output(
    result,
    options
  );

  return 0;
}

/* -------------------------------------------------------------------------- */
/* Mod validate                                                              */
/* -------------------------------------------------------------------------- */

async function commandModValidate(
  args,
  options
) {
  const target =
    requireArgument(
      args,
      "path"
    );

  const result =
    await amk.modding.validate(
      path.resolve(target)
    );

  output(
    result,
    options
  );

  if (
    !wantsJson(options)
  ) {
    log();

    if (result.valid) {
      success(
        "Mod validation passed."
      );
    } else {
      errorLog(
        "Mod validation failed."
      );
    }

    if (
      result.warnings.length > 0
    ) {
      warn(
        `${result.warnings.length} warning(s) detected.`
      );
    }
  }

  return result.valid
    ? 0
    : 1;
}

/* -------------------------------------------------------------------------- */
/* Mod tree                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Render a project tree visually.
 *
 * @param {object} node
 * @param {string} prefix
 * @param {boolean} last
 */
function renderTree(
  node,
  prefix = "",
  last = true
) {
  const connector =
    prefix.length === 0
      ? ""
      : last
        ? "└── "
        : "├── ";

  const marker =
    node.type === "directory"
      ? colorize(
          "📁",
          COLORS.blue
        )
      : "📄";

  log(
    `${prefix}${connector}${marker} ${node.name}`
  );

  if (
    !Array.isArray(
      node.children
    )
  ) {
    return;
  }

  const childPrefix =
    prefix.length === 0
      ? ""
      : prefix +
        (last
          ? "    "
          : "│   ");

  for (
    let index = 0;
    index < node.children.length;
    index++
  ) {
    const child =
      node.children[index];

    renderTree(
      child,
      childPrefix,
      index ===
        node.children.length - 1
    );
  }
}

async function commandModTree(
  args,
  options
) {
  const target =
    requireArgument(
      args,
      "directory"
    );

  const directory =
    requireDirectory(
      target
    );

  const tree =
    amk.modding.buildProjectTree(
      directory
    );

  if (wantsJson(options)) {
    printJson(tree);
    return 0;
  }

  renderTree(tree);

  return 0;
}

/* -------------------------------------------------------------------------- */
/* Mod hash                                                                   */
/* -------------------------------------------------------------------------- */

async function commandModHash(
  args,
  options
) {
  const target =
    requireArgument(
      args,
      "file"
    );

  const file =
    requireFile(target);

  const hash =
    await amk.modding.hash(
      file
    );

  if (wantsJson(options)) {
    printJson({
      file,
      algorithm: "sha256",
      hash
    });

    return 0;
  }

  log(
    `${colorize(
      "SHA-256:",
      COLORS.bold
    )} ${hash}`
  );

  log(
    `${colorize(
      "File:",
      COLORS.dim
    )} ${file}`
  );

  return 0;
}

/* -------------------------------------------------------------------------- */
/* Mod signature                                                              */
/* -------------------------------------------------------------------------- */

async function commandModSignature(
  args,
  options
) {
  const target =
    requireArgument(
      args,
      "file"
    );

  const file =
    requireFile(target);

  const signature =
    amk.modding.detectSignature(
      file
    );

  const result = {
    file,
    signature
  };

  output(
    result,
    options
  );

  return 0;
}

/* -------------------------------------------------------------------------- */
/* Mod archive                                                               */
/* -------------------------------------------------------------------------- */

async function commandModArchive(
  args,
  options
) {
  const target =
    requireArgument(
      args,
      "file"
    );

  const file =
    requireFile(target);

  const archive =
    amk.modding.inspectZip(
      file
    );

  const report =
    amk.modding.buildArchiveReport(
      archive.files
    );

  const result = {
    ...archive,
    report
  };

  output(
    result,
    options
  );

  return 0;
}

/* -------------------------------------------------------------------------- */
/* Mod security                                                              */
/* -------------------------------------------------------------------------- */

async function commandModSecurity(
  args,
  options
) {
  const target =
    requireArgument(
      args,
      "file"
    );

  const file =
    requireFile(target);

  const archive =
    amk.modding.inspectZip(
      file
    );

  const security =
    amk.modding.analyzeArchiveSecurity(
      archive.files
    );

  const result = {
    file,
    safe: security.safe,
    findings: security.findings,
    entriesChecked:
      archive.files.length
  };

  output(
    result,
    options
  );

  if (
    !wantsJson(options)
  ) {
    log();

    if (security.safe) {
      success(
        "No archive path traversal hazards detected."
      );
    } else {
      warn(
        `${security.findings.length} security finding(s) detected.`
      );
    }
  }

  return security.safe
    ? 0
    : 1;
}

/* -------------------------------------------------------------------------- */
/* Mod command dispatcher                                                     */
/* -------------------------------------------------------------------------- */

async function commandMod(
  args,
  options
) {
  const subcommand =
    args.shift();

  if (
    !subcommand ||
    subcommand === "help" ||
    subcommand === "--help"
  ) {
    showModHelp();
    return 0;
  }

  switch (
    subcommand.toLowerCase()
  ) {
    case "inspect":
    case "i":
      return commandModInspect(
        args,
        options
      );

    case "validate":
    case "check":
      return commandModValidate(
        args,
        options
      );

    case "tree":
      return commandModTree(
        args,
        options
      );

    case "hash":
      return commandModHash(
        args,
        options
      );

    case "signature":
    case "sig":
      return commandModSignature(
        args,
        options
      );

    case "archive":
      return commandModArchive(
        args,
        options
      );

    case "security":
    case "secure":
      return commandModSecurity(
        args,
        options
      );

    default:
      throw new Error(
        `Unknown mod command: ${subcommand}`
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Main dispatcher                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Execute the CLI.
 *
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function runCLI(
  argv = process.argv.slice(2)
) {
  const {
    positional,
    options
  } =
    parseArguments(argv);

  /*
   * Respect --no-color.
   *
   * The terminal color helper already checks the
   * environment, so --no-color is handled by setting
   * the environment flag before any output occurs.
   */
  if (options.noColor) {
    process.env.NO_COLOR = "1";
  }

  if (
    options.version
  ) {
    return commandVersion(
      options
    );
  }

  if (
    options.help ||
    positional.length === 0
  ) {
    showHelp();
    return 0;
  }

  const command =
    positional.shift();

  switch (
    command.toLowerCase()
  ) {
    case "doctor":
    case "diagnose":
      return commandDoctor(
        options
      );

    case "info":
    case "information":
      return commandInfo(
        options
      );

    case "health":
    case "check":
      return commandHealth(
        options
      );

    case "env":
    case "environment":
      return commandEnvironment(
        options
      );

    case "version":
      return commandVersion(
        options
      );

    case "help":
      showHelp();
      return 0;

    case "mod":
    case "mods":
    case "modding":
      return commandMod(
        positional,
        options
      );

    default:
      throw new Error(
        `Unknown command: ${command}`
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Error handling                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Convert an unknown error into a useful
 * human-readable CLI message.
 *
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(
  error
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  if (
    typeof error === "string"
  ) {
    return error;
  }

  try {
    return JSON.stringify(
      error
    );
  } catch {
    return "Unknown error.";
  }
}

/* -------------------------------------------------------------------------- */
/* Executable entry point                                                      */
/* -------------------------------------------------------------------------- */

const currentFile =
  fileURLToPath(
    import.meta.url
  );

const executedFile =
  process.argv[1]
    ? path.resolve(
        process.argv[1]
      )
    : null;

if (
  executedFile &&
  currentFile === executedFile
) {
  try {
    const exitCode =
      await runCLI();

    process.exitCode =
      exitCode;
  } catch (error) {
    const message =
      getErrorMessage(error);

    if (
      process.argv.includes(
        "--json"
      )
    ) {
      printJson({
        ok: false,
        error: message
      });
    } else {
      errorLog(message);

      if (
        process.argv.includes(
          "--verbose"
        ) &&
        error instanceof Error &&
        error.stack
      ) {
        log();
        log(
          colorize(
            error.stack,
            COLORS.dim
          )
        );
      }
    }

    process.exitCode = 1;
  }
}
