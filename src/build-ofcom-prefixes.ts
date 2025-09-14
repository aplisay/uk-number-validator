
import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "csv-parse/sync";

type CsvRow = Record<string, string>;

const DATA_DIR = path.resolve(process.cwd(), "data");

const FILES = [
  "s1.csv",
  "s3.csv",
  "s5.csv",
  "s7.csv",
  "s8.csv",
  "s9.csv",
  "s10 (type a and c).csv",
  "s10 (type b).csv",
];

function rangeToRule(range: string, status: string) {
  if (!range) return null as null | { prefix: string; totalLength: number; status: string };
  const cleaned = range.toLowerCase().replace(/[^0-9x]/g, "");
  if (!cleaned) return null;
  const m = cleaned.match(/^([0-9]+)(x*)$/);
  if (!m) return null;
  const prefix = m[1];
  const xCount = m[2]?.length ?? 0;
  if (!prefix.length) return null;
  const totalLength = prefix.length + xCount;
  return { prefix, totalLength, status };
}

function loadCsv(fp: string): CsvRow[] {
  const buf = fs.readFileSync(fp);
  const rows: CsvRow[] = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });
  return rows;
}

(function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}. Run 'npm run prepare:data' first.`);
    process.exit(2);
  }

  const rules: { prefix: string; totalLength: number; status: string }[] = [];

  for (const f of FILES) {
    const fp = path.join(DATA_DIR, f);
    if (!fs.existsSync(fp)) {
      console.error(`Missing CSV: ${fp}`);
      process.exit(2);
    }
    const rows = loadCsv(fp);
    for (const row of rows) {
      const range =
        row["Number Range"] ??
        row["Number range"] ??
        row["Number range (non-geographic) or Area code"] ??
        row["Number range (Non-geographic) or Area Code"] ??
        row["Code"] ??
        row["Dialling code"] ??
        "";

      const status =
        row["Status"] ??
        row["Allocation Status"] ??
        row["Availability"] ??
        row["Notes"] ??
        "";

      const rule = rangeToRule(range, status);
      if (rule) rules.push(rule);
    }
  }

  const uniq = new Map<string, (typeof rules)[number]>();
  for (const r of rules) {
    uniq.set(`${r.prefix}|${r.totalLength}|${r.status}`, r);
  }
  const out = Array.from(uniq.values());

  fs.writeFileSync(path.resolve(process.cwd(), "prefixes.json"), JSON.stringify(out, null, 2));
  console.log(`Wrote prefixes.json with ${out.length} rules`);
})();
