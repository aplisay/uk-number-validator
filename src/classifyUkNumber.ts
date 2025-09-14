
export enum NumberClass {
  NUMBER_VALID = "NUMBER_VALID",
  NUMBER_INVALID = "NUMBER_INVALID",
  NUMBER_TOO_SHORT = "NUMBER_TOO_SHORT",
}

export interface ClassificationResult {
  class: NumberClass;
  provider?: string;
}

export interface PrefixRule {
  prefix: string;       // digits-only prefix in national format
  totalLength: number;  // required total digit count for numbers under this prefix
  status: string;       // Ofcom status string
  provider?: string;    // CP Name (provider name)
}

export interface PrefixIndex {
  children?: Map<string, PrefixIndex>;
  rules?: PrefixRule[];
}

export function buildIndex(rules: PrefixRule[]): PrefixIndex {
  const root: PrefixIndex = { children: new Map() };
  for (const r of rules) {
    let node = root;
    for (const d of r.prefix) {
      if (!node.children!.has(d)) node.children!.set(d, { children: new Map() });
      node = node.children!.get(d)!;
    }
    (node.rules ??= []).push(r);
  }
  return root;
}

export function normaliseToUkNational(input: string): string | null {
  const digits = (input || "").replace(/\D+/g, "");
  if (!digits) return null;

  // 0044 and +44 handling
  if (digits.startsWith("0044")) {
    const rest = digits.slice(4);
    if (!rest) return null;
    return rest.startsWith("0") ? rest : "0" + rest;
  }
  if (digits.startsWith("44")) {
    const rest = digits.slice(2);
    if (!rest) return null;
    return rest.startsWith("0") ? rest : "0" + rest;
  }

  // Type A/B/C access codes can start with '1'
  if (digits.startsWith("1")) return digits;

  // Otherwise require leading 0 in national format
  if (!digits.startsWith("0")) return null;

  return digits;
}

export function classifyUkNumber(national: string, idx: PrefixIndex): ClassificationResult {
  if (!national) return { class: NumberClass.NUMBER_INVALID };

  let node: PrefixIndex | undefined = idx;
  let matchedRules: PrefixRule[] = [];
  for (let i = 0; i < national.length && node; i++) {
    const d = national[i];
    node = node.children?.get(d);
    if (node?.rules?.length) matchedRules = matchedRules.concat(node.rules);
  }

  const len = national.length;

  if (matchedRules.length) {
    const live = matchedRules.filter(r => !/unavailable|withdrawn|^free$/i.test(r.status));

    // Check for exact matches first (where prefix equals the full number)
    const exactMatch = live.find(r => r.prefix === national);
    if (exactMatch) {
      return { 
        class: NumberClass.NUMBER_VALID, 
        provider: exactMatch.provider 
      };
    }
    
    // Check for prefix matches with correct length
    const tooShortMatch = live.find(r => r.totalLength > len);
    if (tooShortMatch) {
      return { 
        class: NumberClass.NUMBER_TOO_SHORT, 
        provider: tooShortMatch.provider 
      };
    }
    
    const validMatch = live.find(r => r.totalLength === len);
    if (validMatch) {
      return { 
        class: NumberClass.NUMBER_VALID, 
        provider: validMatch.provider 
      };
    }
  }

  if (existsRuleThatStartsWithDigits(national, idx)) {
    return { class: NumberClass.NUMBER_TOO_SHORT };
  }

  return { class: NumberClass.NUMBER_INVALID };
}

function existsRuleThatStartsWithDigits(digits: string, idx: PrefixIndex): boolean {
  let node: PrefixIndex | undefined = idx;
  for (const d of digits) {
    node = node?.children?.get(d);
    if (!node) return false;
  }
  return hasDescendantRule(node);
}

function hasDescendantRule(node?: PrefixIndex): boolean {
  if (!node) return false;
  if (node.rules?.length) return true;
  for (const child of Array.from(node.children?.values() ?? [])) {
    if (hasDescendantRule(child)) return true;
  }
  return false;
}
