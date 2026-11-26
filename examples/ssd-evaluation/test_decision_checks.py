import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import evidence_mcp
from benchmark import ROOT
from decision_checks import doorbell_layout, verification_passages
from evidence_verification_mcp import check_doorbell_layout
from pi_trial import prefetch_pages
from retrieval_trial import PageRetriever


class DecisionChecksTest(unittest.IsolatedAsyncioTestCase):
    def test_formula_passes_while_last_active_cq_slot_does_not_fit(self):
        result = doorbell_layout(0, 2, 255, 255, max_sqid=64, max_cqid=128)
        self.assertEqual(result["printed_condition"], {"bytes": 4096, "fits_in_page": True})
        self.assertEqual(result["figure_486"]["cq_head"]["last_byte"], 8179)
        self.assertEqual(result["proposed_slots"]["sq_tail"]["last_byte"], 2051)
        self.assertTrue(result["proposed_slots"]["sq_tail"]["fits_in_page"])
        self.assertEqual(result["proposed_slots"]["cq_head"]["last_byte"], 4115)
        self.assertFalse(result["proposed_slots"]["cq_head"]["fits_in_page"])

    def test_inclusive_byte_boundaries_and_missing_ids(self):
        result = doorbell_layout(0, 0, 511, 511, max_cqid=511)
        self.assertEqual(result["proposed_slots"]["cq_head"]["last_byte"], 4095)
        self.assertTrue(result["proposed_slots"]["cq_head"]["fits_in_page"])
        self.assertIsNone(result["proposed_slots"]["sq_tail"])
        self.assertFalse(doorbell_layout(0, 0, 511, 511, max_sqid=512)["proposed_slots"]["sq_tail"]["fits_in_page"])
        with self.assertRaisesRegex(ValueError, "cap_dstrd"):
            doorbell_layout(0, 16, 511, 511)

    def test_targeted_prefetch_quotes_required_checks_without_a_second_call(self):
        question = {"protocol": "nvme", "question": "Do fused commands have separate CQEs?"}
        with TemporaryDirectory() as session:
            audit = Path(session) / "calls.jsonl"
            excerpts, used = prefetch_pages(question, "domain", audit, "decision", verified=True)
            event, = [json.loads(line) for line in audit.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(used, 1)
            self.assertIn([121, 4, 14], event["matching_ranges"])
            self.assertIn("A completion queue entry is posted", excerpts)
        with PageRetriever(ROOT) as index:
            quotes = verification_passages(index, "pcie", "Write a Steering Tag with MSI-X")
            self.assertTrue(any(e["pdf_page"] == 789 and "ST Upper" in e["passage"] for e in quotes))
            self.assertEqual(verification_passages(index, "pcie", "Read the Device Status"), [])

    async def test_mcp_geometry_respects_the_shared_budget_and_scope(self):
        with patch.multiple(evidence_mcp, SCOPE="nvme", LIMIT=1, attempts=0, AUDIT=None):
            result = await check_doorbell_layout(0, 2, 255, 255, 64, 128)
            self.assertEqual(result["pdf_pages"], (445, 446))
            self.assertFalse(result["proposed_slots"]["cq_head"]["fits_in_page"])
            with self.assertRaisesRegex(ValueError, "budget exhausted"):
                await check_doorbell_layout(0, 2, 255, 255, 64, 128)
        with patch.multiple(evidence_mcp, SCOPE="pcie", LIMIT=1, attempts=0, AUDIT=None):
            with self.assertRaisesRegex(ValueError, "restricted to pcie"):
                await check_doorbell_layout(0, 2, 255, 63)
