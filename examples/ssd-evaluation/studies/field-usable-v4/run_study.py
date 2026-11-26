import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


ROUND = int(os.environ.get("SSD_STUDY_ROUND", "4"))
STUDY = Path(__file__).resolve().parent.with_name(f"field-usable-v{ROUND}")
KIT = STUDY.parents[1]
sys.path.insert(0, str(KIT))

from benchmark import PCIE, ROOT
from scenario_eval import blind, load_lines, validate, validate_design


LIVE_BANK = KIT / f"scenarios/field-engineering-v{ROUND}.jsonl"
FROZEN_BANK = STUDY / "bank-as-tested.jsonl"
BANK = FROZEN_BANK if FROZEN_BANK.is_file() else LIVE_BANK
WORK = KIT / f".local/field-usable-v{ROUND}"
ARMS = {"baseline": "decision" if ROUND >= 6 else "outcomes", "candidate": "decision"}
SKILLS = ({"baseline": "closure", "candidate": "timeline"} if ROUND == 6 else
          {**ARMS, **({"candidate": "closure"} if ROUND == 5 else {})})
STYLES = ({"baseline": "scoped", "candidate": "timeline"} if ROUND == 6 else
          {"baseline": "decision-audit", "candidate": "scoped" if ROUND == 5 else "decision-audit"})
if ROUND == 7:
    SKILLS = {"baseline": "timeline", "candidate": "conditions"}
    STYLES = {"baseline": "timeline", "candidate": "conditions"}
if ROUND == 8:
    SKILLS = {"baseline": "conditions", "candidate": "fast-conditions"}
    STYLES = SKILLS.copy()
if ROUND == 9:
    SKILLS = {"baseline": "fast-conditions", "candidate": "verified-conditions"}
    STYLES = SKILLS.copy()
if ROUND == 10:
    SKILLS = {"baseline": "verified-conditions", "candidate": "acceptance"}
    STYLES = SKILLS.copy()
if ROUND == 11:
    SKILLS = {"baseline": "verified-conditions", "candidate": "acceptance-approval"}
    STYLES = {"baseline": "verified-conditions", "candidate": "acceptance"}
if ROUND == 12:
    SKILLS = {"baseline": "verified-conditions", "candidate": "concise-acceptance"}
    STYLES = SKILLS.copy()
if ROUND == 13:
    SKILLS = {"baseline": "verified-conditions", "candidate": "concise-verified"}
    STYLES = {"baseline": "verified-conditions", "candidate": "concise-acceptance"}
if ROUND == 14:
    SKILLS = {"baseline": "verified-conditions", "candidate": "concise-fieldproof"}
    STYLES = {"baseline": "verified-conditions", "candidate": "concise-acceptance"}
if ROUND == 15:
    SKILLS = {"baseline": "verified-conditions", "candidate": "concise-records"}
    STYLES = {"baseline": "verified-conditions", "candidate": "field-acceptance"}
if ROUND == 16:
    SKILLS = {"baseline": "verified-conditions", "candidate": "concise-witnesses"}
    STYLES = {"baseline": "verified-conditions", "candidate": "field-acceptance"}
BUDGET = {"provider": "magpie", "model": "auto/deepseek-v4.1-flash", "mode": "domain",
          "calls": 8, "timeout": 120}
FILES = ["pi_trial.py", "retrieval_trial.py", "evidence_mcp.py",
         *(["evidence_timeline_mcp.py", "handoff_review.py"] if ROUND >= 6 else []),
         *(["evidence_conditions_mcp.py", "condition_review.py"] if ROUND >= 7 else []),
         *(["evidence_fast_conditions_mcp.py", "trial_timing.py"] if ROUND >= 8 else []),
         *(["decision_checks.py", "evidence_verification_mcp.py"] if ROUND >= 9 else []),
         *(["acceptance_review.py", "studies/field-usable-v4/review_study.py"] if ROUND >= 10 else []),
         *(["concise_review.py"] if ROUND >= 12 else []),
         *(["field_evidence.py"] if ROUND >= 15 else []),
         *[f"skills/{skill}/ssd-field-decisions/SKILL.md" for skill in SKILLS.values()]]
