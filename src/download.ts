// download.ts
// Downloads Ofcom CSV files and processes them into prefixes.json
// Node 18+: `yarn add node-fetch@3 csv-parse@5`

import fetch from "node-fetch";
import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";
import logger from "./logger";

type CsvRow = Record<string, string>;

/**
 * Ofcom keeps stable file names; there’s usually a cache-busting `?v=` query.
 * We strip querystrings so this keeps working as they roll weekly updates.
 * Source index of files: https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbering-data
 */
const FILES = [
  "s1.csv", // Geographic (01, 02)
  "s3.csv", // 03 non-geographic
  "s5.csv", // 055/056
  "s7.csv", // 07 (070/071-079/076 etc.)
  "s8.csv", // 08
  "s9.csv", // 09
];

const BASE =
  "https://www.ofcom.org.uk/siteassets/resources/documents/phones-telecoms-and-internet/information-for-industry/numbering/regular-updates/telephone-numbers/";

const DATA_DIR = path.resolve(process.cwd(), "data");

function tidyUrl(name: string) {
  return BASE + name; // Names are already URL encoded
}

function getCachedFilePath(name: string): string {
  // Convert URL-encoded name back to normal filename for local storage
  const decodedName = decodeURIComponent(name);
  return path.join(DATA_DIR, decodedName);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Convert an Ofcom "Number Range" cell into {prefix, totalLength, provider}. */
function rangeToRule(
  range: string,
  status: string,
  provider?: string
): { prefix: string; totalLength: number; status: string; provider?: string } | null {
  if (!range) return null;
  
  // Handle new NMS Number Block format (e.g., "0207 946 0000", "3000 00")
  // Extract just the digits
  const digits = range.replace(/\D+/g, "");
  if (!digits) return null;

  // For NMS Number Blocks, we need to include ALL specific number blocks
  // to properly detect invalid numbers, not just area codes
  
  if (digits.startsWith("1") || digits.startsWith("2") || digits.startsWith("3") || 
      digits.startsWith("7") || digits.startsWith("8") || digits.startsWith("9")) {
    // UK numbers without leading 0 - add the 0 for national format
    const nationalDigits = "0" + digits;
    
    // For NMS Number Blocks, we need to determine the correct total length
    // based on the number type and the length of the allocated block
    let totalLength: number;
    
    if (nationalDigits.startsWith("01") || nationalDigits.startsWith("02")) {
      // Geographic numbers: typically 11 digits total
      totalLength = 11;
    } else if (nationalDigits.startsWith("07")) {
      // Mobile numbers: typically 11 digits total
      totalLength = 11;
    } else if (nationalDigits.startsWith("03") || nationalDigits.startsWith("08") || nationalDigits.startsWith("09")) {
      // Non-geographic numbers: typically 11 digits total
      totalLength = 11;
    } else {
      // Default to the length of the allocated block
      totalLength = nationalDigits.length;
    }
    
    return { prefix: nationalDigits, totalLength, status, provider };
  } else if (digits.startsWith("1") && digits.length <= 6) {
    // Short codes: use the full number
    return { prefix: digits, totalLength: digits.length, status, provider };
  }

  // Fallback: try to parse as range format (e.g., "020 xxxx xxxx")
  const cleaned = range.toLowerCase().replace(/[^0-9x]/g, "");
  if (!cleaned) return null;

  // Split into leading digits (prefix) and then a run of x's for variable part
  const m = cleaned.match(/^([0-9]+)(x*)$/);
  if (!m) return null;

  const prefix = m[1];
  const xCount = m[2]?.length ?? 0;

  // Sanity: ignore obviously bogus entries
  if (prefix.length === 0) return null;

  // The Ofcom entry already encodes total length via count of x's + prefix
  const totalLength = prefix.length + xCount;

  return { prefix, totalLength, status, provider };
}

async function pullOne(name: string, noFetch: boolean = false): Promise<CsvRow[]> {
  const cachedFile = getCachedFilePath(name);
  
  if (noFetch && fs.existsSync(cachedFile)) {
    logger.info({ fileName: name }, `Using cached ${name}...`);
    const buf = fs.readFileSync(cachedFile);
    const rows: CsvRow[] = parse(buf, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    logger.info({ fileName: name, rowCount: rows.length }, `Loaded ${name} with ${rows.length} rows from cache`);
    return rows;
  }
  
  logger.info({ fileName: name }, `Downloading ${name}...`);
  const res = await fetch(tidyUrl(name), { redirect: 'follow' });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${name}`);
  const buf = await res.arrayBuffer();
  
  // Cache the downloaded file
  ensureDataDir();
  fs.writeFileSync(cachedFile, Buffer.from(buf));
  logger.info({ fileName: name, cacheFile: cachedFile }, `Cached ${name} to ${cachedFile}`);
  
  // CSV is UTF-8; we let csv-parse auto-detect headers
  const rows: CsvRow[] = parse(Buffer.from(buf), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
  logger.info({ fileName: name, rowCount: rows.length }, `Downloaded ${name} with ${rows.length} rows`);
  return rows;
}

(async () => {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const noFetch = args.includes('--no-fetch') || args.includes('-n');
  
  if (noFetch) {
    logger.info("Running in no-fetch mode - using cached files only");
  }

  const rules: { prefix: string; totalLength: number; status: string; provider?: string }[] = [];
  for (const f of FILES) {
    try {
      const rows = await pullOne(f, noFetch);
      for (const row of rows) {
        // Column names vary slightly across sheets; handle robustly:
        const range =
          row["NMS Number Block: Number Block"] ??
          row["Number Range"] ??
          row["Number range"] ??
          row["Number range (non-geographic) or Area code"] ??
          row["Number range (Non-geographic) or Area Code"] ??
          row["Code"] ??
          row["Dialling code"] ?? // fallback for S1 area code splits
          "";

        const status =
          row["Block Status"] ??
          row["Status"] ??
          row["Allocation Status"] ??
          row["Availability"] ??
          row["Notes"] ??
          "";

        const provider =
          row["CP Name"] ??
          row["Provider"] ??
          "";

        const rule = rangeToRule(range, status, provider);
        if (rule) {
          // Only include diallable statuses to minimize prefixes.json
          const isDiallable = /^(Allocated|Allocated\(Closed Range\))$/i.test(rule.status.trim());
          if (isDiallable) rules.push(rule);
        }
      }
    } catch (error) {
      logger.warn({ fileName: f, error }, `Skipping ${f}: ${error}`);
      continue;
    }
  }

  // De-dup identical (prefix,totalLength,status,provider) rows
  const uniq = new Map<string, (typeof rules)[number]>();
  for (const r of rules) {
    uniq.set(`${r.prefix}|${r.totalLength}|${r.status}|${r.provider || ''}`, r);
  }
  const out = Array.from(uniq.values());

  fs.writeFileSync("prefixes.json", JSON.stringify(out, null, 2));
  logger.info({ ruleCount: out.length }, `Wrote prefixes.json with ${out.length} rules`);
})().catch((e) => {
  logger.error({ error: e }, 'Download process failed');
  process.exit(1);
});


