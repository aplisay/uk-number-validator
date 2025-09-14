"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const classifyUkNumber_1 = require("../classifyUkNumber");
function classify(input, rules) {
    const national = (0, classifyUkNumber_1.normaliseToUkNational)(input);
    if (!national)
        return classifyUkNumber_1.NumberClass.NUMBER_INVALID;
    const idx = (0, classifyUkNumber_1.buildIndex)(rules);
    return (0, classifyUkNumber_1.classifyUkNumber)(national, idx);
}
function assertEq(name, a, b) {
    if (a !== b) {
        console.error(`✗ ${name}: expected ${b}, got ${a}`);
        process.exit(1);
    }
    else {
        console.log(`✓ ${name}: ${a}`);
    }
}
(function main() {
    const rulesPath = path.resolve(process.cwd(), "prefixes.json");
    if (!fs.existsSync(rulesPath)) {
        console.error("prefixes.json not found. Run 'npm run build:all' first.");
        process.exit(2);
    }
    const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
    assertEq("020 7946 0000", classify("020 7946 0000", rules), classifyUkNumber_1.NumberClass.NUMBER_VALID);
    assertEq("+44 20 7946 0000", classify("+44 20 7946 0000", rules), classifyUkNumber_1.NumberClass.NUMBER_VALID);
    assertEq("0151", classify("0151", rules), classifyUkNumber_1.NumberClass.NUMBER_TOO_SHORT);
    assertEq("07418534", classify("07418534", rules), classifyUkNumber_1.NumberClass.NUMBER_TOO_SHORT);
    assertEq("000", classify("000", rules), classifyUkNumber_1.NumberClass.NUMBER_INVALID);
    // Common short codes (dependent on S10): 116123 should be valid if present in dataset
    const short = classify("116123", rules);
    if (short !== classifyUkNumber_1.NumberClass.NUMBER_VALID) {
        console.warn("Note: 116123 did not validate as NUMBER_VALID; check S10 files availability/status.");
        console.log("All basic tests executed.");
    }
    console.log('All basic tests executed.');
})();
