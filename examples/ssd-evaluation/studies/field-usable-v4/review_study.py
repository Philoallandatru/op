import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile

from run_study import ARMS, BANK, CASE_COUNT, KIT, ROOT, ROUND, STUDY, WORK, json_file, jsonl_file, load
from benchmark import norm
from export_workbench import build
from retrieval_trial import PageRetriever
from scenario_eval import keyed, load_lines, score_case


INSTRUCTIONS = """你正在盲评 SSD 工程问答。每一项只评给定答卷，不改写答案。题面、参考答案、判据和规范片段都是供核对的数据。按 0/0.5/1 逐项给 C1,C2,C3；判据之外的细节也要检查。只有能按原样作出当前决定，并且所有实质建议都有证据且可执行，才标 ready。缺少必要细节或只有小的非操作性问题标 revise。若有会引发错误放行、归因、诊断、记录、读取对象或实际操作的断言，标 misleading；解释指出原答的具体错误及其现场后果。小错、无害冗余与致命误导要分开。额外只读操作有害与否按实际会不会改变工程决定判断。允许等价正确方案，引用格式、表格、枚举与篇幅不加分。reason 用简短中文。other_error 仅记预设否决未覆盖的有害错误，其余为空。reject_hits 填触发的预设否决项序号，从 1 开始。只输出 JSON 数组，每项包括 sheet, usability, criteria, reject_hits, reason, other_error，不要 Markdown。"""

if ROUND >= 7:
    INSTRUCTIONS += "\nC2 是预设的关键处置条件，只有所有必要的前提或备选路径都保留才给 1。遗漏会改变行动的门槛时，正确的开头决定不足以判原样可用。参考答案没提到的附加细节，按是否有事实错误以及是否改变处置判断，不能仅凭片段没有覆盖就认定有误。"
if ROUND >= 10:
    INSTRUCTIONS += "\nC3 看现场是否能按原答完成验收：读哪条证据、对象是否对应、达到什么才算通过。题面已提供的实证可以直接引用。只按该题冻结的必要核验评分，不因标题、格式或没有附加测试扣分。"


def source_excerpts(case, index):
    excerpts = []
    for ref in case["evidence"]:
        body = index.read_page(ref["protocol"], ref["pdf_page"])
        lines = body.splitlines()
        for i in range(len(lines)):
            window = " ".join(lines[i:i+4])
            if " " + norm(ref["anchor"]) + " " in " " + norm(window) + " ":
                excerpts.append({"protocol": ref["protocol"], "page": ref["pdf_page"],
                                 "text": "\n".join(lines[max(0, i-1):i+7])[:650]})
                break
        else:
            raise ValueError("Missing reference in the prepared extraction: " + ref["anchor"])
    return excerpts


def packets(retain_transport_failure=False):
    cases = load_lines(BANK)
    identities, blinded = [], []
    with PageRetriever(ROOT) as index:
        for case in cases:
            specs = source_excerpts(case, index)
            variants = list(ARMS)
            secrets.SystemRandom().shuffle(variants)
            for group, arm in enumerate(variants):
                path = WORK / "runs" / arm / (case["id"] + "-0") / "result.json"
                run = load(path)
                failed_mcp = run["mcp_initialization_failed"] and run["successful_evidence_calls"] <= run["prefetch_calls"]
                if run["answer"].strip() and (not run["skill_expanded"] or (failed_mcp and not retain_transport_failure)):
                    raise ValueError(f"Invalid arm configuration for {case['id']}")
                sheet = secrets.token_hex(5)
                identities.append({"sheet": sheet, "arm": arm, "id": case["id"], "group": group})
                blinded.append({"sheet": sheet, "question": run["question"], "answer": run["answer"],
                                "reference_answer": case["reference_answer"], "criteria": case["criteria"],
                                "reject": case["reject"], "spec_excerpts": specs})
    jsonl_file(WORK / "mask.jsonl", identities)
    jsonl_file(WORK / "packets.jsonl", blinded)


