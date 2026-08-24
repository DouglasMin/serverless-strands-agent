"""Main entrypoint for DeepResearchAgent - Parallel 3-Phase Research Pipeline.

Phase 1: DECOMPOSE — One LLM call to plan all search queries (structured JSON output).
Phase 2: PARALLEL SEARCH — Execute all queries concurrently via asyncio.gather.
Phase 3: SYNTHESIZE — One LLM call with all gathered evidence to produce the dossier.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent

from model.load import load_model
from research_tools import drain_research_events, emit_research_event

app = BedrockAgentCoreApp()
log = app.logger

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

# ─── Phase 1: Decompose ────────────────────────────────────────────────────────

DECOMPOSE_SYSTEM_PROMPT = """\
You are a research planning assistant. Given a research topic and optional focus areas,
output a JSON array of search queries to execute in parallel across multiple sources.

RULES:
- Output ONLY valid JSON. No markdown, no explanation, no code fences.
- Total queries: 4-6 across all sources combined.
- Each query object has: {"source": "<tavily|wikipedia|arxiv>", "query": "<search string>"}
- Use "tavily" for current news, market data, industry reports, company info.
- Use "wikipedia" for background definitions, historical context, foundational concepts.
- Use "arxiv" for cutting-edge scientific papers, AI/ML research, technical state-of-the-art.
- Queries should be diverse and complementary — avoid redundant overlapping searches.

Example output:
[
  {"source": "tavily", "query": "humanoid robotics commercialization 2026 market size"},
  {"source": "tavily", "query": "Tesla Optimus Figure AI unit economics production cost"},
  {"source": "wikipedia", "query": "humanoid robot"},
  {"source": "arxiv", "query": "humanoid robot locomotion reinforcement learning"}
]
"""

# ─── Phase 3: Synthesize ───────────────────────────────────────────────────────

SYNTHESIZE_SYSTEM_PROMPT = """\
You are a senior research analyst. Given raw search results from multiple sources
(web searches, Wikipedia, ArXiv papers), synthesize an authoritative Executive Research Dossier.

DOSSIER FORMAT:
# [Research Title]
## 🎯 Executive Summary & Core Thesis
## 📊 Key Findings & Structural Breakdown
## 📈 Quantitative Benchmarks & Data Table (Markdown table with real metrics)
## 🔬 Technical / Industry Analysis
## 💡 Strategic Implications & Forward Outlook
## 📚 Annotated Bibliography & Citations (Direct clickable links with descriptions)

