"""Microsoft Office document generation tools suite."""

import queue
from contextvars import ContextVar, Token
from typing import Any

_document_queue: ContextVar[queue.Queue[dict[str, Any]] | None] = ContextVar(
    "document_queue",
    default=None,
)
_fallback_document_queue: queue.Queue[dict[str, Any]] = queue.Queue()


class DocumentQueue:
    def _queue(self) -> queue.Queue[dict[str, Any]]:
        return _document_queue.get() or _fallback_document_queue

    def put_nowait(self, doc_event: dict[str, Any]) -> None:
        self._queue().put_nowait(doc_event)

    def get_nowait(self) -> dict[str, Any]:
        return self._queue().get_nowait()

    def empty(self) -> bool:
        return self._queue().empty()


document_queue = DocumentQueue()


def set_document_queue(q: queue.Queue[dict[str, Any]]) -> Token:
    return _document_queue.set(q)


def reset_document_queue(token: Token) -> None:
    _document_queue.reset(token)


from .excel_tool import create_excel_spreadsheet
from .word_tool import create_word_document
from .powerpoint_tool import create_powerpoint_presentation

office_tools = [
    create_excel_spreadsheet,
    create_word_document,
    create_powerpoint_presentation,
]

__all__ = [
    "document_queue",
    "set_document_queue",
    "reset_document_queue",
    "office_tools",
    "create_excel_spreadsheet",
    "create_word_document",
    "create_powerpoint_presentation",
]
