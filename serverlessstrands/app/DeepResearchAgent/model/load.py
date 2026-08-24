from botocore.config import Config
from strands.models.bedrock import BedrockModel


def load_model() -> BedrockModel:
    """Get Bedrock model client using IAM credentials with extended timeout."""
    config = Config(
        read_timeout=300,
        connect_timeout=15,
        retries={"max_attempts": 5, "mode": "adaptive"},
    )
    return BedrockModel(
        model_id="global.anthropic.claude-sonnet-4-6",
        boto_client_config=config,
    )
