import scenarios from "../../evals/extraction_scenarios.json";
import { parseIntent } from "./intentParser";
import { writeFileSync } from "node:fs";

type Scenario = {
  name: string;
  screen_text: string;
  transcript: string;
  llm_raw: string;
  expected: {
    has_intent: boolean;
    signal_type: string;
    entity: string;
    action_keywords: string[];
    deadline: string;
  };
};

type Result = {
  name: string;
  intent_match: boolean;
  entity_match: boolean;
  action_match: boolean;
  deadline_match: boolean;
  false_positive: boolean;
  extraction_mode: string;
};

const results = (scenarios as Scenario[]).map(runScenario);
const totals = summarize(results);

for (const result of results) {
  const status = isPass(result) ? "PASS" : "FAIL";
  console.log(`${status} ${result.name} mode=${result.extraction_mode}`);
}

console.log(JSON.stringify(totals, null, 2));
writeFileSync(
  new URL("../../evals/extraction_metrics.json", import.meta.url),
  `${JSON.stringify({ generated_at: new Date().toISOString(), ...totals, results }, null, 2)}\n`
);

if (totals.failures > 0) {
  process.exit(1);
}

function runScenario(scenario: Scenario): Result {
  const intent = parseIntent(scenario.llm_raw, scenario.screen_text, scenario.transcript);
  const predictedHasIntent = intent.action_required.toLowerCase() !== "none" && intent.confidence >= 0.5;
  const expectedHasIntent = scenario.expected.has_intent;
  return {
    name: scenario.name,
    intent_match: predictedHasIntent === expectedHasIntent,
    entity_match: normalize(intent.entity) === normalize(scenario.expected.entity),
    action_match: scenario.expected.action_keywords.every((keyword) => normalize(intent.action_required).includes(normalize(keyword))),
    deadline_match: normalize(intent.deadline) === normalize(scenario.expected.deadline),
    false_positive: !expectedHasIntent && predictedHasIntent,
    extraction_mode: intent.extraction_mode
  };
}

function summarize(items: Result[]) {
  const passed = items.filter(isPass).length;
  return {
    scenarios: items.length,
    passed,
    failures: items.length - passed,
    intent_match_rate: rate(items, "intent_match"),
    entity_f1_proxy: rate(items, "entity_match"),
    action_match_rate: rate(items, "action_match"),
    deadline_match_rate: rate(items, "deadline_match"),
    false_positive_rate: Number((items.filter((item) => item.false_positive).length / items.length).toFixed(4)),
    fallback_count: items.filter((item) => item.extraction_mode === "local_safety_parser").length
  };
}

function isPass(result: Result) {
  return result.intent_match && result.entity_match && result.action_match && result.deadline_match && !result.false_positive;
}

function rate(items: Result[], key: keyof Pick<Result, "intent_match" | "entity_match" | "action_match" | "deadline_match">) {
  return Number((items.filter((item) => item[key]).length / items.length).toFixed(4));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
