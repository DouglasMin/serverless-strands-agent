import json
import unittest
from unittest.mock import MagicMock, patch
from a2a_tools.deep_research import deep_research, _get_deep_research_runtime_arn, _parse_agentcore_sse_stream


class TestA2ADeepResearchTool(unittest.TestCase):
    def test_parse_agentcore_sse_stream(self):
        stream = [
            b'data: "# Executive Summary\\n\\n"\n\n',
            b'data: "Humanoid robotics benchmarks show massive gains."\n\n',
        ]
        parsed = _parse_agentcore_sse_stream(stream)
        self.assertIn("# Executive Summary", parsed)
        self.assertIn("Humanoid robotics benchmarks show massive gains.", parsed)

    @patch("boto3.client")
    def test_deep_research_invokes_agentcore_runtime(self, mock_boto):
        mock_client = MagicMock()
        mock_response = {
            "response": [
                b'data: "# Quantum Computing Executive Dossier\\n\\n"\n\n',
                b'data: "## Core Findings\\nQuantum advantage demonstrated."\n\n',
            ]
        }
        mock_client.invoke_agent_runtime.return_value = mock_response
        mock_boto.return_value = mock_client

        with patch("a2a_tools.deep_research._get_deep_research_runtime_arn", return_value="arn:aws:bedrock-agentcore:ap-northeast-2:123456:runtime/serverlessstrands_DeepResearchAgent-fNxJzC68TQ"):
            output = deep_research(
                topic="Quantum Computing",
                depth="comprehensive",
                focus_areas=["superconducting qubits", "error correction"],
            )

            mock_client.invoke_agent_runtime.assert_called_once()
            call_kwargs = mock_client.invoke_agent_runtime.call_args[1]
            self.assertEqual(call_kwargs["agentRuntimeArn"], "arn:aws:bedrock-agentcore:ap-northeast-2:123456:runtime/serverlessstrands_DeepResearchAgent-fNxJzC68TQ")
            payload = json.loads(call_kwargs["payload"].decode("utf-8"))
            self.assertEqual(payload["topic"], "Quantum Computing")
            self.assertEqual(payload["focus_areas"], ["superconducting qubits", "error correction"])
            self.assertIn("Quantum advantage demonstrated.", output)


if __name__ == "__main__":
    unittest.main()
