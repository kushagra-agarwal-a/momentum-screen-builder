/**
 * Sample NSE corporates-corporateActions for ~200 symbols; classify subject lines.
 */
import { readFileSync, writeFileSync } from "fs";
import { fetchIndexSymbols } from "../src/lib/engine/universe.ts";
import { getNseSessionCookie, fetchCorporateActions } from "../src/lib/engine/corporate-actions.ts";

const OUT = "/workspace/docs/nse-ca-sample.json";

function classify(subject) {
  const s = subject.trim();
  const lower = s.toLowerCase();
  if (/right\s*issue|rights issue/i.test(s)) return "rights";
  if (/buy back|buyback|share repurchase/i.test(lower)) return "buyback";
  if (/merger|amalgamation|scheme of arrangement|demerger|spin[- ]?off|slump sale|arrangement/i.test(lower))
    return "scheme_merger_demerger";
  if (/face value|sub-division|sub division|stock split|split from|split \(/i.test(lower)) return "split";
  if (/bonus/i.test(lower)) return "bonus";
  if (/dividend|interim dividend|special dividend|final dividend/i.test(lower)) return "dividend";
  if (/annual general meeting|agm|egm|extraordinary general|postal ballot|book closure|record date/i.test(lower))
    return "administrative";
  if (/capital reduction|consolidation|reverse split/i.test(lower)) return "consolidation";
  if (/delist|suspension|name change|symbol change|isin change/i.test(lower)) return "corporate_other";
  return "other";
}

/** Standard back-adjust multipliers (price adjustment factor for history before ex-date). */
export function adjustmentRule(classification, subject) {
  switch (classification) {
    case "bonus": {
      const m = subject.match(/(\d+)\s*:\s*(\d+)/i);
      if (!m) return { method: "price_ratio_fallback", note: "bonus ratio parse failed" };
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      // NSE "Bonus A:B" = A bonus shares for every B held → new shares = B+A, price × B/(A+B)
      return { method: "multiply_pre_ex", factor: b / (a + b), formula: "B/(A+B)" };
    }
    case "split": {
      const fromTo = subject.match(/from\s*rs\.?\s*([\d.]+)[\s/-]*(?:per share)?\s*to\s*(?:re\.?|rs\.?\s*)?\s*([\d.]+)/i);
      if (fromTo) {
        const oldF = parseFloat(fromTo[1]);
        const newF = parseFloat(fromTo[2]);
        if (oldF > 0 && newF > 0) return { method: "multiply_pre_ex", factor: newF / oldF, formula: "newFace/oldFace" };
      }
      const ratio = subject.match(/(\d+)\s*:\s*(\d+)/);
      if (ratio) {
        const a = parseInt(ratio[1], 10);
        const b = parseInt(ratio[2], 10);
        // split A:B often means A new for B old → factor B/A on price
        return { method: "multiply_pre_ex", factor: b / a, formula: "split B/A" };
      }
      return { method: "price_ratio_fallback", note: "split parse failed" };
    }
    case "consolidation":
      return { method: "price_ratio_fallback", note: "reverse split / consolidation — use ex-day ratio" };
    case "dividend": {
      const m = subject.match(/(?:rs\.?|re\.?)\s*([\d.]+)/i);
      if (m) return { method: "multiply_pre_ex", factor: null, formula: "(P-div)/P on ex-date pre-close" };
      return { method: "skip_or_small", note: "dividend amount not parsed" };
    }
    case "scheme_merger_demerger":
      return { method: "price_ratio_ex_date", note: "post/pre close on ex-date (may need sibling listing)" };
    case "rights":
      return { method: "special", note: "rights — adjust by theoretical ex-rights formula, not simple ratio" };
    case "buyback":
      return { method: "none", note: "buyback — usually no price series back-adjust for free-float screens" };
    case "administrative":
      return { method: "none", note: "no price adjust" };
    default:
      return { method: "review", note: "manual" };
  }
}

const symbols = (await fetchIndexSymbols("is_nifty_500")).slice(0, 200);
const cookie = await getNseSessionCookie();

const byClass = {};
const examples = {};
const allRows = [];
let ok = 0;
let fail = 0;

for (let i = 0; i < symbols.length; i++) {
  const sym = symbols[i];
  if (i > 0 && i % 10 === 0) await new Promise((r) => setTimeout(r, 400));
  const rows = await fetchCorporateActions(sym, cookie);
  if (!rows.length) fail++;
  else ok++;
  for (const row of rows) {
    const cls = classify(row.subject);
    byClass[cls] = (byClass[cls] || 0) + 1;
    if (!examples[cls] || examples[cls].length < 5) {
      examples[cls] = examples[cls] || [];
      examples[cls].push({ symbol: sym, ...row, rule: adjustmentRule(cls, row.subject) });
    }
    allRows.push({ symbol: sym, ...row, classification: cls });
  }
}

const summary = {
  sampled_symbols: symbols.length,
  symbols_with_any_ca: ok,
  symbols_empty_or_failed: fail,
  total_action_rows: allRows.length,
  counts_by_classification: byClass,
  examples_by_classification: examples,
  generated_at: new Date().toISOString(),
};

writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
