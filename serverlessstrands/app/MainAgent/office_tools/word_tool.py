import base64
import io
import json
from typing import Any

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
from docx.shared import Inches, Pt, RGBColor
from strands import tool


def _set_cell_background(cell: Any, fill_hex: str):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)


@tool
def create_word_document(
    filename: str, title: str, sections_json: str
) -> str:
    """Create a formatted Microsoft Word (.docx) document with styled headings, paragraphs, bullet lists, tables, and callouts.

    filename: Name of the file, e.g. "Architecture_Report.docx"
    title: Document main title
    sections_json: JSON string representing sections. Example:
    [
      {"type": "subtitle", "text": "A comprehensive analysis of cloud architecture"},
      {"type": "heading_1", "text": "1. Executive Summary"},
      {"type": "paragraph", "text": "This report details our serverless infrastructure..."},
      {"type": "bullet_list", "items": ["Key Point 1", "Key Point 2", "Key Point 3"]},
      {"type": "heading_2", "text": "2. Component Breakdown"},
      {
        "type": "table",
        "headers": ["Component", "Technology", "Status"],
        "rows": [
          ["Runtime", "AWS Bedrock AgentCore", "Production"],
          ["Language Model", "Anthropic Claude 3.7", "Active"]
        ]
      },
      {"type": "callout", "text": "Note: Security credentials are encrypted in AWS Token Vault."}
    ]
    """
    if not filename.endswith(".docx"):
        filename += ".docx"

    try:
        sections = json.loads(sections_json)
        if isinstance(sections, dict):
            sections = [sections]
    except Exception as err:
        return json.dumps(
            {"error": f"Invalid sections_json parameter: {err}"}, indent=2
        )

    doc = Document()

    # Set page margins to 1 inch
    for sec in doc.sections:
        sec.top_margin = Inches(1)
        sec.bottom_margin = Inches(1)
        sec.left_margin = Inches(1)
        sec.right_margin = Inches(1)

    # Document Title
    title_p = doc.add_paragraph()
    title_run = title_p.add_run(title)
    title_run.font.name = "Calibri"
    title_run.font.size = Pt(24)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
    title_p.paragraph_format.space_after = Pt(4)

    for s in sections:
        stype = s.get("type", "paragraph")
        text = s.get("text", "")

        if stype == "subtitle":
            p = doc.add_paragraph()
            r = p.add_run(text)
            r.font.name = "Calibri"
            r.font.size = Pt(13)
            r.font.italic = True
            r.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
            p.paragraph_format.space_after = Pt(16)

        elif stype == "heading_1":
            h = doc.add_paragraph()
            r = h.add_run(text)
            r.font.name = "Calibri"
            r.font.size = Pt(16)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
            h.paragraph_format.space_before = Pt(16)
            h.paragraph_format.space_after = Pt(6)

        elif stype == "heading_2":
            h = doc.add_paragraph()
            r = h.add_run(text)
            r.font.name = "Calibri"
            r.font.size = Pt(13)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
            h.paragraph_format.space_before = Pt(12)
            h.paragraph_format.space_after = Pt(4)

        elif stype == "paragraph":
            p = doc.add_paragraph()
            r = p.add_run(text)
            r.font.name = "Calibri"
            r.font.size = Pt(11)
            r.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
            p.paragraph_format.line_spacing = 1.15
            p.paragraph_format.space_after = Pt(6)

        elif stype == "bullet_list":
            items = s.get("items", [])
            for item in items:
                p = doc.add_paragraph(style="List Bullet")
                r = p.add_run(str(item))
                r.font.name = "Calibri"
                r.font.size = Pt(11)
                r.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
                p.paragraph_format.space_after = Pt(3)

        elif stype == "callout":
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(8)
            r_icon = p.add_run("💡 ")
            r_icon.font.size = Pt(11)
            r = p.add_run(text)
            r.font.name = "Calibri"
            r.font.size = Pt(10.5)
            r.font.italic = True
            r.font.color.rgb = RGBColor(0x0F, 0x76, 0x6E)

        elif stype == "table":
            headers = s.get("headers", [])
            rows = s.get("rows", [])
            if headers:
                table = doc.add_table(
                    rows=len(rows) + 1, cols=len(headers)
                )
                table.alignment = WD_TABLE_ALIGNMENT.CENTER
                table.autofit = True

                # Style Header Row
                for col_idx, h_text in enumerate(headers):
                    cell = table.cell(0, col_idx)
                    cell.text = str(h_text)
                    _set_cell_background(cell, "1E3A8A")
                    p = cell.paragraphs[0]
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for run in p.runs:
                        run.font.name = "Calibri"
                        run.font.size = Pt(10.5)
                        run.font.bold = True
                        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

                # Style Data Rows
                for row_idx, row_data in enumerate(rows, 1):
                    is_alt = (row_idx % 2) == 0
                    for col_idx, val in enumerate(row_data):
                        if col_idx < len(headers):
                            cell = table.cell(row_idx, col_idx)
                            cell.text = str(val)
                            if is_alt:
                                _set_cell_background(cell, "F8FAFC")
                            p = cell.paragraphs[0]
                            for run in p.runs:
                                run.font.name = "Calibri"
                                run.font.size = Pt(10)
                                run.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)

                doc.add_paragraph().paragraph_format.space_after = Pt(6)

    buffer = io.BytesIO()
    doc.save(buffer)
    docx_bytes = buffer.getvalue()
    size_bytes = len(docx_bytes)
    base64_data = base64.b64encode(docx_bytes).decode("utf-8")
    data_uri = f"data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,{base64_data}"

    doc_event = {
        "filename": filename,
        "file_type": "word",
        "size_bytes": size_bytes,
        "data_uri": data_uri,
        "summary": f"{title} ({len(sections)} sections)",
    }

    from office_tools import document_queue

    document_queue.put_nowait(doc_event)

    return json.dumps(
        {
            "status": "success",
            "filename": filename,
            "file_type": "word",
            "size_bytes": size_bytes,
            "title": title,
            "download_ready": True,
            "summary": f"Successfully generated Word document '{filename}' with {len(sections)} sections.",
        },
        indent=2,
    )
