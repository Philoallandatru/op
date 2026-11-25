"""Read-only specification evidence server for retrieval and Pi experiments."""
import os
import json
from contextlib import contextmanager
from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP

from benchmark import ROOT
from retrieval_trial import PageRetriever, page_outcomes

Protocol = Literal["nvme", "pcie"]
SPEC = {"nvme": "NVM Express Base Specification, Revision 2.1",
        "pcie": "PCI Express Base Specification, Revision 5.0 Version 1.0"}
MODE = os.getenv("SPEC_EVAL_MODE", "domain")
VIEW = os.getenv("SPEC_EVAL_EVIDENCE_VIEW", "classic")
if VIEW not in {"classic", "bounded", "outcomes"}:
    raise ValueError("SPEC_EVAL_EVIDENCE_VIEW must be classic, bounded or outcomes")
SCOPE = os.getenv("SPEC_EVAL_PROTOCOL", "both")
LIMIT = int(os.getenv("SPEC_EVAL_CALL_LIMIT", "0"))
AUDIT = os.getenv("SPEC_EVAL_AUDIT")
mcp = FastMCP("spec-evidence")
engine = None
attempts = 0


@contextmanager
def request(tool, protocol, **fields):
    global attempts
    attempts += 1
    event = {"attempt": attempts, "tool": tool, "protocol": protocol, **fields}
    try:
        if LIMIT and attempts > LIMIT:
            raise ValueError("Evidence call budget exhausted; answer from evidence already returned")
        yield event
        event["status"] = "ok"
    except Exception as error:
        event["status"] = "error"
        event["error"] = str(error)
        raise
    finally:
        if AUDIT:
            with Path(AUDIT).open("a", encoding="utf-8") as out:
                out.write(json.dumps(event, ensure_ascii=False) + "\n")


def retriever(protocol):
    global engine
    if SCOPE not in ("both", protocol):
        raise ValueError(f"This session is restricted to {SCOPE}")
    if engine is None:
        engine = PageRetriever(ROOT)
    return engine


@mcp.tool()
async def search_spec(protocol: Protocol, query: str, top_k: int = 3) -> dict:
    """Search NVMe Base 2.1 or PCIe Base 5.0 v1.0. Returns original passages with 1-based PDF file page numbers."""
    with request("search_spec", protocol, query=query) as event:
        if not query.strip() or len(query) > 1200 or not 1 <= top_k <= 5:
            raise ValueError("Provide a nonempty query under 1201 characters and top_k in 1..5")
        index = retriever(protocol)
        hits = index.search(protocol, query, MODE, k=top_k)
        if VIEW in {"bounded", "outcomes"}:
            passage = index.outcome_passage if VIEW == "outcomes" else index.scoped_passage
            results = [{**hit, **passage(protocol, hit["pdf_page"], query)} for hit in hits]
            event["passage_lines"] = [r["lines"] for r in results]
        else:
            results = [{**hit, "passage": index.preview(protocol, hit["pdf_page"], query)} for hit in hits]
        event["pages"] = [h["pdf_page"] for h in hits]
        response = {"spec": SPEC[protocol], "results": results}
        if VIEW == "outcomes":
            response["coverage"] = "Value-table rows are [encoding, first line, last line] on one PDF page. Check the field and original definitions before grouping outcomes. Unlisted codes or observations have no implied disposition."
        return response


@mcp.tool()
async def read_spec_page(protocol: Protocol, pdf_page: int) -> dict:
    """Read the full original text of a 1-based PDF page, including continuation pages and tables."""
    with request("read_spec_page", protocol, pdf_page=pdf_page):
        index = retriever(protocol)
        body = index.read_page(protocol, pdf_page)
        result = {"spec": SPEC[protocol], "pdf_page": pdf_page, "text": body}
        if VIEW in {"bounded", "outcomes"}:
            result["section_bookmarks"] = index.page_bookmarks(protocol, pdf_page, body)
        if VIEW == "outcomes":
            result["page_outcomes"] = page_outcomes(body, result["section_bookmarks"])
            result["coverage"] = "Original text above; 1-based inclusive line numbers. Each row is [encoding, first line, last line]. This page-local index recognizes some layouts only. At page boundaries inspect adjacent pages. Unlisted outcomes do not imply a default action."
        return result


if __name__ == "__main__":
    try:
        mcp.run(transport="stdio")
    finally:
        if engine:
            engine.close()
