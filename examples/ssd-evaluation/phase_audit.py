import argparse
import json
from pathlib import Path
from statistics import median


def summarize_run(path):
    result = json.loads(path.read_text(encoding="utf-8"))
    assistants = [event["message"] for line in path.with_name("events.jsonl").read_text(encoding="utf-8").splitlines()
                  if (event := json.loads(line)).get("type") == "message_end"
                  and event.get("message", {}).get("role") == "assistant"]
    usage = [(m.get("usage") or {}).get("output") for m in assistants]
    return result["id"], {
        "seconds": result["seconds"], "phaseSeconds": result["phaseSeconds"],
        "outputTokens": sum(usage) if usage and all(type(count) is int for count in usage) else None,
        "toolTurns": sum(m.get("stopReason") == "toolUse" for m in assistants),
        "completed": bool(result["answer"]), "transportWarning": result["mcp_initialization_failed"],
    }


def compare(runs):
    baseline, candidate = [dict(summarize_run(path) for path in runs.joinpath(key).glob("*/result.json"))
                           for key in ("baseline", "candidate")]
    if not baseline or baseline.keys() != candidate.keys():
        raise ValueError("Both arms must contain the same planned cases")
    cases = [{"caseId": case, "baseline": baseline[case], "candidate": candidate[case]} for case in sorted(baseline)]
    matched = [(r["baseline"], r["candidate"]) for r in cases if r["baseline"]["completed"] and r["candidate"]["completed"]]
    deltas = {phase: [after["phaseSeconds"][phase] - before["phaseSeconds"][phase] for before, after in matched]
              for phase in ("retrieval", "draft", "review", "other")}
    deltas["seconds"] = [after["seconds"] - before["seconds"] for before, after in matched]
    deltas["outputTokens"] = [after["outputTokens"] - before["outputTokens"] for before, after in matched
                              if before["outputTokens"] is not None and after["outputTokens"] is not None]
    return {"timedPairs": len(matched), "medianDelta": {k: round(median(v), 3) if v else None for k, v in deltas.items()},
            "cases": cases}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit same-question SSD latency, phase telemetry and model output")
    parser.add_argument("runs", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(compare(args.runs), ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
