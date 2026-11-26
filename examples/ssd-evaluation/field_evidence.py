import re

from concise_review import concise_passages


NVME_WINDOWS = (
    (r"\b(?:IDLP|IPS)\b", 352, 13, 27),
    (r"\b(?:DNR|Do Not Retry)\b", 162, 7, 14),
    (r"\bFlush\b", 485, 22, 33),
)


def field_passages(index, protocol, question):
    passages = []
    if protocol == "nvme":
        for term, page, first, last in NVME_WINDOWS:
            if re.search(term, question, re.IGNORECASE):
                text = index.read_page(protocol, page)
                passages.append({"pdf_page": page, "lines": [first, last],
                                 "passage": "\n".join(text.splitlines()[first - 1:last])})
    return passages or concise_passages(index, protocol, question)