ORDER_SEED = f"ssd-field-usable-v{ROUND}-paired"
CASE_COUNT = {4: 12, 5: 8, 6: 16, 7: 16, 8: 16, 9: 16, 10: 16, 11: 12, 12: 16, 13: 16, 14: 16, 15: 16, 16: 16}[ROUND]
REVIEW_MODEL = "codex/gpt-6.2-sol" if ROUND >= 6 else None


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def matches_text(path, expected):
    raw = path.read_bytes()
    lf = raw.replace(b"\r\n", b"\n")
    return any(hashlib.sha256(text).hexdigest() == expected for text in (raw, lf, lf.replace(b"\n", b"\r\n")))


def json_file(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def jsonl_file(path, records):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        for row in records:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def freeze(config_freeze):
    code = {p: digest(KIT / p) for p in FILES}
    if code != {r["path"]: r["sha256"] for r in load(config_freeze)}:
        raise ValueError("The code differs from the pre-question configuration freeze")
    bank = load_lines(BANK)
    previous = [r for p in LIVE_BANK.parent.glob("*.jsonl") if p != LIVE_BANK for r in load_lines(p)]
    old_families = {r["family"] for r in previous}
    if (len(bank) != CASE_COUNT or len({r["family"] for r in bank}) != len(bank)
            or old_families & {r["family"] for r in bank}
            or {r["id"] for r in previous} & {r["id"] for r in bank}):
        raise ValueError("Holdout families and IDs must differ from older questions")
    for case in bank:
        validate_design(case)
    nvme = ROOT / ".kb_index/spec_eval/nvme-official-full.pdf"
    validation = validate(bank, nvme)
    order = sorted(bank, key=lambda r: hashlib.sha256((ORDER_SEED + r["id"]).encode()).digest())
    WORK.mkdir(parents=True, exist_ok=False)
    jsonl_file(STUDY / "questions.jsonl", (blind(case) for case in order))
    json_file(STUDY / "registration.json", {
        "questions_sha256": digest(STUDY / "questions.jsonl"), "bank_sha256": digest(BANK),
        "code": code, "source_pdfs": {"nvme": digest(nvme), "pcie": digest(ROOT / PCIE)},
        "validation": validation, "old_case_count": len(previous), "old_family_count": len(old_families),
        "evaluation_slices": dict(Counter(r.get("evaluation_slice", "unspecified") for r in bank)),
        "order_seed": ORDER_SEED, "baseline_first_ids": [r["id"] for r in order[:CASE_COUNT // 2]],
        "configuration": BUDGET, "prefetch": True, "thinking": "off", "arms": ARMS, "styles": STYLES, "skills": SKILLS,
        "candidate_review_model": REVIEW_MODEL,
        **({"baseline_review_model": REVIEW_MODEL,
            "timing": "Median of completed responses. Retrieval is prefetch plus concurrent Pi evidence waits counted once. Draft is the standalone drafting stage. Sign-off includes generation for the direct path. Both model-stage timings exclude evidence-tool wait."}
           if ROUND >= 8 else {}),
        "grading": load(STUDY / "review-protocol.json"),
        "metrics": ["ready/planned", "misleading/completed", "misleading/planned", "misleading on both-completed pairs"]})


def run(pi, adapter, workers):
    registration = load(STUDY / "registration.json")
    question_file = STUDY / "questions.jsonl"
    files = {p: KIT / p for p in FILES}
    if ROUND in {4, 5, 6, 7, 8, 9} and not matches_text(files["pi_trial.py"], registration["code"]["pi_trial.py"]):
        files["pi_trial.py"] = KIT / f"pi_trial_v{ROUND}.py"
    if ROUND in {10, 11} and not matches_text(files["pi_trial.py"], registration["code"]["pi_trial.py"]):
        files["pi_trial.py"] = KIT / "pi_trial_v11.py"
    if ROUND in {12, 13, 14} and not matches_text(files["pi_trial.py"], registration["code"]["pi_trial.py"]):
        files["pi_trial.py"] = KIT / "pi_trial_v14.py"
    if ROUND in {15, 16} and not matches_text(files["field_evidence.py"], registration["code"]["field_evidence.py"]):
        files["field_evidence.py"] = KIT / "field_evidence_v16.py"
    if ROUND == 6 and not matches_text(files["handoff_review.py"], registration["code"]["handoff_review.py"]):
        files["handoff_review.py"] = KIT / "handoff_review_v6.py"
    if (set(registration["code"]) != set(FILES)
            or any(not matches_text(files[p], registration["code"][p]) for p in FILES)
            or not matches_text(BANK, registration["bank_sha256"])
            or not matches_text(question_file, registration["questions_sha256"])):
        raise ValueError("A frozen run input changed")
    first = set(registration["baseline_first_ids"])
    schedule = [("baseline" if r["id"] in first else "candidate", r["id"]) for r in load_lines(question_file)]
    if ROUND >= 9:
        half = CASE_COUNT // 2
        schedule = [item for pair in zip(schedule[:half], schedule[half:]) for item in pair]
    for arm in ARMS:
        (WORK / "jobs" / arm).mkdir(parents=True, exist_ok=True)

    runner = files["pi_trial.py"]
    launcher = [sys.executable, "-X", "utf8", str(runner)]
    snapshots = {"handoff_review": "handoff_review_v6", "field_evidence": "field_evidence_v16"}
    imports = {name: snapshot for name, snapshot in snapshots.items()
               if f"{name}.py" in files and files[f"{name}.py"].stem == snapshot}
    if imports:
        launcher = [sys.executable, "-X", "utf8", "-c",
                    "import json,runpy,sys; from pathlib import Path; sys.argv.pop(0); "
                    "imports=json.loads(sys.argv.pop(0)); sys.path.insert(0, str(Path(sys.argv[0]).parent)); "
                    "sys.modules.update({name:__import__(snapshot) for name,snapshot in imports.items()}); "
                    "runpy.run_path(sys.argv[0], run_name='__main__')", json.dumps(imports), str(runner)]

    def job(item):
        arm, case_id = item
        view = ARMS[arm]
        command = [*launcher,
                   "--input", str(question_file), "--id", case_id, "--output", str(WORK / "runs" / arm),
                   "--pi-entry", str(pi), "--adapter", str(adapter), "--prefetch", "--evidence-view", view,
                   "--answer-style", STYLES[arm], "--skill", str(KIT / f"skills/{SKILLS[arm]}/ssd-field-decisions/SKILL.md")]
        for option, value in BUDGET.items():
            command.extend([f"--{option}", str(value)])
        if REVIEW_MODEL and STYLES[arm] in {"timeline", "conditions", "fast-conditions", "verified-conditions", "acceptance", "concise-acceptance", "field-acceptance"}:
            command.extend(["--review-model", REVIEW_MODEL])
        with (WORK / "jobs" / arm / f"{case_id}.log").open("xb") as stream:
            subprocess.run(command, check=True, stdout=stream, stderr=subprocess.STDOUT)
        print(arm, case_id, flush=True)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(job, schedule))
        list(pool.map(job, (("candidate" if a == "baseline" else "baseline", c) for a, c in schedule)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Freeze and run a paired SSD field study")
    parser.add_argument("action", choices=("freeze", "run"))
    parser.add_argument("--config-freeze", type=Path)
    parser.add_argument("--pi", type=Path, default=Path(os.environ.get("APPDATA", Path.home())) /
                        "npm/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js")
    parser.add_argument("--adapter", type=Path, default=Path.home() / ".pi/agent/npm/node_modules/pi-mcp-adapter/index.ts")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    freeze(args.config_freeze) if args.action == "freeze" else run(args.pi, args.adapter, args.workers)
