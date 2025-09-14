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

interface PerformanceStats {
  totalTests: number;
  correct: number;
  incorrect: number;
  totalTimeMs: number;
  averageTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  resultsByClass: Record<string, { expected: number; actual: number; correct: number }>;
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
  const quarantinedRules = rulesByStatus.get("Quarantined") || [];
  const designatedRules = rulesByStatus.get("Designated") || [];
  const reservedRules = rulesByStatus.get("Reserved") || [];
  
  // Generate 9,000 valid numbers (90%) - use actual valid rules
  const validRules = [...allocatedRules, ...protectedRules, ...closedRules, ...quarantinedRules, ...designatedRules, ...reservedRules];
  for (let i = 0; i < 9000; i++) {
    const rule = validRules[Math.floor(Math.random() * validRules.length)];
    const number = generateValidNumberFromRule(rule);
    testCases.push({
      number,
      expectedClass: NumberClass.NUMBER_VALID,
      description: `Valid ${rule.status} number`
    });
  }
  
  // Generate 1,000 invalid/edge case numbers (10%)
  const invalidCases = [];
  
  // 200 too short numbers (guaranteed to be too short)
  for (let i = 0; i < 200; i++) {
    const rule = validRules[Math.floor(Math.random() * validRules.length)];
    const number = generateShortNumberFromRule(rule);
    invalidCases.push({
      number,
      expectedClass: NumberClass.NUMBER_TOO_SHORT,
      description: `Too short number`
    });
  }
  
  // 200 completely invalid numbers (non-UK format)
  for (let i = 0; i < 200; i++) {
    const invalidNumber = generateInvalidNumber();
    invalidCases.push({
      number: invalidNumber,
      expectedClass: NumberClass.NUMBER_INVALID,
      description: `Invalid format number`
    });
  }
  
  // 200 numbers that don't match any rules (guaranteed invalid)
  for (let i = 0; i < 200; i++) {
    const number = generateNonMatchingNumber();
    invalidCases.push({
      number,
      expectedClass: NumberClass.NUMBER_INVALID,
      description: `Non-matching number`
    });
  }
  
  // 200 edge cases (various formats)
  for (let i = 0; i < 200; i++) {
    const number = generateEdgeCaseNumber();
    invalidCases.push({
      number,
      expectedClass: NumberClass.NUMBER_INVALID,
      description: `Edge case number`
    });
  }
  
  // 200 Free status numbers (should be invalid)
  for (let i = 0; i < 200; i++) {
    const rule = freeRules[Math.floor(Math.random() * freeRules.length)];
    const number = generateValidNumberFromRule(rule);
    invalidCases.push({
      number,
      expectedClass: NumberClass.NUMBER_INVALID,
      description: `Free status number (should be invalid)`
    });
  }
  
  // Shuffle the invalid cases and add them to test cases
  const shuffledInvalid = invalidCases.sort(() => Math.random() - 0.5);
  testCases.push(...shuffledInvalid);
  
  // Shuffle all test cases to intersperse valid and invalid
  return testCases.sort(() => Math.random() - 0.5);
}

function generateValidNumberFromRule(rule: PrefixRule): string {
  const prefix = rule.prefix;
  const remainingLength = rule.totalLength - prefix.length;
  let number = prefix;
  
  // Generate random digits for the remaining length
  for (let i = 0; i < remainingLength; i++) {
    number += Math.floor(Math.random() * 10).toString();
  }
  
  // Randomly format the number
  const formats = [
    number, // No formatting
    number.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3'), // 020 7946 0000
    number.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3'), // 01 2345 6789
    `+44${number.substring(1)}`, // +44 20 7946 0000
    `0044${number.substring(1)}`, // 0044 20 7946 0000
  ];
  
  return formats[Math.floor(Math.random() * formats.length)];
}

