"""Research event helpers for DeepResearchAgent.

The actual search functions (tavily, wikipedia, arxiv) have been moved into main.py
as direct sync functions for the parallel pipeline. This module only retains the
thread-safe event queue used to stream progress events back to the caller.
"""

from __future__ import annotations

import queue
from typing import Any

# Thread-safe queue for streaming progress events
_research_event_queue: queue.Queue[dict[str, Any]] = queue.Queue()


def emit_research_event(event_data: dict[str, Any]) -> None:
    """Emit a structured sub-agent progress or source discovery event."""
    _research_event_queue.put_nowait(event_data)


def drain_research_events() -> list[dict[str, Any]]:
    """Drain all currently queued research events."""
    events: list[dict[str, Any]] = []
    while not _research_event_queue.empty():
        try:
            events.append(_research_event_queue.get_nowait())
        except queue.Empty:
            break
    return events
