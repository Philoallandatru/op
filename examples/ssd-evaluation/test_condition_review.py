import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import evidence_mcp
from condition_review import condition_excerpts, format_conditions
from evidence_conditions_mcp import read_spec_conditions
from retrieval_trial import PageRetriever


class ConditionReviewTests(unittest.IsolatedAsyncioTestCase):
    def test_final_output_preserves_all_distinct_condition_rows(self):
        reply = {"decision": "暂停", "conditions": ["目标仍忙", "已完成才允许恢复"], "next_check": ""}
        self.assertIn("- 目标仍忙\n- 已完成才允许恢复", format_conditions(json.dumps(reply)))
        self.assertEqual(format_conditions(json.dumps({**reply, "conditions": []})), "")

    def test_packet_preserves_later_hits_and_whole_prefetch_passages(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "events.jsonl"
            response = {"spec": "PCI Express v5", "results": [
                {"pdf_page": 730, "passage": "a" * 3200},
                {"pdf_page": 732, "passage": "timed out or completed"}]}
            event = {"type": "message_end", "message": {"role": "toolResult", "toolName": "spec_search_spec",
                     "content": [{"text": json.dumps(response)}]}}
            path.write_text(json.dumps(event), encoding="utf-8")
            output = condition_excerpts(path, 'PCIE PDF p.799\n{"passage":"Cleared on entry to state DL_Inactive"}', 1024)
            self.assertIn("PCIe PDF p.732\ntimed out or completed", output)
            self.assertIn("PCIe PDF p.799\nCleared on entry to state DL_Inactive", output)
            self.assertNotIn("a" * 40, output)

    async def test_field_read_preserves_reset_and_timeout_after_page_break(self):
        with PageRetriever(evidence_mcp.ROOT) as index:
            with patch.multiple(evidence_mcp, engine=index, SCOPE="pcie", LIMIT=1, attempts=0, AUDIT=None):
                response = await read_spec_conditions("pcie", "Transactions Pending", 731)
                snippets = [m["text"] for m in response["matches"] if m["pdf_page"] == 732]
                self.assertTrue(any("terminated by the Completion Timeout" in s and "completion of an FLR" in s for s in snippets))
                with self.assertRaisesRegex(ValueError, "budget exhausted"):
                    await read_spec_conditions("pcie", "Transactions Pending", 731)
