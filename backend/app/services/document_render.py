"""Building the actual file from a checked document spec.

One function per format, each taking a spec that has already been through
document_guardrails.apply_output_limits and returning the file's bytes. They
are deterministic and never evaluate anything the model wrote: text is placed
as text, and the only markup any of them produce is bold.
"""

from __future__ import annotations

import io
import math
import re
from typing import Callable

from backend.app.services.document_guardrails import (
    MAX_SHEET_NAME_CHARS,
    is_allowed_formula,
    pdf_markup,
    plain_text,
    split_bold,
)
from backend.app.services.document_spec import DocumentSpec

AUTHOR = "LAFINA"

MIME_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def _cell_text(value: object) -> str:
    """How a table value reads in a PDF or Word table."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


# ── PDF (ReportLab) ───────────────────────────────────────────────────────


def render_pdf(spec: DocumentSpec) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        ListFlowable,
        ListItem,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=plain_text(spec.title),
        author=AUTHOR,
        creator=AUTHOR,
    )
    styles = getSampleStyleSheet()
    body = styles["BodyText"]
    cell = ParagraphStyle("Cell", parent=body, fontSize=9, leading=11)
    header_cell = ParagraphStyle("HeaderCell", parent=cell, fontName="Helvetica-Bold")

    story: list = [Paragraph(pdf_markup(spec.title), styles["Title"])]
    for block in spec.blocks:
        if block.type == "heading":
            story.append(Paragraph(pdf_markup(block.text), styles[f"Heading{block.level}"]))
        elif block.type == "paragraph":
            story.append(Paragraph(pdf_markup(block.text), body))
        elif block.type in ("bullets", "numbered"):
            numbered = block.type == "numbered"
            story.append(
                ListFlowable(
                    [ListItem(Paragraph(pdf_markup(item), body)) for item in block.items],
                    bulletType="1" if numbered else "bullet",
                    start="1" if numbered else "•",
                    bulletFormat="%s." if numbered else None,
                    bulletFontName=body.fontName,
                    bulletFontSize=body.fontSize,
                    leftIndent=18,
                    spaceAfter=6,
                )
            )
        elif block.type == "table":
            width = len(block.columns) or max((len(row) for row in block.rows), default=0)
            if width == 0:
                continue
            data = []
            if block.columns:
                data.append([Paragraph(pdf_markup(column), header_cell) for column in block.columns])
            data.extend(
                [Paragraph(pdf_markup(_cell_text(value)), cell) for value in row]
                for row in block.rows
            )
            table = Table(
                data,
                colWidths=[document.width / width] * width,
                repeatRows=1 if block.columns else 0,
            )
            style = [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C8C8C8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
            if block.columns:
                style.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F0EEEA")))
            table.setStyle(TableStyle(style))
            story.extend([Spacer(1, 4), table, Spacer(1, 8)])

    document.build(story)
    return buffer.getvalue()


# ── Word (python-docx) ────────────────────────────────────────────────────


def _add_runs(paragraph, text: str) -> None:
    for run_text, bold in split_bold(text):
        run = paragraph.add_run(run_text)
        run.bold = bold or None


def render_docx(spec: DocumentSpec) -> bytes:
    from docx import Document
    from docx.shared import Pt

    document = Document()
    document.core_properties.title = plain_text(spec.title)
    document.core_properties.author = AUTHOR
    document.add_heading(plain_text(spec.title), level=0)

    for block in spec.blocks:
        if block.type == "heading":
            document.add_heading(plain_text(block.text), level=block.level)
        elif block.type == "paragraph":
            _add_runs(document.add_paragraph(), block.text)
        elif block.type == "bullets":
            for item in block.items:
                _add_runs(document.add_paragraph(style="List Bullet"), item)
        elif block.type == "numbered":
            # Word's "List Number" style continues one count through the whole
            # document, so a second list would start at 4. Writing the number
            # keeps every list starting at 1.
            for index, item in enumerate(block.items, start=1):
                paragraph = document.add_paragraph()
                paragraph.paragraph_format.left_indent = Pt(18)
                paragraph.paragraph_format.first_line_indent = Pt(-18)
                paragraph.add_run(f"{index}.\t")
                _add_runs(paragraph, item)
        elif block.type == "table":
            width = len(block.columns) or max((len(row) for row in block.rows), default=0)
            if width == 0:
                continue
            table = document.add_table(rows=0, cols=width)
            try:
                table.style = "Light Grid Accent 1"
            except (KeyError, ValueError):
                table.style = "Table Grid"
            if block.columns:
                header = table.add_row().cells
                for index, column in enumerate(block.columns):
                    header[index].text = ""
                    run = header[index].paragraphs[0].add_run(plain_text(column))
                    run.bold = True
            for row in block.rows:
                cells = table.add_row().cells
                for index, value in enumerate(row):
                    cells[index].text = ""
                    _add_runs(cells[index].paragraphs[0], _cell_text(value))
            document.add_paragraph()

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


# ── Excel (openpyxl) ──────────────────────────────────────────────────────

_SHEET_NAME_UNSAFE = re.compile(r"[\[\]:*?/\\]")
# No leading zeros: "0917 123 4567" and "007" are identifiers, not amounts.
_PLAIN_NUMBER = re.compile(r"^-?(0|[1-9]\d{0,14})(\.\d{1,10})?$")


def _sheet_name(name: str, taken: set[str], index: int) -> str:
    base = _SHEET_NAME_UNSAFE.sub(" ", plain_text(name or ""))
    base = " ".join(base.split()).strip("'")[:MAX_SHEET_NAME_CHARS] or f"Sheet{index}"
    candidate = base
    suffix = 2
    while candidate.lower() in taken:
        tail = f" ({suffix})"
        candidate = base[: MAX_SHEET_NAME_CHARS - len(tail)] + tail
        suffix += 1
    taken.add(candidate.lower())
    return candidate


def _write_cell(worksheet, row: int, column: int, value: object):
    """Writes one value, never letting model text become a formula it chose."""
    cell = worksheet.cell(row=row, column=column)
    if value is None:
        return cell
    if isinstance(value, bool):
        cell.value = value
    elif isinstance(value, (int, float)):
        cell.value = value if math.isfinite(value) else str(value)
    else:
        text = plain_text(str(value))
        if is_allowed_formula(text):
            cell.value = text.strip().upper()
        elif _PLAIN_NUMBER.match(text):
            # "42" and "3.50" are numbers the student will want to add up.
            number = float(text)
            cell.value = int(number) if number.is_integer() and "." not in text else number
        else:
            cell.value = text
            # openpyxl reads any string starting with "=" as a formula. Marking
            # the cell as text stores it literally, so =HYPERLINK(...) or a DDE
            # payload opens as the characters it is made of.
            cell.data_type = "s"
    return cell


def render_xlsx(spec: DocumentSpec) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    workbook = Workbook()
    workbook.remove(workbook.active)
    workbook.properties.title = plain_text(spec.title)
    workbook.properties.creator = AUTHOR
    taken: set[str] = set()
    header_font = Font(bold=True)
    header_fill = PatternFill("solid", fgColor="F0EEEA")

    for index, sheet in enumerate(spec.sheets, start=1):
        worksheet = workbook.create_sheet(title=_sheet_name(sheet.name, taken, index))
        widths: dict[int, int] = {}
        row_number = 1
        if sheet.columns:
            for column_number, column in enumerate(sheet.columns, start=1):
                cell = _write_cell(worksheet, 1, column_number, column)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(vertical="top", wrap_text=True)
                widths[column_number] = len(str(cell.value or ""))
            worksheet.freeze_panes = "A2"
            row_number = 2
        for row in sheet.rows:
            for column_number, value in enumerate(row, start=1):
                cell = _write_cell(worksheet, row_number, column_number, value)
                if cell.value is not None and cell.data_type != "f":
                    widths[column_number] = max(
                        widths.get(column_number, 0), len(str(cell.value))
                    )
            row_number += 1
        for column_number, width in widths.items():
            worksheet.column_dimensions[get_column_letter(column_number)].width = min(
                60, max(10, width + 2)
            )

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# ── PowerPoint (python-pptx) ──────────────────────────────────────────────


def _fill_text_frame(text_frame, lines: list[str], size_pt: int) -> None:
    from pptx.util import Pt

    text_frame.clear()
    text_frame.word_wrap = True
    for index, line in enumerate(lines):
        paragraph = text_frame.paragraphs[0] if index == 0 else text_frame.add_paragraph()
        for run_text, bold in split_bold(line):
            run = paragraph.add_run()
            run.text = run_text
            run.font.size = Pt(size_pt)
            if bold:
                run.font.bold = True


def _bullet_size(bullets: list[str]) -> int:
    total = sum(len(bullet) for bullet in bullets)
    if total > 700 or len(bullets) > 6:
        return 16
    if total > 300 or len(bullets) > 4:
        return 20
    return 24


def render_pptx(spec: DocumentSpec) -> bytes:
    from pptx import Presentation
    from pptx.util import Inches

    presentation = Presentation()
    # Widescreen. The default template's placeholders are laid out for 4:3,
    # so each one is stretched to the new width as its slide is made.
    presentation.slide_width = Inches(13.333)
    presentation.slide_height = Inches(7.5)
    presentation.core_properties.title = plain_text(spec.title)
    presentation.core_properties.author = AUTHOR
    margin = Inches(0.7)

    def widen(slide) -> None:
        for shape in slide.placeholders:
            shape.left = margin
            shape.width = presentation.slide_width - 2 * margin

    title_slide = presentation.slides.add_slide(presentation.slide_layouts[0])
    widen(title_slide)
    title_slide.shapes.title.text = plain_text(spec.title)
    if len(title_slide.placeholders) > 1:
        subtitle = title_slide.placeholders[1]
        if spec.summary:
            subtitle.text = plain_text(spec.summary)
        else:
            subtitle.element.getparent().remove(subtitle.element)

    for slide_spec in spec.slides:
        slide = presentation.slides.add_slide(presentation.slide_layouts[1])
        widen(slide)
        slide.shapes.title.text = plain_text(slide_spec.title)
        body = slide.placeholders[1]
        if slide_spec.bullets:
            _fill_text_frame(body.text_frame, slide_spec.bullets, _bullet_size(slide_spec.bullets))
        else:
            body.element.getparent().remove(body.element)
        if slide_spec.notes:
            slide.notes_slide.notes_text_frame.text = plain_text(slide_spec.notes)

    buffer = io.BytesIO()
    presentation.save(buffer)
    return buffer.getvalue()


RENDERERS: dict[str, Callable[[DocumentSpec], bytes]] = {
    "pdf": render_pdf,
    "docx": render_docx,
    "xlsx": render_xlsx,
    "pptx": render_pptx,
}