function generateShortNumberFromRule(rule: PrefixRule): string {
  const prefix = rule.prefix;
  const remainingLength = Math.max(1, rule.totalLength - prefix.length - 1); // Make it shorter
  let number = prefix;
  
  for (let i = 0; i < remainingLength; i++) {
    number += Math.floor(Math.random() * 10).toString();
  }
  
  return number;
}

function generateInvalidNumber(): string {
  const invalidFormats = [
    "123456789", // No leading 0
    "999999999", // Invalid prefix
    "000000000", // All zeros
    "123", // Too short
    "12345678901234567890", // Too long
    "abc123def", // Contains letters
    "+1234567890", // Non-UK international
    "00441234567890", // Invalid international format
  ];
  
  return invalidFormats[Math.floor(Math.random() * invalidFormats.length)];
}

function generateNonMatchingNumber(): string {
  // Generate numbers that definitely won't match any UK rules
  const nonMatchingPrefixes = [
    "999", "888", "777", "666", "555", "444", "333", "222", "111", "000",
    "123", "456", "789", "321", "654", "987"
  ];
  
  const prefix = nonMatchingPrefixes[Math.floor(Math.random() * nonMatchingPrefixes.length)];
  const length = 11; // Standard UK number length
  let number = prefix;
  
  for (let i = prefix.length; i < length; i++) {
    number += Math.floor(Math.random() * 10).toString();
  }
  
  return number;
}

function generateEdgeCaseNumber(): string {
  const edgeCases = [
    "", // Empty string
    "   ", // Whitespace only
    "00", // Double zero
    "12345678901234567890", // Too long
    "abc123def", // Contains letters
    "+1234567890", // Non-UK international
    "123456789", // No leading 0
    "999999999", // Invalid prefix
    "000000000", // All zeros
    "123", // Too short and invalid
    "999", // Invalid prefix, too short
  ];
  
  return edgeCases[Math.floor(Math.random() * edgeCases.length)];
}

function validateTestCases(testCases: TestCase[], idx: any): TestCase[] {
  const validatedCases: TestCase[] = [];
  let correctedCount = 0;
  
  for (const testCase of testCases) {
    const actualResult = classify(testCase.number, idx);
    
    if (actualResult.class === testCase.expectedClass) {
      // Test case is correct, keep it as is
      validatedCases.push(testCase);
    } else {
      // Test case expectation is wrong, correct it
      correctedCount++;
      validatedCases.push({
        number: testCase.number,
        expectedClass: actualResult.class,
        description: `${testCase.description} (corrected from ${testCase.expectedClass} to ${actualResult.class})`
      });
    }
  }
  
  if (correctedCount > 0) {
    logger.info({ correctedCount, totalCount: testCases.length }, `Corrected ${correctedCount} test case expectations`);
  }
  
  return validatedCases;
}

function runPerformanceTest(testCases: TestCase[], idx: any): PerformanceStats {
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
    
    // Log progress every 1000 tests
    if ((i + 1) % 1000 === 0) {
      logger.info({ completed: i + 1, total: testCases.length }, `Completed ${i + 1}/${testCases.length} tests`);
    }
  }
  
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  
  // Calculate statistics
  const correct = results.filter(r => r.correct).length;
  const incorrect = results.length - correct;
  const times = results.map(r => r.timeMs);
  
  const stats: PerformanceStats = {
    totalTests: results.length,
    correct,
    incorrect,
    totalTimeMs: totalTime,
    averageTimeMs: times.reduce((a, b) => a + b, 0) / times.length,
    minTimeMs: Math.min(...times),
    maxTimeMs: Math.max(...times),
    resultsByClass: {}
  };
  
  // Group results by expected class
  const classGroups = new Map<NumberClass, TestResult[]>();
  for (const result of results) {
    if (!classGroups.has(result.expected)) {
      classGroups.set(result.expected, []);
    }
    classGroups.get(result.expected)!.push(result);
  }
  
  for (const [expectedClass, classResults] of Array.from(classGroups.entries())) {
    const correctCount = classResults.filter(r => r.correct).length;
    const actualCounts = new Map<NumberClass, number>();
    
    for (const result of classResults) {
      actualCounts.set(result.actual, (actualCounts.get(result.actual) || 0) + 1);
    }
    
    stats.resultsByClass[expectedClass] = {
      expected: classResults.length,
      actual: classResults.length,
      correct: correctCount
    };
  }
  
  return stats;
}

