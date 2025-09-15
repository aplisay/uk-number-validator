
import * as fs from "node:fs";
import * as path from "node:path";
import { buildIndex, classifyUkNumber, normaliseToUkNational, NumberClass, PrefixRule, ClassificationResult } from "../classifyUkNumber";
import logger from "../logger";

function classify(input: string, rules: PrefixRule[]): ClassificationResult {
  const national = normaliseToUkNational(input);
  if (!national) return { class: NumberClass.NUMBER_INVALID };
  const idx = buildIndex(rules);
  return classifyUkNumber(national, idx);
}

function assertEq(name: string, result: ClassificationResult, expectedClass: NumberClass) {
  if (result.class !== expectedClass) {
    logger.error({ testName: name, expected: expectedClass, actual: result.class }, `✗ ${name}: expected ${expectedClass}, got ${result.class}`);
    process.exit(1);
  } else {
    const providerInfo = result.provider ? ` (${result.provider})` : '';
    logger.info({ testName: name, result: result.class, provider: result.provider }, `✓ ${name}: ${result.class}${providerInfo}`);
  }
}

(function main() {
  const rulesPath = path.resolve(process.cwd(), "prefixes.json");
  if (!fs.existsSync(rulesPath)) {
    logger.error("prefixes.json not found. Run 'npm run build:all' first.");
    process.exit(2);
  }
  const rules: PrefixRule[] = JSON.parse(fs.readFileSync(rulesPath, "utf8"));

  assertEq(
    "020 8099 6910",
    classify("020 8099 6910", rules),
    NumberClass.NUMBER_VALID
  );
  assertEq("+44 20 8099 6910", classify("+44 20 8099 6910", rules), NumberClass.NUMBER_VALID);
  assertEq("0151", classify("0151", rules), NumberClass.NUMBER_TOO_SHORT);
  assertEq("07418534", classify("07418534", rules), NumberClass.NUMBER_TOO_SHORT);
  assertEq("000", classify("000", rules), NumberClass.NUMBER_INVALID);
  assertEq("02080996910", classify("02080996910", rules),  NumberClass.NUMBER_VALID );
  // Protected range example should be invalid
  assertEq("0191 498 0123", classify("0191 498 0123", rules),  NumberClass.NUMBER_INVALID );
  // Test standard UK number formats via international prefixes
  assertEq("0044 20 8099 6910", classify("0044 20 8099 6910", rules), NumberClass.NUMBER_VALID);
  logger.info('All basic tests executed.');
  logger.info('For comprehensive performance testing with 10,000 numbers, run: yarn test:performance');
})();
