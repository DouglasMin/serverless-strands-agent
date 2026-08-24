import json
import queue

from office_tools import (
    create_excel_spreadsheet,
    create_powerpoint_presentation,
    create_word_document,
    reset_document_queue,
    set_document_queue,
)


def test_create_excel_spreadsheet_json():
    q: queue.Queue = queue.Queue()
    token = set_document_queue(q)
    try:
        sheets_json = json.dumps([
            {
                "name": "Q3 Revenue",
                "title": "Quarterly Revenue Summary",
                "headers": ["Quarter", "Product A", "Product B", "Total"],
                "rows": [
                    ["Q1 2026", 10000, 5000, "=B4+C4"],
                    ["Q2 2026", 12000, 6000, "=B5+C5"],
                ],
                "summary_row": ["Total", "=SUM(B4:B5)", "=SUM(C4:C5)", "=SUM(D4:D5)"],
            }
        ])

        res_str = create_excel_spreadsheet("Financial_Report.xlsx", sheets_json=sheets_json)
        res = json.loads(res_str)

        assert res["status"] == "success"
        assert res["filename"] == "Financial_Report.xlsx"
        assert res["file_type"] == "excel"
        assert res["sheets_count"] == 1
        assert res["size_bytes"] > 100

        # Check queued event
        assert not q.empty()
        event = q.get_nowait()
        assert event["filename"] == "Financial_Report.xlsx"
        assert event["file_type"] == "excel"
        assert event["data_uri"].startswith("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,")
    finally:
        reset_document_queue(token)


def test_create_excel_spreadsheet_markdown():
    q: queue.Queue = queue.Queue()
    token = set_document_queue(q)
    try:
        md_tables = """
## Regional Sales
| Region | Q1 Units | Q2 Units | Total Revenue |
| :--- | :--- | :--- | :--- |
| North America | 45000 | 52000 | $12,500,000 |
| Europe | 38000 | 41000 | $9,800,000 |
| Asia Pacific | 62000 | 71000 | $16,400,000 |
| Total | 145000 | 164000 | $38,700,000 |
"""
        res_str = create_excel_spreadsheet("Sales_Model.xlsx", content=md_tables)
        res = json.loads(res_str)

        assert res["status"] == "success"
        assert res["filename"] == "Sales_Model.xlsx"
        assert res["file_type"] == "excel"
        assert res["sheets_count"] == 1
        assert res["size_bytes"] > 100

        assert not q.empty()
        event = q.get_nowait()
        assert event["filename"] == "Sales_Model.xlsx"
    finally:
        reset_document_queue(token)


def test_create_word_document():
    q: queue.Queue = queue.Queue()
    token = set_document_queue(q)
    try:
        sections_json = json.dumps([
            {"type": "subtitle", "text": "Confidential Architecture Review"},
            {"type": "heading_1", "text": "1. Overview"},
            {"type": "paragraph", "text": "This report details our serverless agent stack."},
            {"type": "bullet_list", "items": ["Item A", "Item B"]},
            {
                "type": "table",
                "headers": ["Layer", "Technology"],
                "rows": [["Runtime", "AgentCore"], ["Model", "Claude 3.7"]],
            },
            {"type": "callout", "text": "Security note: Token Vault enabled."},
        ])

        res_str = create_word_document("Architecture_Review.docx", "Architecture Review", sections_json=sections_json)
        res = json.loads(res_str)

        assert res["status"] == "success"
        assert res["filename"] == "Architecture_Review.docx"
        assert res["file_type"] == "word"
        assert res["size_bytes"] > 100

        # Check queued event
        assert not q.empty()
        event = q.get_nowait()
        assert event["filename"] == "Architecture_Review.docx"
        assert event["file_type"] == "word"
        assert event["data_uri"].startswith("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,")
    finally:
        reset_document_queue(token)


def test_create_word_document_markdown():
    q: queue.Queue = queue.Queue()
    token = set_document_queue(q)
    try:
        md_text = """
# Executive AI Strategy
> Confidential Board Memo

## 1. Key Highlights
- **99.9%** availability across multi-runtime nodes
- Integrated AgentCore Identity 3LO

| Metric | Target | Status |
| :--- | :--- | :--- |
| Latency | <200ms | Met |
| Cost | -70% | Exceeded |
"""
        res_str = create_word_document("AI_Strategy.docx", "AI Strategy", content=md_text)
        res = json.loads(res_str)

        assert res["status"] == "success"
        assert res["filename"] == "AI_Strategy.docx"
        assert res["file_type"] == "word"
        assert res["size_bytes"] > 100
    finally:
        reset_document_queue(token)


def test_create_powerpoint_presentation_json():
    q: queue.Queue = queue.Queue()
    token = set_document_queue(q)
    try:
        slides_json = json.dumps([
            {
                "type": "bullets",
                "title": "Platform Highlights",
                "bullets": ["Sub-second latency", "Python code interpreter", "Token Vault"],
            },
            {
                "type": "stats",
                "title": "Key Metrics",
                "stats": [{"value": "99.95%", "label": "Uptime"}, {"value": "<180ms", "label": "Latency"}],
            },
            {
                "type": "two_column",
                "title": "Comparison",
                "col1_title": "Before",
                "col1_bullets": ["Manual work", "Slow"],
                "col2_title": "After",
                "col2_bullets": ["Automated", "Fast"],
            },
        ])

        res_str = create_powerpoint_presentation("Pitch_Deck.pptx", "Platform Pitch", "Q3 2026 Overview", slides_json=slides_json, theme="dark")
        res = json.loads(res_str)

        assert res["status"] == "success"
        assert res["filename"] == "Pitch_Deck.pptx"
        assert res["file_type"] == "powerpoint"
        assert res["slides_count"] == 4
        assert res["size_bytes"] > 100

        # Check queued event
        assert not q.empty()
        event = q.get_nowait()
        assert event["filename"] == "Pitch_Deck.pptx"
        assert event["file_type"] == "powerpoint"
        assert event["data_uri"].startswith("data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,")
    finally:
        reset_document_queue(token)


def test_create_powerpoint_presentation_markdown():
    q: queue.Queue = queue.Queue()
    token = set_document_queue(q)
    try:
        md_slides = """
# Executive Pitch Deck
---
## Market Opportunity
- Rapidly expanding enterprise AI agent ecosystem
- Demand for secure, stateless serverless runtimes
- Complete elimination of idle compute overhead
---
## Performance Benchmarks
99.95% : Production Uptime SLA
<150ms : End-to-End Latency
$0.00 : Idle Infrastructure Cost
---
## Strategic Roadmap
#### Phase 1: Core Network
- Deploy AgentCore Runtime Gateways
- Multi-region failover
#### Phase 2: Autonomous Agents
- Autonomous Deep Research
- Real-time multimodal synthesis
"""
        res_str = create_powerpoint_presentation("Investor_Deck.pptx", "Investor Deck", "2026 Strategy", content=md_slides)
        res = json.loads(res_str)

        assert res["status"] == "success"
        assert res["filename"] == "Investor_Deck.pptx"
        assert res["file_type"] == "powerpoint"
        assert res["slides_count"] >= 3
        assert res["size_bytes"] > 100
    finally:
        reset_document_queue(token)