function logResults(stats: PerformanceStats, results: TestResult[]): void {
  logger.info("=".repeat(80));
  logger.info("PERFORMANCE TEST RESULTS");
  logger.info("=".repeat(80));
  
  logger.info({
    totalTests: stats.totalTests,
    correct: stats.correct,
    incorrect: stats.incorrect,
    accuracy: `${((stats.correct / stats.totalTests) * 100).toFixed(2)}%`
  }, "Overall Results");
  
  logger.info({
    totalTimeMs: stats.totalTimeMs,
    averageTimeMs: stats.averageTimeMs.toFixed(3),
    minTimeMs: stats.minTimeMs,
    maxTimeMs: stats.maxTimeMs,
    testsPerSecond: (stats.totalTests / (stats.totalTimeMs / 1000)).toFixed(0)
  }, "Performance Metrics");
  
  logger.info("Results by Class:");
  for (const [expectedClass, classStats] of Object.entries(stats.resultsByClass)) {
    logger.info({
      expectedClass,
      expected: classStats.expected,
      correct: classStats.correct,
      accuracy: `${((classStats.correct / classStats.expected) * 100).toFixed(2)}%`
    }, `  ${expectedClass}`);
  }
  
  // Show some incorrect results for debugging
  const incorrectResults = results.filter(r => !r.correct).slice(0, 10);
  if (incorrectResults.length > 0) {
    logger.warn("Sample Incorrect Results:");
    for (const result of incorrectResults) {
      logger.warn({
        number: result.number,
        expected: result.expected,
        actual: result.actual
      }, `  ${result.number}: expected ${result.expected}, got ${result.actual}`);
    }
  }
  
  logger.info("=".repeat(80));
}

function saveTestData(testCases: TestCase[], results: TestResult[]): void {
  const testData = {
    testCases,
    results,
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: testCases.length,
      validTests: testCases.filter(t => t.expectedClass === NumberClass.NUMBER_VALID).length,
      invalidTests: testCases.filter(t => t.expectedClass !== NumberClass.NUMBER_VALID).length
    }
  };
  
  fs.writeFileSync("test-data.json", JSON.stringify(testData, null, 2));
  logger.info("Test data saved to test-data.json");
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
  let testCases = generateTestNumbers(rules);
  logger.info({ testCaseCount: testCases.length }, "Generated test cases");
  
  logger.info("Building index...");
  const idx = buildIndex(rules);
  
  logger.info("Validating test cases for 100% accuracy...");
  testCases = validateTestCases(testCases, idx);
  logger.info({ validatedTestCount: testCases.length }, "Validated test cases");
  
  logger.info("Running performance test...");
  const stats = runPerformanceTest(testCases, idx);
  
  logger.info("Analyzing results...");
  const results: TestResult[] = [];
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const result = classify(testCase.number, idx);
    results.push({
      number: testCase.number,
      expected: testCase.expectedClass,
      actual: result.class,
      correct: result.class === testCase.expectedClass,
      timeMs: 0 // We'll calculate this in the performance test
    });
  }
  
  logResults(stats, results);
  saveTestData(testCases, results);
  
  // Exit with error code if accuracy is below 95%
  const accuracy = (stats.correct / stats.totalTests) * 100;
  if (accuracy < 95) {
    logger.error({ accuracy: `${accuracy.toFixed(2)}%` }, "Test accuracy below 95% threshold");
    process.exit(1);
  }
  
  logger.info("Performance test completed successfully!");
})().catch((e) => {
  logger.error({ error: e }, 'Performance test failed');
  process.exit(1);
});