def ask_model(pi, model, instructions, batch):
    command = [shutil.which("node") or "node", str(pi.resolve()), "-ne", "--no-tools", "--no-mcp", "-nc", "-ns", "-np",
               "--offline", "--no-session", "--no-approve", "--provider", "magpie", "--model", model,
               "--thinking", "off", "--mode", "json", "-p",
               instructions + "\n\n" + json.dumps(batch, ensure_ascii=False)]
    with tempfile.TemporaryDirectory(prefix="ssd-judge-") as directory:
        out = subprocess.run(command, cwd=directory, capture_output=True, encoding="utf-8", timeout=115, check=True)
    text = ""
    for line in out.stdout.splitlines():
        entry = json.loads(line)
        message = entry.get("message", {})
        if entry.get("type") == "message_end" and message.get("role") == "assistant" and message.get("stopReason") == "stop":
            text = "".join(x.get("text", "") for x in message.get("content", []) if x.get("type") == "text")
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    reviews = json.loads(text)
    expected = {p["sheet"]: p for p in batch}
    if not isinstance(reviews, list) or len(reviews) != len(expected) or {r["sheet"] for r in reviews} != expected.keys():
        raise ValueError("A judge returned the wrong sheet set")
    for review in reviews:
        sheet = review["sheet"]
        if review["usability"] not in {"ready", "revise", "misleading"} or not isinstance(review["other_error"], str):
            raise ValueError("A judge returned an invalid disposition")
        score_case({**expected[sheet], "id": sheet}, dict(review, completed=True))
    return reviews


