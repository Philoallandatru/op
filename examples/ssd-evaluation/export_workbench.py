"""Build a portable OpenKnowledge evaluation report from planned questions, Pi runs and reviews."""
import argparse
import json
from pathlib import Path

from benchmark import LABELS
from scenario_eval import blind, keyed, load_lines, score, select


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def case_key(case_id, form):
    if type(form) is not int or form < 0:
        raise ValueError(f"{case_id}: invalid follow-up form {form!r}")
    return f"{case_id}:branch-{form}" if form else case_id


def plan_cases(directory, config, bank):
    if ("plan" in config) == ("caseIds" in config):
        raise ValueError(f"{config['id']}: supply exactly one blind plan or caseIds list")
    if "plan" in config:
        plan = load_lines(directory / config["plan"])
    else:
        plan = [blind(bank[case_id]) for case_id in config["caseIds"]]
    planned = {}
    for row in plan:
        item = bank[row["id"]]
        form = row.get("form", 0)
        key = case_key(item["id"], form)
        expected = blind(item, form or None)
        if any(row.get(field) != expected[field] for field in ("id", "spec", "question", "protocol")):
            raise ValueError(f"{key}: blind plan differs from current case, observations or specification")
        if key in planned:
            raise ValueError(f"{key}: duplicate planned case")
        planned[key] = (item, form)
    if not planned:
        raise ValueError(f"{config['id']}: no planned questions")
    return planned


def public_case(item, form):
    key = case_key(item["id"], form)
    data = {k: item[k] for k in ("family", "split", "question", "observations", "criteria", "reject")}
    data.update(id=key, referenceAnswer=item["reference_answer"])
    data["evidence"] = [
        {"id": e["id"], "source": LABELS[e["protocol"]], "page": e["pdf_page"],
         "section": e["section"], "anchor": e["anchor"]} for e in item["evidence"]]
    if form:
        branch = item["followup"]["branches"][form - 1]
        data.update(observations=[*item["observations"], branch["observation"]],
                    question=item["question"] + " 现在如何更新决定？", referenceAnswer=branch["expected_decision"],
                    blindFollowup={"caseId": item["id"], "form": form, "question": blind(item, form)["question"]},
                    criteria=[{"id": "update", "text": branch["expected_decision"],
                               "weight": 1, "critical": True, "evidence": []}])
    return data


def indexed_records(records, form_field, planned):
    indexed = {}
    for row in records:
        key = case_key(row["id"], row.get(form_field, 0))
        if key not in planned or key in indexed:
            raise ValueError(f"{key}: duplicate or unplanned record")
        indexed[key] = row
    return indexed


def read_pages(events):
    pages = dict.fromkeys((entry["protocol"], entry["pdf_page"]) for entry in events
                         if entry.get("tool") == "read_spec_page" and entry.get("status") == "ok")
    return [{"source": LABELS[source], "page": page} for source, page in pages]


def read_run(path):
    run = read_json(path)
    audit = path.with_name("calls.jsonl")
    if audit.is_file():
        run["readPages"] = read_pages(load_lines(audit))
    return run


def result_for(item, form, run, assessment):
    key = case_key(item["id"], form)
    expected = blind(item, form or None)
    archived_prompt = assessment if assessment is not None and "question" in assessment else None
    for record in (run, archived_prompt):
        if record is not None and any(record.get(k) != expected[k] for k in ("question", "spec", "protocol")):
            raise ValueError(f"{key}: executed prompt differs from the plan")
    if run is not None:
        if assessment is not None and "answer" in assessment and assessment["answer"] != run["answer"]:
            raise ValueError(f"{key}: review contains a different answer")
    record = run if run is not None else assessment
    answer = None
    seconds = None
    calls = None
    status = "pending"
    if record is not None:
        if not isinstance(record.get("answer"), str):
            raise ValueError(f"{key}: supply Pi output or an archived review containing its answer")
        answer = record["answer"] if record["answer"].strip() else None
        seconds, calls = record.get("seconds"), record.get("attempts")
        status = "completed" if answer is not None else "incomplete"
    grade = None
    if assessment is not None:
        if assessment["completed"] != (status == "completed"):
            raise ValueError(f"{key}: completion differs between run and review")
        scored_case = {"id": key, "criteria": public_case(item, form)["criteria"], "reject": item["reject"]}
        scored = score([scored_case], [dict(assessment, id=key)])["cases"][0]
        grade = {"usability": scored["usability"], "reason": scored["reason"],
                 "otherError": scored["other_error"], "credits": scored["criteria"],
                 "rejectHits": scored["reject_hits"], "score": scored["score"],
                 "passed": scored["status"] == "pass"}
    result = {"caseId": key, "status": status, "answer": answer, "seconds": seconds, "toolCalls": calls, "review": grade}
    if run is not None and "readPages" in run:
        result["readPages"] = run["readPages"]
    elif assessment is not None and "calls" in assessment:
        result["readPages"] = read_pages(assessment["calls"])
    if assessment is not None and "totalTokens" in assessment.get("observed_usage", {}):
        result["tokens"] = assessment["observed_usage"]["totalTokens"]
    return result


def build(manifest_path):
    manifest = read_json(manifest_path)
    directory = manifest_path.parent
    rounds = keyed(manifest["rounds"], "manifest rounds")
    if not rounds:
        raise ValueError("At least one round is required")
    bank = keyed(select(argparse.Namespace(suite="all", split=None, id=None)), "cases")
    cases = {}
    output = []
    contexts = set()
    for name, config in rounds.items():
        planned = plan_cases(directory, config, bank)
        reviews = indexed_records(load_lines(directory / config["reviews"]), "branch", planned) if "reviews" in config else {}
        runs = {}
        if "runs" in config:
            folder = directory / config["runs"]
            if not folder.is_dir():
                raise ValueError(f"{name}: run directory does not exist")
            runs = indexed_records((read_run(p) for p in sorted(folder.glob("*/result.json"))), "form", planned)
        results = []
        for key, (item, form) in planned.items():
            cases.setdefault(key, public_case(item, form))
            blind_row = blind(item, form or None)
            contexts.add((blind_row["spec"], blind_row["protocol"]))
            results.append(result_for(item, form, runs.get(key), reviews.get(key)))
        output.append({"id": name, "label": config["label"], "config": config["config"], "results": results})
    report = {"schemaVersion": 1, "title": manifest["title"], "cases": list(cases.values()), "rounds": output}
    if len(contexts) == 1:
        spec, protocol = next(iter(contexts))
        report["blindContext"] = {"spec": spec, "protocol": protocol, "observationHeading": "现场观测"}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="JSON manifest; input paths are relative to this file")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = json.dumps(build(args.manifest), ensure_ascii=False, allow_nan=False, indent=2) + "\n"
    if len(data.encode("utf-8")) > 8 * 1024 * 1024:
        parser.error("Report exceeds the workbench's 8 MiB limit; split it into smaller cohorts")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(data.encode("utf-8"))
    print(args.output)


if __name__ == "__main__":
    main()
