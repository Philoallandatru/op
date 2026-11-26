import argparse
from collections import Counter
import json
from pathlib import Path
from statistics import median


def summarize(report, slices):
    baseline, candidate = ({r["caseId"]: r for r in arm["results"]} for arm in report["rounds"])
    if baseline.keys() != candidate.keys() or baseline.keys() != slices.keys():
        raise ValueError("Both arms and the case slices must cover the same planned questions")

    def label(row):
        return row["review"]["usability"]

    def counts(rows):
        outcomes = Counter(map(label, rows))
        totals = {"planned": len(rows), "completed": sum(r["status"] == "completed" for r in rows),
                "ready": outcomes["ready"], "misleading": outcomes["misleading"], "revise": outcomes["revise"],
                "no_answer": outcomes["no_answer"], "passed": sum(r["review"]["passed"] for r in rows),
                "median_seconds": round(median(r["seconds"] for r in rows), 3)}
        for name, endpoint in (("conditionMetric", "conditions_complete"), ("acceptanceMetric", "acceptance_complete")):
            if name in report:
                key = report[name]["criterionId"]
                totals[endpoint] = sum(r["review"]["credits"].get(key) == 1 for r in rows)
        if "latencyMetric" in report:
            completed = [r for r in rows if r["status"] == "completed" and r["seconds"] is not None]
            timed = [r["phaseSeconds"] for r in completed if "phaseSeconds" in r]
            totals["median_seconds"] = round(median(r["seconds"] for r in completed), 3) if completed else None
            totals["timed_completed"] = len(timed)
            totals["median_phase_seconds"] = {stage: round(median(row[stage] for row in timed), 3)
                                               for stage in report["latencyMetric"]["stages"]} if timed else None
        return totals

    def measure(ids):
        left, right = [baseline[i] for i in ids], [candidate[i] for i in ids]
        both = [(a, b) for a, b in zip(left, right) if a["status"] == b["status"] == "completed"]
        result = {
            "baseline": counts(left), "candidate": counts(right),
            "newly_ready": [a["caseId"] for a, b in zip(left, right) if label(a) != "ready" and label(b) == "ready"],
            "lost_ready": [a["caseId"] for a, b in zip(left, right) if label(a) == "ready" and label(b) != "ready"],
            "both_completed": {"count": len(both), "baseline_misleading": sum(label(a) == "misleading" for a, _ in both),
                               "candidate_misleading": sum(label(b) == "misleading" for _, b in both)},
        }
        if "latencyMetric" in report:
            timed_pairs = [(a, b) for a, b in both if a["seconds"] is not None and b["seconds"] is not None]
            if timed_pairs:
                result["both_completed"].update(
                    timed=len(timed_pairs), candidate_faster=sum(b["seconds"] < a["seconds"] for a, b in timed_pairs),
                    median_paired_seconds_saved=round(median(a["seconds"] - b["seconds"] for a, b in timed_pairs), 3))
        return result

    return {"all": measure(list(baseline)), **{name: measure([i for i in baseline if slices[i] == name])
                                                for name in sorted(set(slices.values()))}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Summarize paired SSD field scores by original question slice")
    parser.add_argument("report", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--exclude", action="append", default=[])
    parser.add_argument("--bank", type=Path, default=Path(__file__).resolve().parents[2] / "scenarios/field-engineering-v6.jsonl")
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.bank.read_text(encoding="utf-8").splitlines()]
    source = json.loads(args.report.read_text(encoding="utf-8"))
    slices = {r["id"]: r["evaluation_slice"] for r in rows}
    metrics = summarize(source, slices)
    if args.exclude:
        exclude = set(args.exclude)
        if exclude - slices.keys():
            raise ValueError("An excluded case was outside this study")
        filtered = {**source, "rounds": [{"results": [r for r in a["results"] if r["caseId"] not in exclude]}
                               for a in source["rounds"]]}
        metrics["sensitivity"] = {"excluded": sorted(exclude),
                                  "scopes": summarize(filtered, {i: s for i, s in slices.items() if i not in exclude})}
    document = json.dumps(metrics, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(document + "\n", encoding="utf-8")
    else:
        print(document)
