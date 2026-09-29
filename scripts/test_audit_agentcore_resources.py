import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit_agentcore_resources as audit


class AuditAgentCoreResourcesTest(unittest.TestCase):
    def test_pick_first_present_uses_first_non_none_key(self):
        item = {"agentRuntimeName": "runtime-a", "name": "runtime-b"}

        self.assertEqual(
            audit.pick_first_present(item, ("missing", "agentRuntimeName", "name")),
            "runtime-a",
        )

    def test_find_by_any_name_matches_multiple_aws_shapes(self):
        items = [
            {"id": "memory-a", "status": "ACTIVE"},
            {"name": "gateway-a", "status": "READY"},
            {"agentRuntimeId": "runtime-a", "status": "READY"},
        ]

        self.assertEqual(audit.find_by_any_name(items, "memory-a")["status"], "ACTIVE")
        self.assertEqual(audit.find_by_any_name(items, "gateway-a")["status"], "READY")
        self.assertEqual(audit.find_by_any_name(items, "runtime-a")["status"], "READY")
        self.assertIsNone(audit.find_by_any_name(items, "missing"))

    def test_memory_strategy_namespaces_are_normalized(self):
        memory = {
            "strategies": [
                {
                    "type": "SEMANTIC",
                    "configuration": {"namespace": {"template": "/users/{actorId}/facts"}},
                },
                {
                    "type": "USER_PREFERENCE",
                    "namespaces": ["/users/{actorId}/preferences"],
                },
                {
                    "type": "SUMMARIZATION",
                    "namespaceTemplates": ["/summaries/{actorId}/{sessionId}"],
                },
            ]
        }

        self.assertEqual(
            audit.memory_strategy_namespaces(memory),
            {
                "SEMANTIC": "/users/{actorId}/facts",
                "USER_PREFERENCE": "/users/{actorId}/preferences",
                "SUMMARIZATION": "/summaries/{actorId}/{sessionId}",
            },
        )

    def test_target_tool_names_reads_inline_schema(self):
        target = {"targetConfiguration": {"mcp": {"lambda": {"toolSchema": {"inlinePayload": [{"name": "stock_quote"}]}}}}}

        self.assertEqual(audit.target_tool_names(target), {"stock_quote"})

    def test_target_tool_names_reads_s3_hosted_schema(self):
        # CDK-declared lambdaFunctionArn targets store their schema as an S3 asset.
        target = {"targetConfiguration": {"mcp": {"lambda": {"toolSchema": {"s3": {"uri": "s3://cdk-assets/abc.json"}}}}}}
        s3 = FakeS3({("cdk-assets", "abc.json"): b'[{"name": "stock_quote"}, {"name": "stock_history"}]'})

        self.assertEqual(audit.target_tool_names(target, s3), {"stock_quote", "stock_history"})


class FakeS3:
    def __init__(self, objects):
        self.objects = objects

    def get_object(self, Bucket, Key):
        return {"Body": FakeBody(self.objects[(Bucket, Key)])}


class FakeBody:
    def __init__(self, data):
        self.data = data

    def read(self):
        return self.data


if __name__ == "__main__":
    unittest.main()
