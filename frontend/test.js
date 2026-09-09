#!/usr/bin/env node
/**
 * convert_mmd_folder.js
 *
 * Converts every .mmd (mermaid) file in a folder into a rendered image
 * (PNG by default, or JPG) using @mermaid-js/mermaid-cli (mmdc).
 *
 * Usage:
 *   node convert_mmd_folder.js <inputFolder> [outputFolder] [--format=png|jpg] [--scale=3]
 *
 * Examples:
 *   node convert_mmd_folder.js ./diagrams
 *   node convert_mmd_folder.js ./diagrams ./images --format=jpg
 *   node convert_mmd_folder.js ./diagrams ./images --format=png --scale=2
 *
 * Requires: @mermaid-js/mermaid-cli
 *   npm install @mermaid-js/mermaid-cli
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const positional = [];
  const flags = { format: "png", scale: "3" };

  for (const arg of argv) {
    if (arg.startsWith("--format=")) {
      flags.format = arg.split("=")[1].toLowerCase();
    } else if (arg.startsWith("--scale=")) {
      flags.scale = arg.split("=")[1];
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function findMmdcBin() {
  // On Windows, npm creates shim files with extensions (.cmd / .ps1) rather
  // than a bare "mmdc" file, so check each possible name.
  const binDir = path.resolve(__dirname, "node_modules", ".bin");
  const candidates =
    process.platform === "win32"
      ? ["mmdc.cmd", "mmdc.ps1", "mmdc"]
      : ["mmdc"];

  for (const name of candidates) {
    const candidatePath = path.join(binDir, name);
    if (fs.existsSync(candidatePath)) {
      return { cmd: candidatePath, needsShell: name.endsWith(".cmd") };
    }
  }
  // Fall back to global/PATH lookup
  return { cmd: "mmdc", needsShell: process.platform === "win32" };
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [inputFolderArg, outputFolderArg] = positional;

  if (!inputFolderArg) {
    console.error(
      "Usage: node convert_mmd_folder.js <inputFolder> [outputFolder] [--format=png|jpg] [--scale=3]"
    );
    process.exit(1);
  }

  if (!["png", "jpg", "jpeg"].includes(flags.format)) {
    console.error(`Unsupported format "${flags.format}". Use png or jpg.`);
    process.exit(1);
  }
  const ext = flags.format === "jpeg" ? "jpg" : flags.format;

  const inputFolder = path.resolve(inputFolderArg);
  const outputFolder = path.resolve(outputFolderArg || inputFolderArg);

  if (!fs.existsSync(inputFolder) || !fs.statSync(inputFolder).isDirectory()) {
    console.error(`Input folder not found: ${inputFolder}`);
    process.exit(1);
  }
  fs.mkdirSync(outputFolder, { recursive: true });

  const mmdFiles = fs
    .readdirSync(inputFolder)
    .filter((f) => f.toLowerCase().endsWith(".mmd"))
    .sort();

  if (mmdFiles.length === 0) {
    console.log(`No .mmd files found in ${inputFolder}`);
    return;
  }

  const { cmd: mmdcCmd, needsShell } = findMmdcBin();
  console.log(`Found ${mmdFiles.length} .mmd file(s). Converting to .${ext}...\n`);

  const puppeteerConfigPath = path.join(__dirname, "puppeteer-config.json");
  const hasPuppeteerConfig = fs.existsSync(puppeteerConfigPath);

  let okCount = 0;

  for (const file of mmdFiles) {
    const inputPath = path.join(inputFolder, file);
    const baseName = path.basename(file, path.extname(file));
    const outputPath = path.join(outputFolder, `${baseName}.${ext}`);

    const args = [
      "-i", inputPath,
      "-o", outputPath,
      "-b", "white",
    ];
    if (ext === "png") {
      args.push("-s", flags.scale);
    }
    if (hasPuppeteerConfig) {
      args.push("-p", puppeteerConfigPath);
    }

    try {
      execFileSync(mmdcCmd, args, { stdio: "pipe", shell: needsShell });
      console.log(`[OK]   ${file} -> ${path.basename(outputPath)}`);
      okCount += 1;
    } catch (err) {
      console.error(`[FAIL] ${file}`);
      console.error(err.stderr ? err.stderr.toString() : err.message);
    }
  }

  console.log(`\nDone. ${okCount}/${mmdFiles.length} converted successfully.`);
  console.log(`Output folder: ${outputFolder}`);
}

main();