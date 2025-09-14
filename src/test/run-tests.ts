
import * as fs from "node:fs";
import * as path from "node:path";
import { buildIndex, classifyUkNumber, normaliseToUkNational, NumberClass, PrefixRule, ClassificationResult } from "../classifyUkNumber";

function classify(input: string, rules: PrefixRule[]): ClassificationResult {
  const national = normaliseToUkNational(input);
  if (!national) return { class: NumberClass.NUMBER_INVALID };
  const idx = buildIndex(rules);
  return classifyUkNumber(national, idx);
}

function assertEq(name: string, result: ClassificationResult, expectedClass: NumberClass) {
  if (result.class !== expectedClass) {
    console.error(`✗ ${name}: expected ${expectedClass}, got ${result.class}`);
    process.exit(1);
  } else {
    const providerInfo = result.provider ? ` (${result.provider})` : '';
    console.log(`✓ ${name}: ${result.class}${providerInfo}`);
  }
}

(function main() {
  const rulesPath = path.resolve(process.cwd(), "prefixes.json");
  if (!fs.existsSync(rulesPath)) {
    console.error("prefixes.json not found. Run 'npm run build:all' first.");
    process.exit(2);
  }
  const rules: PrefixRule[] = JSON.parse(fs.readFileSync(rulesPath, "utf8"));

  assertEq(
    "020 8099 6910",
    classify("020 8099 6910", rules),
    NumberClass.NUMBER_VALID
  );
  assertEq("+44 20 7946 0000", classify("+44 20 7946 0000", rules), NumberClass.NUMBER_VALID);
  assertEq("0151", classify("0151", rules), NumberClass.NUMBER_TOO_SHORT);
  assertEq("07418534", classify("07418534", rules), NumberClass.NUMBER_TOO_SHORT);
  assertEq("000", classify("000", rules), NumberClass.NUMBER_INVALID);
  assertEq("0191 498 0123", classify("0191 498 0123", rules),  NumberClass.NUMBER_VALID );
  // Common short codes (dependent on S10): 116123 should be valid if present in dataset
  const short = classify("116123", rules);
  if (short.class !== NumberClass.NUMBER_VALID) {
    console.warn("Note: 116123 did not validate as NUMBER_VALID; check S10 files availability/status.");
  }
  console.log('All basic tests executed.');
})();
