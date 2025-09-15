import * as fs from "node:fs";
import * as path from "node:path";
import { buildIndex, classifyUkNumber, normaliseToUkNational, NumberClass, PrefixRule, ClassificationResult } from "../classifyUkNumber";
import logger from "../logger";

interface TestCase {
  number: string;
  expectedClass: NumberClass;
  description: string;
}

interface TestResult {
  number: string;
  expected: NumberClass;
  actual: NumberClass;
  correct: boolean;
  timeMs: number;
}

function classify(input: string, idx: any): ClassificationResult {
  const national = normaliseToUkNational(input);
  if (!national) return { class: NumberClass.NUMBER_INVALID };
  return classifyUkNumber(national, idx);
}

function generateTestNumbers(rules: PrefixRule[]): TestCase[] {
  const testCases: TestCase[] = [];
  
  // Group rules by status for easier sampling
  const rulesByStatus = new Map<string, PrefixRule[]>();
  for (const rule of rules) {
    if (!rulesByStatus.has(rule.status)) {
      rulesByStatus.set(rule.status, []);
    }
    rulesByStatus.get(rule.status)!.push(rule);
  }
  
  // Get samples of different statuses
  const allocatedRules = rulesByStatus.get("Allocated") || [];
  const freeRules = rulesByStatus.get("Free") || [];
  const protectedRules = rulesByStatus.get("Protected") || [];
  const closedRules = rulesByStatus.get("Allocated(Closed Range)") || [];
  
  logger.info({
    allocated: allocatedRules.length,
    free: freeRules.length,
    protected: protectedRules.length,
    closed: closedRules.length
  }, "Available rules by status");
  
  // Generate 90 valid numbers (90%) - only from Allocated and Allocated(Closed Range)
  const validRules = [...allocatedRules, ...closedRules];
  for (let i = 0; i < 90; i++) {
    const rule = validRules[Math.floor(Math.random() * validRules.length)];
    const number = generateNumberFromRule(rule);
    testCases.push({
      number,
      expectedClass: NumberClass.NUMBER_VALID,
      description: `Valid ${rule.status} number`
    });
  }
  
  // Generate 10 invalid numbers (10%)
  // 5 clearly invalid numbers (no reliance on Free rules)
  for (let i = 0; i < 5; i++) {
    const number = generateInvalidNumber();
    testCases.push({
      number,
      expectedClass: NumberClass.NUMBER_INVALID,
      description: `Clearly invalid number`
    });
  }
  
  // 5 too short numbers
  for (let i = 0; i < 5; i++) {
    const rule = validRules[Math.floor(Math.random() * validRules.length)];
    const number = generateShortNumberFromRule(rule);
    testCases.push({
      number,
      expectedClass: NumberClass.NUMBER_TOO_SHORT,
      description: `Too short number`
    });
  }
  
  // Shuffle all test cases
  return testCases.sort(() => Math.random() - 0.5);
}

function generateNumberFromRule(rule: PrefixRule): string {
  const prefix = rule.prefix;
  const remainingLength = rule.totalLength - prefix.length;
  let number = prefix;
  
  for (let i = 0; i < remainingLength; i++) {
    number += Math.floor(Math.random() * 10).toString();
  }
  
  return number;
}

function generateShortNumberFromRule(rule: PrefixRule): string {
  const prefix = rule.prefix;
  const remainingLength = Math.max(1, rule.totalLength - prefix.length - 1);
  let number = prefix;
  
  for (let i = 0; i < remainingLength; i++) {
    number += Math.floor(Math.random() * 10).toString();
  }
  
  return number;
}

function generateInvalidNumber(): string {
  const samples = [
    "123456789",            // Missing leading 0
    "+1234567890",          // Non-UK international
    "999999999",            // Invalid prefix
    "abc123",               // Non-digits
    ""                      // Empty
  ];
  return samples[Math.floor(Math.random() * samples.length)];
}

function runPerformanceTest(testCases: TestCase[], idx: any): void {
  const results: TestResult[] = [];
  const startTime = Date.now();
  
  logger.info({ testCount: testCases.length }, "Starting performance test...");
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const testStart = Date.now();
    
    const result = classify(testCase.number, idx);
    const testEnd = Date.now();
    
    results.push({
      number: testCase.number,
      expected: testCase.expectedClass,
      actual: result.class,
      correct: result.class === testCase.expectedClass,
      timeMs: testEnd - testStart
    });
  }
  
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  
  // Calculate statistics
  const correct = results.filter(r => r.correct).length;
  const incorrect = results.length - correct;
  const times = results.map(r => r.timeMs);
  
  logger.info("=".repeat(60));
  logger.info("QUICK PERFORMANCE TEST RESULTS");
  logger.info("=".repeat(60));
  
  logger.info({
    totalTests: results.length,
    correct,
    incorrect,
    accuracy: `${((correct / results.length) * 100).toFixed(2)}%`
  }, "Overall Results");
  
  logger.info({
    totalTimeMs: totalTime,
    averageTimeMs: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3),
    minTimeMs: Math.min(...times),
    maxTimeMs: Math.max(...times),
    testsPerSecond: (results.length / (totalTime / 1000)).toFixed(0)
  }, "Performance Metrics");
  
  // Show incorrect results
  const incorrectResults = results.filter(r => !r.correct);
  if (incorrectResults.length > 0) {
    logger.warn("Incorrect Results:");
    for (const result of incorrectResults) {
      logger.warn({
        number: result.number,
        expected: result.expected,
        actual: result.actual
      }, `  ${result.number}: expected ${result.expected}, got ${result.actual}`);
    }
  }
  
  logger.info("=".repeat(60));
}

(async function main() {
  const rulesPath = path.resolve(process.cwd(), "prefixes.json");
  if (!fs.existsSync(rulesPath)) {
    logger.error("prefixes.json not found. Run 'npm run build:all' first.");
    process.exit(2);
  }
  
  logger.info("Loading rules...");
  const rules: PrefixRule[] = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
  logger.info({ ruleCount: rules.length }, "Loaded rules");
  
  logger.info("Generating test cases...");
  const testCases = generateTestNumbers(rules);
  logger.info({ testCaseCount: testCases.length }, "Generated test cases");
  
  logger.info("Building index...");
  const idx = buildIndex(rules);
  
  logger.info("Running performance test...");
  runPerformanceTest(testCases, idx);
  
  logger.info("Quick performance test completed!");
})().catch((e) => {
  logger.error({ error: e }, 'Quick performance test failed');
  process.exit(1);
});
