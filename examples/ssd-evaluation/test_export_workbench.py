import json
from pathlib import Path
import unittest
from tempfile import TemporaryDirectory

from export_workbench import build
from scenario_eval import blind, load_lines


class WorkbenchExportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        directory = Path(__file__).resolve().parent / "scenarios"
        self.cases = load_lines(directory / "startup.jsonl")[:2]
        self.review = dict(
            blind(self.cases[0]),
            answer="Wait and recheck PCIe configuration access.",
            completed=True,
            criteria={"C1": 1, "C2": 1, "C3": 1, "C4": 0.5},
            reject_hits=[],
            usability="ready",
            reason="Uses the observed PCIe enumeration milestone.",
        )
        self.plan = [blind(item) for item in self.cases]
        self.rows("plan.jsonl", self.plan)
        self.rows("reviews.jsonl", [])
        self.runs = self.root / "runs"
        self.runs.mkdir()
        self.config = {"id": "one", "label": "MCP", "config": "Evidence", "plan": "plan.jsonl",
                       "runs": "runs", "reviews": "reviews.jsonl"}

    def rows(self, name, rows):
        (self.root / name).write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")

    def report(self, *configs):
        manifest = self.root / "manifest.json"
        manifest.write_text(json.dumps({"title": "Workbench", "rounds": configs or [self.config]}), encoding="utf-8")
        return build(manifest)

    def run_record(self, row, answer):
        directory = self.runs / (row["id"] + "-" + str(row.get("form", 0)))
        directory.mkdir()
        result = dict(row, answer=answer, attempts=2, seconds=12)
        (directory / "result.json").write_text(json.dumps(result), encoding="utf-8")

    def test_empty_run_slots_and_completed_unreviewed_remain_distinct(self):
        self.run_record(self.plan[0], "Completed answer")
        audit = self.runs / (self.plan[0]["id"] + "-0") / "calls.jsonl"
        self.rows(audit, [{"tool": "search_spec", "status": "ok", "protocol": "pcie", "pages": [1]},
                          {"tool": "read_spec_page", "status": "ok", "protocol": "pcie", "pdf_page": 2}])
        report = self.report()
        records = report["rounds"][0]["results"]
        self.assertEqual(report["blindContext"], {"spec": self.plan[0]["spec"], "protocol": self.plan[0]["protocol"],
                                                  "observationHeading": "现场观测"})
        self.assertEqual([p["page"] for p in records[0]["readPages"]], [2])
        self.assertEqual([r["status"] for r in records], ["completed", "pending"])
        self.assertEqual([r["review"] for r in records], [None, None])
        self.assertEqual(records[0]["toolCalls"], 2)
        self.assertIsNone(records[1]["seconds"])

    def test_question_bank_can_be_previewed_before_running_it(self):
        planned = {key: value for key, value in self.config.items() if key not in ("runs", "reviews")}
        report = self.report(planned)
        rows = report["rounds"][0]["results"]
        self.assertEqual([row["status"] for row in rows], ["pending", "pending"])

    def test_local_bank_exports_reviewed_attempts_without_the_source_reference(self):
        bank = Path(__file__).resolve().parent / "scenarios/field-engineering-v16.jsonl"
        case = dict(load_lines(bank)[0], id="LOCAL-1", origin="field", source_ref="PRIVATE-REFERENCE")
        self.rows("local-bank.jsonl", [case])
        plan = blind(case)
        self.rows("local-plan.jsonl", [plan])
        self.run_record(plan, "Use the original record.")
        self.rows("reviews.jsonl", [dict(self.review, id=case["id"], question=plan["question"],
                                       answer="Use the original record.", criteria={"C1": 1, "C2": 1, "C3": 1})])
        manifest = self.root / "manifest.json"
        manifest.write_text(json.dumps({"title": "Local study", "caseBank": "local-bank.jsonl",
                                        "rounds": [dict(self.config, plan="local-plan.jsonl")]}), encoding="utf-8")
        report = build(manifest)
        self.assertNotIn(case["source_ref"], json.dumps(report))
        result = report["rounds"][0]["results"][0]
        self.assertEqual((result["caseId"], result["seconds"], result["review"]["usability"]),
                         ("LOCAL-1", 12, "ready"))

    def test_bundled_report_matches_reviewed_archive(self):
        kit = Path(__file__).resolve().parent
        manifest = kit / "studies/field-usable-v16/workbench-manifest.json"
        bundled = kit.parents[1] / "packages/app/src/components/evaluations/ssd-example-report.json"
        self.assertEqual(json.loads(bundled.read_text(encoding="utf-8")), build(manifest))
        for round_name in ("field-usable-v3", "field-usable-v4", "field-usable-v5", "field-usable-v6", "field-usable-v7",
                           "field-usable-v8", "field-usable-v9", "field-usable-v10", "field-usable-v11",
                           "field-usable-v12", "field-usable-v13", "field-usable-v14", "field-usable-v15"):
            previous = kit / f"reports/{round_name}.json"
            self.assertEqual(json.loads(previous.read_text(encoding="utf-8")),
                             build(kit / f"studies/{round_name}/workbench-manifest.json"))

    def test_doorbell_report_matches_reviewed_replays(self):
        kit = Path(__file__).resolve().parent
        report = kit / "reports/doorbell-scope-regression.json"
        manifest = kit / "studies/doorbell-scope/workbench-manifest.json"
        self.assertEqual(json.loads(report.read_text(encoding="utf-8")), build(manifest))

    def test_archived_scores_and_different_planned_denominators(self):
        self.run_record(self.plan[0], self.review["answer"])
        self.rows("reviews.jsonl", [self.review])
        r2 = {"id": "two", "label": "Retest", "config": "Retest", "caseIds": [self.cases[0]["id"]],
              "reviews": "reviews.jsonl"}
        result = self.report(self.config, r2)
        self.assertEqual([len(r["results"]) for r in result["rounds"]], [2, 1])
        self.assertEqual(result["rounds"][1]["results"][0]["review"]["score"], 90)
        self.assertEqual(result["rounds"][0]["results"][0]["review"]["usability"], "ready")

    def test_mismatched_answers_questions_and_unplanned_records_are_rejected(self):
        self.run_record(self.plan[0], "Answer from a different trial")
        self.rows("reviews.jsonl", [self.review])
        with self.assertRaisesRegex(ValueError, "different answer"):
            self.report()
        self.rows("reviews.jsonl", [])
        self.rows("plan.jsonl", [dict(self.plan[0], question="Altered prompt")])
        with self.assertRaisesRegex(ValueError, "blind plan differs"):
            self.report()
        self.rows("plan.jsonl", self.plan[1:])
        with self.assertRaisesRegex(ValueError, "unplanned"):
            self.report()

    def test_distinct_followup_forms_keep_their_own_questions_and_grade(self):
        data = Path(__file__).resolve().parent / "scenarios" / "data-integrity.jsonl"
        item = next(r for r in load_lines(data) if r.get("followup"))
        first, second = blind(item), blind(item, 2)
        self.rows("plan.jsonl", [first, second])
        self.run_record(second, "Updated decision")
        self.rows("reviews.jsonl", [{"id": item["id"], "branch": 2, "completed": True,
              "criteria": {"update": 1}, "reject_hits": [], "usability": "ready", "reason": "Updated decision"}])
        report = self.report()
        self.assertEqual([c["id"] for c in report["cases"]], [item["id"], item["id"] + ":branch-2"])
        followup = report["cases"][1]
        self.assertEqual(followup["blindFollowup"]["question"], second["question"])
        self.assertEqual(followup["observations"][-1], item["followup"]["branches"][1]["observation"])
        self.assertEqual(report["rounds"][0]["results"][1]["review"]["score"], 100)


if __name__ == "__main__":
    unittest.main()