RULES:
- Be thorough, precise, and analytical.
- Ground every claim in the discovered source evidence.
- Include specific numbers, dates, company names, and technical details.
- Make the dossier actionable and insightful.
"""


# ─── Search Executors (sync, run in thread pool) ───────────────────────────────

def _exec_tavily(query: str) -> dict[str, Any]:
    """Execute a Tavily web search."""
    api_key = TAVILY_API_KEY or os.environ.get("TAVILY_API_KEY", "")
    if not api_key:
        return {"source": "tavily", "query": query, "results": "No Tavily API key configured."}

    try:
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "basic",
            "max_results": 4,
            "include_answer": True,
            "include_raw_content": False,
        }
        req = urllib.request.Request(
            "https://api.tavily.com/search",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        parts = []
        if data.get("answer"):
            parts.append(f"### Direct Summary:\n{data['answer']}\n")

        parts.append("### Sources & Findings:")
        for item in data.get("results", []):
            title = item.get("title", "Untitled")
            url = item.get("url", "")
            content = item.get("content", "")
            score = item.get("score", 0.0)
            emit_research_event({
                "type": "subagent_source",
                "source": "web",
                "title": title,
                "url": url,
                "snippet": content[:240],
                "score": round(score, 2),
            })
            parts.append(f"- **[{title}]({url})** (Relevance: {score:.2f})\n  {content}\n")

        return {"source": "tavily", "query": query, "results": "\n".join(parts)}
    except Exception as err:
        return {"source": "tavily", "query": query, "results": f"Tavily search error: {err}"}


def _exec_wikipedia(query: str) -> dict[str, Any]:
    """Execute a Wikipedia search."""
    try:
        url = (
            "https://en.wikipedia.org/w/api.php?"
            + urllib.parse.urlencode({
                "action": "query",
                "list": "search",
                "srsearch": query,
                "utf8": "1",
                "format": "json",
                "srlimit": 4,
            })
        )
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "ServerlessStrands-DeepResearch/1.0 (research@agent.dev)"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        items = data.get("query", {}).get("search", [])
        if not items:
            return {"source": "wikipedia", "query": query, "results": f"No Wikipedia articles found for '{query}'."}

        parts = [f"### Wikipedia Findings for '{query}':"]
        for item in items:
            title = item.get("title", "")
            snippet = (
                item.get("snippet", "")
                .replace('<span class="searchmatch">', "**")
                .replace("</span>", "**")
            )
            page_url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}"
            emit_research_event({
                "type": "subagent_source",
                "source": "wikipedia",
                "title": title,
                "url": page_url,
                "snippet": snippet[:240].replace("**", ""),
            })
            parts.append(f"- **[{title}]({page_url})**\n  {snippet}...\n")

        return {"source": "wikipedia", "query": query, "results": "\n".join(parts)}
    except Exception as err:
        return {"source": "wikipedia", "query": query, "results": f"Wikipedia search failed: {err}"}


def _exec_arxiv(query: str) -> dict[str, Any]:
    """Execute an ArXiv search."""
    try:
        clean_query = urllib.parse.quote(query)
        url = f"https://export.arxiv.org/api/query?search_query=all:{clean_query}&start=0&max_results=4"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "ServerlessStrands-DeepResearch/1.0"},
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            xml_data = resp.read()

        root = ET.fromstring(xml_data)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        entries = root.findall("atom:entry", ns)

        if not entries:
            return {"source": "arxiv", "query": query, "results": f"No ArXiv papers found for '{query}'."}

        parts = [f"### ArXiv Academic Literature for '{query}':"]
        for entry in entries:
            title_elem = entry.find("atom:title", ns)
            summary_elem = entry.find("atom:summary", ns)
            id_elem = entry.find("atom:id", ns)
            published_elem = entry.find("atom:published", ns)

            title = title_elem.text.strip().replace("\n", " ") if title_elem is not None and title_elem.text else "Untitled"
            summary = summary_elem.text.strip().replace("\n", " ") if summary_elem is not None and summary_elem.text else ""
            paper_url = id_elem.text.strip() if id_elem is not None and id_elem.text else ""
            published = published_elem.text.strip()[:10] if published_elem is not None and published_elem.text else ""

            emit_research_event({
                "type": "subagent_source",
                "source": "arxiv",
                "title": title,
                "url": paper_url,
                "snippet": summary[:240],
                "published": published,
            })
            parts.append(
                f"- **[{title}]({paper_url})** ({published})\n"
                f"  *Abstract*: {summary[:320]}...\n"
            )

        return {"source": "arxiv", "query": query, "results": "\n".join(parts)}
    except Exception as err:
        return {"source": "arxiv", "query": query, "results": f"ArXiv search error: {err}"}


SEARCH_DISPATCH = {
    "tavily": _exec_tavily,
    "wikipedia": _exec_wikipedia,
    "arxiv": _exec_arxiv,
}


async def _run_search(source: str, query: str, loop: asyncio.AbstractEventLoop) -> dict[str, Any]:
    """Run a single search in the thread pool (search functions are sync/blocking)."""
    fn = SEARCH_DISPATCH.get(source, _exec_tavily)
    emit_research_event({
        "type": "subagent_step",
        "tool": f"{source}_search",
        "query": query,
        "detail": f"Searching {source} for: '{query}'",
    })
    return await loop.run_in_executor(None, fn, query)


# ─── Main 3-Phase Pipeline ─────────────────────────────────────────────────────

def _build_agent(system_prompt: str) -> Agent:
    """Build a Strands Agent with the given system prompt (no tools)."""
    model = load_model()
    return Agent(
        model=model,
        system_prompt=system_prompt,
        tools=[],
    )


@app.entrypoint
async def entrypoint(payload: dict[str, Any], context: Any = None) -> Any:
    """AgentCore entrypoint: 3-phase parallel deep research pipeline."""
    prompt = payload.get("prompt") or payload.get("topic") or "Conduct general deep research."
    depth = payload.get("depth", "comprehensive")
    focus_areas = payload.get("focus_areas") or payload.get("focusAreas") or []

    log.info("Starting parallel DeepResearch pipeline: %s", prompt[:80])

    # ═══ Phase 1: DECOMPOSE ═══
    emit_research_event({
        "type": "subagent_step",
        "agent": "DeepResearchAgent",
        "stage": "planning",
        "topic": prompt,
        "depth": depth,
        "detail": f"Phase 1/3: Decomposing research query into parallel search vectors...",
    })

    decompose_agent = _build_agent(DECOMPOSE_SYSTEM_PROMPT)
    decompose_prompt = f"Research topic: {prompt}\nDepth: {depth}"
    if focus_areas:
        decompose_prompt += f"\nFocus areas: {', '.join(focus_areas)}"
    decompose_prompt += "\n\nOutput the JSON array of search queries:"

    async def stream_generator():
        try:
            # Drain planning event
            for ev in drain_research_events():
                yield f"__SUBAGENT_EVENT_JSON_START__{json.dumps(ev)}__SUBAGENT_EVENT_JSON_END__\n"

            # Phase 1: Get search plan from LLM
            plan_text = ""
            async for chunk in decompose_agent.stream_async(decompose_prompt):
                if isinstance(chunk, str):
                    plan_text += chunk
                elif isinstance(chunk, dict) and "data" in chunk:
                    plan_text += chunk["data"]
                elif hasattr(chunk, "text") and isinstance(chunk.text, str):
                    plan_text += chunk.text

            # Parse the JSON plan
            queries = _parse_query_plan(plan_text)
            log.info("Phase 1 complete: %d queries planned", len(queries))

            emit_research_event({
                "type": "subagent_step",
                "agent": "DeepResearchAgent",
                "stage": "searching",
                "topic": prompt,
                "detail": f"Phase 2/3: Executing {len(queries)} searches in parallel...",
            })
            for ev in drain_research_events():
                yield f"__SUBAGENT_EVENT_JSON_START__{json.dumps(ev)}__SUBAGENT_EVENT_JSON_END__\n"

            # ═══ Phase 2: PARALLEL SEARCH ═══
            loop = asyncio.get_event_loop()
            search_tasks = [
                _run_search(q["source"], q["query"], loop)
                for q in queries
            ]

            # Drain search-start events
            for ev in drain_research_events():
                yield f"__SUBAGENT_EVENT_JSON_START__{json.dumps(ev)}__SUBAGENT_EVENT_JSON_END__\n"

            search_results = await asyncio.gather(*search_tasks, return_exceptions=True)

            # Process results and drain source events
            evidence_blocks = []
            for result in search_results:
                if isinstance(result, Exception):
                    evidence_blocks.append(f"[Search error: {result}]")
                elif isinstance(result, dict):
                    evidence_blocks.append(
                        f"=== {result['source'].upper()} — Query: \"{result['query']}\" ===\n"
                        f"{result['results']}\n"
                    )

            for ev in drain_research_events():
                yield f"__SUBAGENT_EVENT_JSON_START__{json.dumps(ev)}__SUBAGENT_EVENT_JSON_END__\n"

            log.info("Phase 2 complete: %d search results collected", len(evidence_blocks))

            # ═══ Phase 3: SYNTHESIZE ═══
            emit_research_event({
                "type": "subagent_step",
                "agent": "DeepResearchAgent",
                "stage": "synthesizing",
                "topic": prompt,
                "detail": "Phase 3/3: Synthesizing findings into Executive Research Dossier...",
            })
            for ev in drain_research_events():
                yield f"__SUBAGENT_EVENT_JSON_START__{json.dumps(ev)}__SUBAGENT_EVENT_JSON_END__\n"

            synthesize_agent = _build_agent(SYNTHESIZE_SYSTEM_PROMPT)
            synthesis_prompt = (
                f"RESEARCH TOPIC: {prompt}\n"
                f"DEPTH: {depth}\n"
                f"FOCUS AREAS: {', '.join(focus_areas) if focus_areas else 'General'}\n\n"
                f"RAW EVIDENCE FROM PARALLEL SEARCH ({len(evidence_blocks)} sources):\n\n"
                + "\n\n".join(evidence_blocks)
                + "\n\nSynthesize the above evidence into a comprehensive Executive Research Dossier."
            )

            async for chunk in synthesize_agent.stream_async(synthesis_prompt):
                # Drain any events
                for ev in drain_research_events():
                    yield f"__SUBAGENT_EVENT_JSON_START__{json.dumps(ev)}__SUBAGENT_EVENT_JSON_END__\n"

                if isinstance(chunk, str):
                    yield chunk
                elif isinstance(chunk, dict):
                    if "data" in chunk and isinstance(chunk["data"], str):
                        yield chunk["data"]
                elif hasattr(chunk, "text") and isinstance(chunk.text, str):
                    yield chunk.text

            # Final completion event
            emit_research_event({
                "type": "subagent_step",
                "agent": "DeepResearchAgent",
                "stage": "completed",
                "topic": prompt,
                "detail": "Synthesis complete. Executive Research Dossier generated.",
            })
            for ev in drain_research_events():
                yield f"__SUBAGENT_EVENT_JSON_START__{json.dumps(ev)}__SUBAGENT_EVENT_JSON_END__\n"

        except Exception as err:
            log.error("DeepResearch pipeline error: %s", err)
            yield f"\n\n[DeepResearch Error]: {err}"

    return stream_generator()


def _parse_query_plan(raw_text: str) -> list[dict[str, str]]:
    """Parse the LLM's JSON query plan output, handling markdown fences and edge cases."""
    text = raw_text.strip()

    # Strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    text = text.strip()

    # Try to find a JSON array in the text
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        text = match.group(0)

    try:
        queries = json.loads(text)
        if isinstance(queries, list):
            valid = []
            for q in queries:
                if isinstance(q, dict) and "source" in q and "query" in q:
                    source = q["source"].lower().strip()
                    if source in SEARCH_DISPATCH:
                        valid.append({"source": source, "query": q["query"]})
            if valid:
                return valid[:8]  # Cap at 8 max
    except json.JSONDecodeError:
        log.warning("Failed to parse query plan JSON: %s", text[:200])

    # Fallback: generate basic queries from the topic
    log.info("Using fallback query plan")
    return [
        {"source": "tavily", "query": raw_text[:200]},
        {"source": "wikipedia", "query": raw_text[:100]},
        {"source": "arxiv", "query": raw_text[:100]},
    ]


if __name__ == "__main__":
    app.run()
