import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import evidence_mcp
from evidence_timeline_mcp import read_spec_transition
from handoff_review import format_handoff, original_excerpts
from retrieval_trial import PageRetriever


class HandoffTests(unittest.IsolatedAsyncioTestCase):
    def test_formats_only_a_complete_decision_with_evidence(self):
        self.assertEqual(format_handoff('{"decision":"等一条完成", "evidence":"当前在途已满", "next_check":""}'),
                         "**处置** 等一条完成\n\n**依据** 当前在途已满")
        self.assertEqual(format_handoff('{"decision":"可以登记", "evidence":"", "next_check":""}'), "")
        self.assertEqual(format_handoff('把草稿直接交给用户'), "")

    def test_revision_receives_original_tool_text_without_assistant_guesses(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "events.jsonl"
            rows = [
                {"role": "assistant", "content": [{"text": "unverified claim"}]},
                {"role": "toolResult", "isError": True, "content": [{"text": "failed read"}]},
                {"role": "toolResult", "content": [{"text": "original clause"}]},
            ]
            path.write_text("\n".join(json.dumps({"type": "message_end", "message": row}) for row in rows), encoding="utf-8")
            self.assertEqual(original_excerpts(path, "original prefetch"), "original clause\n\noriginal prefetch")

    async def test_transition_keeps_trigger_and_state_as_original_evidence(self):
        with PageRetriever(evidence_mcp.ROOT) as index:
            with patch.multiple(evidence_mcp, engine=index, SCOPE="nvme", LIMIT=1, attempts=0, AUDIT=None):
                response = await read_spec_transition("nvme", 406, "Upon successful completion of this command", "Non Deterministic Window")
                self.assertTrue(any(m["pdf_page"] == 406 and "Upon successful completion" in m["text"] for m in response["matches"]["trigger"]))
                self.assertTrue(any(m["pdf_page"] == 406 and "Deterministic Window" in m["text"] for m in response["matches"]["state"]))
                with self.assertRaisesRegex(ValueError, "budget exhausted"):
                    await read_spec_transition("nvme", 406, "successful completion", "non deterministic")
