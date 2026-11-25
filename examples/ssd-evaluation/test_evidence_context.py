import unittest
from pathlib import Path
from unittest.mock import patch

import evidence_mcp
from benchmark import ROOT
from retrieval_trial import PageRetriever, locate_passage


class SpecEvidenceTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = PageRetriever(ROOT)
        cls.addClassCleanup(cls.index.close)

    def passage(self, protocol, page, query):
        result = self.index.scoped_passage(protocol, page, query)
        lines = self.index.read_page(protocol, page).splitlines()
        first, last = result["lines"]
        self.assertEqual(result["passage"], "\n".join(lines[first - 1:last]))
        self.assertLessEqual(len(result["passage"]), 1000)
        return result

    def test_doorbell_tables_keep_their_own_offset_origin(self):
        shadow = self.passage("nvme", 445, "Shadow Doorbell Buffer admin tail offset 00h")
        self.assertIn("5.2.5 Doorbell Buffer Config", shadow["preceding_section"]["title"])
        self.assertIn("Figure 486", shadow["preceding_caption"]["text"])
        self.assertIn("(Offset in Buffer)", shadow["passage"])
        self.assertEqual(shadow["adjacent_pages_at_excerpt_edge"], [446])
        mmio = self.passage("nvme", 73, "PCIe doorbell registers 1000h CAP.DSTRD")
        self.assertIn("Figure 34: Memory-Based", mmio["passage"])
        self.assertIn("1000h + ((2y)", mmio["passage"])
        self.assertNotIn("Message-Based", mmio["passage"])

    def test_shutdown_scope_and_procedure_branch(self):
        normal = self.passage("nvme", 133, "normal controller shutdown delete submission queue")
        self.assertIn("normal controller shutdown", normal["preceding_list_intro"]["text"])
        self.assertNotIn("abrupt shutdown", normal["passage"])
        subsystem = self.passage("nvme", 136, "CAP.NSSES bit to 0")
        self.assertEqual(subsystem["preceding_section"],
                         {"title": "3.6.3 NVM Subsystem Shutdown", "pdf_page": 135})
        self.assertIn("If a controller clears the CAP.NSSES bit", subsystem["passage"])

    def test_same_page_two_pcie_states(self):
        result = self.passage("pcie", 464, "L1 ASPM State L1 exit latency")
        self.assertEqual(result["preceding_section"]["title"], "5.4.1.2 L1 ASPM State")
        self.assertIn("optionally support", result["passage"])
        self.assertNotIn("L0s", result["passage"])

    def test_blank_and_unlocated_bookmark(self):
        self.assertIsNone(locate_passage("", "", "", [])["lines"])
        result = locate_passage("page body", "", "", [
            {"title": "Heading with no matching line", "pdf_page": 2, "unlocated": True}])
        self.assertNotIn("preceding_section", result)
        self.assertEqual(result["unlocated_page_bookmarks"], ["Heading with no matching line"])

    async def test_classic_wire_results_and_candidate_budget(self):
        protocol, query = "nvme", "CAP.NSSES NVM Subsystem Shutdown"
        hits = self.index.search(protocol, query, "domain", k=2)
        with patch.multiple(evidence_mcp, engine=self.index, VIEW="classic", MODE="domain",
                            SCOPE="both", LIMIT=2, attempts=0, AUDIT=None):
            search = await evidence_mcp.search_spec(protocol, query, 2)
            self.assertEqual(search["results"], [
                {**hit, "passage": self.index.preview(protocol, hit["pdf_page"], query)}
                for hit in hits])
            read = await evidence_mcp.read_spec_page(protocol, 136)
            self.assertEqual(read, {"spec": evidence_mcp.SPEC[protocol], "pdf_page": 136,
                                    "text": self.index.read_page(protocol, 136)})
        with patch.multiple(evidence_mcp, engine=self.index, VIEW="bounded", MODE="domain",
                            SCOPE="both", LIMIT=2, attempts=0, AUDIT=None):
            search = await evidence_mcp.search_spec(protocol, query, 2)
            self.assertEqual([r["pdf_page"] for r in search["results"]], [h["pdf_page"] for h in hits])
            self.assertTrue(all(r["lines"] for r in search["results"]))
            read = await evidence_mcp.read_spec_page(protocol, 136)
            self.assertEqual(read["text"], self.index.read_page(protocol, 136))
            self.assertTrue(read["section_bookmarks"])
            with self.assertRaisesRegex(ValueError, "budget exhausted"):
                await evidence_mcp.read_spec_page(protocol, 137)


if __name__ == "__main__":
    unittest.main()