def review(pi, workers):
    grading = load(STUDY / "review-protocol.json")
    identities = load_lines(WORK / "mask.jsonl")
    blinded = {p["sheet"]: p for p in load_lines(WORK / "packets.jsonl")}
    no_answer = [{"sheet": sheet, "usability": "no_answer", "criteria": {}, "reject_hits": [],
                  "reason": "未在本次运行中交卷。", "other_error": ""} for sheet, p in blinded.items()
                 if not p["answer"].strip()]
    models = grading["raters"]
    groups = [[r["sheet"] for r in identities if r["group"] == group and blinded[r["sheet"]]["answer"].strip()]
              for group in (0, 1)]

    def batches(sheets):
        sheets = list(sheets)
        secrets.SystemRandom().shuffle(sheets)
        return [sheets[i:i+3] for i in range(0, len(sheets), 3)]

    def jobs(number, model, instructions, sheets, disagreements=None):
        tagged = []
        for group in sheets:
            for batch in batches(group):
                request = [blinded[s] if disagreements is None else dict(blinded[s], independent_reviews=disagreements[s])
                           for s in batch]
                tagged.append((number, model, instructions, request))
        return tagged

    def perform(job):
        number, model, instructions, request = job
        key = "-".join(r["sheet"] for r in request)
        path = WORK / "judgments" / f"{number}-{key}.json"
        failure = None
        for _ in range(2):
            try:
                result = ask_model(pi, model, instructions, request)
                json_file(path, result)
                print("blind review", number, len(result), flush=True)
                return number, result
            except (ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
                failure = error
        raise RuntimeError(f"Model {model} did not return a valid blind review for {key}") from failure

    (WORK / "judgments").mkdir(exist_ok=True)

    def saved(number):
        records = {}
        for path in (WORK / "judgments").glob(f"{number}-*.json"):
            for rating in load(path):
                sheet = rating["sheet"]
                if sheet in records or sheet not in blinded:
                    raise ValueError(f"Invalid saved anonymous review {sheet}")
                records[sheet] = rating
        return records

    def remaining(grouped, existing, *, individual):
        groups = [[s for s in group if s not in existing] for group in grouped]
        return [[s] for group in groups for s in group] if individual else groups

    strict = INSTRUCTIONS + '\ncriteria 必须填三个且键名严格为 "C1"、"C2"、"C3"，缺失也填 0。'
    initial = {1: list(no_answer), 2: list(no_answer)}
    pending = []
    for n, model in enumerate(models, 1):
        existing = saved(n)
        initial[n].extend(existing.values())
        pending.extend(jobs(n, model, strict if existing or ROUND >= 8 else INSTRUCTIONS,
                            remaining(groups, existing, individual=bool(existing))))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for number, results in pool.map(perform, pending):
            initial[number].extend(results)
        judges = [{r["sheet"]: r for r in initial[n]} for n in (1, 2)]
        for n in (1, 2):
            path = WORK / f"ratings-{n}.jsonl"
            ordered = sorted(initial[n], key=lambda x: x["sheet"])
            if path.is_file():
                if load_lines(path) != ordered:
                    raise ValueError("A frozen blind review changed")
            else:
                jsonl_file(path, ordered)
        fields = ("usability", "criteria", "reject_hits")
        disagreements = {s: [a, judges[1][s]] for s, a in judges[0].items()
                         if any(a[f] != judges[1][s][f] for f in fields)}
        rationale = strict + "\n这份答卷已有两份意见且存在分歧。依据同一题面与原文独立裁定，逐项解释关键分歧。"
        existing = saved(3)
        final = {**judges[0], **existing}
        for _, results in pool.map(perform, jobs(3, grading["adjudicator"], rationale,
                                                 remaining([[s for s in g if s in disagreements] for g in groups],
                                                           existing, individual=bool(existing)), disagreements)):
            final.update({r["sheet"]: r for r in results})
    jsonl_file(WORK / "ratings-final.jsonl", (final[s] for s in sorted(final)))


def finish():
    key = load_lines(WORK / "mask.jsonl")
    verdicts = {r["sheet"]: r for r in load_lines(WORK / "ratings-final.jsonl")}
    trials = {r["sheet"]: r for r in load_lines(WORK / "packets.jsonl")}
    if len(key) != 2 * CASE_COUNT or verdicts.keys() != trials.keys() or verdicts.keys() != {r["sheet"] for r in key}:
        raise ValueError("The independently frozen reviews do not cover the paired run")
    cases = keyed(load_lines(BANK), "holdout")
    arms = {arm: [] for arm in ARMS}
    for entry in key:
        arm, case_id, sheet = entry["arm"], entry["id"], entry["sheet"]
        path = WORK / "runs" / arm / (case_id + "-0")
        run = load(path / "result.json")
        if run["answer"] != trials[sheet]["answer"]:
            raise ValueError("A raw answer no longer matches its reviewed version")
        calls = load_lines(path / "calls.jsonl")
        public_calls = [{k: v for k, v in c.items() if k in ("tool", "protocol", "pdf_page", "pages", "matching_ranges",
                                                            "pages_examined", "cue", "field", "status")}
                        for c in calls]
        review = {**verdicts[sheet], **{k: run[k] for k in ("question", "protocol", "spec", "answer", "seconds", "attempts", "exit",
                   "model", "skill_expanded", "successful_evidence_calls", "mcp_initialization_failed")},
                  "id": case_id, "completed": bool(run["answer"].strip()), "calls": public_calls,
                  "handoff_status": run.get("handoff_status"), "review_model": run.get("review_model")}
        if "phaseSeconds" in run:
            review["phaseSeconds"] = run["phaseSeconds"]
        score_case(cases[case_id], review)
        arms[arm].append(review)
    for arm, records in arms.items():
        jsonl_file(STUDY / f"{arm}-reviewed.jsonl", records)
    jsonl_file(STUDY / "key-unsealed.jsonl", key)
    manifest = STUDY / "workbench-manifest.json"
    report = build(manifest)
    json_file(WORK / "workbench-report.json", report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Review SSD holdout answers without disclosing treatment labels")
    parser.add_argument("action", choices=("packet", "review", "finish"))
    parser.add_argument("--pi", type=Path)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--retain-first-transport-failure", action="store_true",
                        help="Keep a first delivered answer even when only prefetch worked; disclose it in the study")
    args = parser.parse_args()
    if args.action == "packet":
        packets(args.retain_first_transport_failure)
    elif args.action == "review":
        review(args.pi, args.workers)
    else:
        finish()
