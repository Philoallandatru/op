import json
import unittest

from trial_timing import phases, tool_wait_seconds


class TrialTimingTest(unittest.TestCase):
    def test_overlapping_tool_wait_is_counted_once(self):
        def result(name, end, duration):
            return json.dumps({"type": "message_end", "message": {
                "role": "toolResult", "toolName": name, "timestamp": end, "durationMs": duration}})

        self.assertEqual(tool_wait_seconds([
            result("spec_search_spec", 600, 400), result("spec_read_spec_page", 750, 250),
            result("spec_read_spec_page", 900, 100), result("bash", 1200, 500), "invalid",
        ]), 0.65)

    def test_direct_signoff_reports_zero_standalone_draft(self):
        self.assertEqual(phases(10, 9, 0, 0.5, 0.25, direct_signoff=True),
                         {"retrieval": 0.75, "draft": 0, "review": 8.75, "other": 0.5})
        self.assertEqual(phases(10, 6, 3, 0.5, 0.25),
                         {"retrieval": 0.75, "draft": 5.75, "review": 3, "other": 0.5})
