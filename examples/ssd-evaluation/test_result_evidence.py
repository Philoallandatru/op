import unittest
from pathlib import Path
from unittest.mock import patch

import evidence_mcp
from evidence_fast_conditions_mcp import find_spec_conditions
from benchmark import ROOT
from retrieval_trial import PageRetriever, page_outcomes


class ResultEvidenceTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = PageRetriever(ROOT)
        cls.addClassCleanup(cls.index.close)

    def test_self_test_type_and_result_are_distinct(self):
        entry = self.index.outcome_passage("nvme", 240, "DSTR Device Self-test Result Controller Level Reset")
        table = entry["value_table"]
        self.assertIn("(DSTR)", table["field"])
        self.assertNotIn("Host-Initiated Refresh operation", entry["passage"])
        body = self.index.read_page("nvme", 240).splitlines()
        rows = {value: "\n".join(body[first - 1:last]) for value, first, last in table["rows"]}
        self.assertEqual(list(rows), ["0h", "1h", "2h", "3h", "4h", "5h", "6h", "7h", "8h", "9h", "Ah to Eh", "Fh"])
        self.assertIn("not complete", rows["5h"])
        self.assertIn("is not known", rows["6h"])
        self.assertIn("Segment Number field", rows["7h"])
        self.assertIn("Reserved", rows["Ah to Eh"])
        self.assertIn("Entry is empty", rows["Fh"])
        self.assertEqual(entry["passage"], "\n".join(body[entry["lines"][0] - 1:entry["lines"][1]]))

    def test_neighboring_command_codes_are_scoped(self):
        entry = self.index.outcome_passage("nvme", 444, "Invalid Queue Deletion associated submission queue")
        self.assertIn("Figure 483", entry["value_table"]["field"])
        self.assertEqual([r[0] for r in entry["value_table"]["rows"]], ["01h", "0Ch"])
        self.assertNotIn("Create I/O Submission Queue", entry["passage"])

    def test_multi_page_table_preserves_local_limits(self):
        data = []
        for page in (167, 168):
            body = self.index.read_page("nvme", page)
            tables = page_outcomes(body, self.index.page_bookmarks("nvme", page, body))["value_tables"]
            data.append(tables[0])
        left, right = data
        self.assertEqual(left["field"], right["field"])
        self.assertEqual(left["rows"][-1][0], "2Dh")
        self.assertTrue(left["check_next_page"])
        self.assertEqual(right["rows"][0][0], "2Eh")
        self.assertTrue(right["check_previous_page"])
        self.assertNotIn("80h", [r[0] for r in right["rows"]])

    def test_non_table_returns_conditional_source_without_generated_disposition(self):
        query = "unmask MSI-X vector Pending bit while masked"
        found = self.index.outcome_passage("pcie", 500, query)
        self.assertIsNone(found["value_table"])
        self.assertTrue(found["condition_lines"])
        self.assertIn("interrupt events are somehow satisfied", found["passage"])
        for body in ("", "No encoding table here.", "Value Description\n0 Not used"):
            self.assertEqual(page_outcomes(body, [])["value_tables"], [])

    def test_vertical_pcie_encoding_retains_only_printed_codes(self):
        body = self.index.read_page("pcie", 154)
        found = page_outcomes(body, self.index.page_bookmarks("pcie", 154, body))
        group = next(g for g in found["value_tables"] if "Table 2-35" in g["field"])
        text = body.splitlines()
        rows = {key: "\n".join(text[first - 1:last]) for key, first, last in group["rows"]}
        self.assertEqual(list(rows), ["000", "001", "010", "100"])
        self.assertIn("Configuration Request Retry Status", rows["010"])
        self.assertIn("Completer Abort", rows["100"])
        self.assertNotIn("111", rows)

    async def test_page_index_reuses_existing_evidence_budget(self):
        with patch.multiple(evidence_mcp, engine=self.index, VIEW="outcomes", MODE="domain",
                            SCOPE="nvme", LIMIT=2, attempts=0, AUDIT=None):
            found = await evidence_mcp.search_spec("nvme", "Device Self-test Result DSTR", 2)
            self.assertTrue(all("value_table" in hit for hit in found["results"]))
            page = await evidence_mcp.read_spec_page("nvme", 240)
            self.assertEqual(page["text"], self.index.read_page("nvme", 240))
            self.assertEqual(len(page["page_outcomes"]["value_tables"]), 2)
            with self.assertRaisesRegex(ValueError, "budget exhausted"):
                await evidence_mcp.read_spec_page("nvme", 240)

    async def test_combined_search_counts_once_and_quotes_original_page_lines(self):
        with patch.multiple(evidence_mcp, engine=self.index, MODE="domain", SCOPE="nvme",
                            LIMIT=1, attempts=0, AUDIT=None):
            result = await find_spec_conditions("nvme", "Software Progress Marker Pre-boot Software Load Count")
            self.assertTrue(result["results"])
            for item in result["results"]:
                start, end = item["lines"]
                lines = self.index.read_page("nvme", item["pdf_page"]).splitlines()
                self.assertEqual(item["text"], "\n".join(lines[start - 1:end]))
            with self.assertRaisesRegex(ValueError, "budget exhausted"):
                await evidence_mcp.read_spec_page("nvme", result["results"][0]["pdf_page"])

    async def test_literal_context_preserves_bit_location_and_action_scope(self):
        with patch.multiple(evidence_mcp, engine=self.index, SCOPE="pcie", LIMIT=2, attempts=0, AUDIT=None):
            dpc = await evidence_mcp.read_spec_context("pcie", 958, "DPC RP Busy")
            match = next(m for m in dpc["matches"] if "DPC RP Busy - When" in m["text"])
            self.assertEqual(match["pdf_page"], 958)
            self.assertIn("\n4\nDPC RP Busy - When", match["text"])
            self.assertIn("behavior is undefined", match["text"])
            slot = await evidence_mcp.read_spec_context("pcie", 748, "Command Completed")
            self.assertEqual(slot["pages_examined"], [748, 747, 749])
            self.assertTrue(any(m["pdf_page"] == 749 and "no guarantee" in m["text"] for m in slot["matches"]))
            with self.assertRaisesRegex(ValueError, "budget exhausted"):
                await evidence_mcp.read_spec_page("pcie", 749)

    async def test_literal_context_reports_an_empty_match_and_does_not_invent_a_page(self):
        with patch.multiple(evidence_mcp, engine=self.index, SCOPE="pcie", LIMIT=0, attempts=0, AUDIT=None):
            result = await evidence_mcp.read_spec_context("pcie", 1, "invalid exact cue")
            self.assertEqual(result["pages_examined"], [1, 2])
            self.assertEqual(result["matches"], [])
            budget = await evidence_mcp.read_spec_context("pcie", 831, "must return all zeros")
            self.assertEqual([m["pdf_page"] for m in budget["matches"]], [830])
            self.assertIn("greater than or equal", budget["matches"][0]["text"])
