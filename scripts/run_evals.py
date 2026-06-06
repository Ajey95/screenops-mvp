import json
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.agent import plan_actions  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.models import Signal  # noqa: E402


def main() -> int:
    settings = get_settings()
    scenarios = json.loads((ROOT / "evals" / "golden_scenarios.json").read_text(encoding="utf-8"))
    failures: list[str] = []

    for scenario in scenarios:
        signal_payload = {
            **scenario["signal"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "session_id": f"eval-{scenario['name']}",
        }
        run = plan_actions(settings, Signal(**signal_payload))
        tools = [action.tool for action in run.actions]
        risks = {action.tool: action.risk.value for action in run.actions}
        if tools != scenario["expected_tools"]:
            failures.append(f"{scenario['name']}: tools {tools} != {scenario['expected_tools']}")
        for tool, expected_risk in scenario["expected_risks"].items():
            if risks.get(tool) != expected_risk:
                failures.append(f"{scenario['name']}: {tool} risk {risks.get(tool)} != {expected_risk}")
        expected_recipient = scenario["signal"].get("recipient_email")
        if expected_recipient:
            gmail = next(action for action in run.actions if action.tool == "gmail.drafts.create")
            if gmail.payload.get("to") != expected_recipient:
                failures.append(
                    f"{scenario['name']}: gmail recipient {gmail.payload.get('to')} != {expected_recipient}"
                )
        calendar = next(action for action in run.actions if action.tool == "calendar.events.create")
        if calendar.payload.get("deadline") != scenario["signal"]["deadline"]:
            failures.append(
                f"{scenario['name']}: calendar deadline {calendar.payload.get('deadline')} != {scenario['signal']['deadline']}"
            )

    if failures:
        print("FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"PASSED {len(scenarios)} planning scenarios")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
