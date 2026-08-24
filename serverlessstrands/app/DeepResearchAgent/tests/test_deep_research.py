import unittest
from unittest.mock import patch, MagicMock
from research_tools import wikipedia_search, arxiv_search, tavily_search, web_extract
from main import DEEP_RESEARCH_SYSTEM_PROMPT


class TestDeepResearchTools(unittest.TestCase):
    def test_system_prompt_contains_phases(self):
        self.assertIn("Executive Research Dossier", DEEP_RESEARCH_SYSTEM_PROMPT)
        self.assertIn("tavily_search", DEEP_RESEARCH_SYSTEM_PROMPT)
        self.assertIn("wikipedia_search", DEEP_RESEARCH_SYSTEM_PROMPT)
        self.assertIn("arxiv_search", DEEP_RESEARCH_SYSTEM_PROMPT)

    @patch("urllib.request.urlopen")
    def test_wikipedia_search_parses_results(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"query": {"search": [{"title": "Quantum Computing", "snippet": "A subfield of <span class=\\"searchmatch\\">quantum</span> info"}]}}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        result = wikipedia_search(query="Quantum Computing", max_results=2)
        self.assertIn("Quantum Computing", result)
        self.assertIn("https://en.wikipedia.org/wiki/Quantum_Computing", result)

    @patch("urllib.request.urlopen")
    def test_arxiv_search_parses_xml(self, mock_urlopen):
        xml_content = b"""<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
                <id>http://arxiv.org/abs/2601.12345v1</id>
                <published>2026-01-15T00:00:00Z</published>
                <title>Next-Gen Solid State Batteries</title>
                <summary>High energy density solid-state electrolyte review.</summary>
            </entry>
        </feed>"""
        mock_resp = MagicMock()
        mock_resp.read.return_value = xml_content
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        result = arxiv_search(query="Solid State Batteries", max_results=2)
        self.assertIn("Next-Gen Solid State Batteries", result)
        self.assertIn("http://arxiv.org/abs/2601.12345v1", result)

    @patch("urllib.request.urlopen")
    def test_web_extract_strips_tags(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"<html><head><script>var x = 1;</script></head><body><h1>Analysis</h1><p>Solid-state battery cost is falling.</p></body></html>"
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        result = web_extract(url="https://example.com/battery")
        self.assertIn("Analysis", result)
        self.assertIn("Solid-state battery cost is falling.", result)
        self.assertNotIn("var x = 1;", result)


if __name__ == "__main__":
    unittest.main()
