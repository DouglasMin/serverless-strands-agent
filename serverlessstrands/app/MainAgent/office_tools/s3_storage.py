import base64
import logging
import os
import uuid
import boto3

logger = logging.getLogger(__name__)

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_REGION_NAME", "ap-northeast-2"))
_CACHED_BUCKET_NAME: str | None = None


def _discover_deliverables_bucket() -> str | None:
    """Discover the active S3 bucket for deliverables and user uploads."""
    global _CACHED_BUCKET_NAME
    if _CACHED_BUCKET_NAME:
        return _CACHED_BUCKET_NAME

    # 1. Check explicit environment variables
    env_bucket = os.environ.get("DELIVERABLES_BUCKET") or os.environ.get("UPLOADS_BUCKET")
    if env_bucket:
        _CACHED_BUCKET_NAME = env_bucket
        return _CACHED_BUCKET_NAME

    # 2. List S3 buckets matching user-uploads pattern
    try:
        s3 = boto3.client("s3", region_name=REGION)
        resp = s3.list_buckets()
        for b in resp.get("Buckets", []):
            name = b.get("Name", "")
            if name.startswith("serverlessstrands-") and "user-uploads" in name:
                _CACHED_BUCKET_NAME = name
                return _CACHED_BUCKET_NAME
    except Exception as err:
        logger.warning("Failed to auto-discover user-uploads bucket: %s", err)

    return None


def upload_deliverable_to_s3(
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> tuple[str, str, str | None]:
    """Upload deliverable to S3 and generate a 24-hour presigned download URL.

    Returns:
        tuple of (s3_uri, download_url, fallback_data_uri)
    """
    bucket_name = _discover_deliverables_bucket()
    unique_id = uuid.uuid4().hex[:8]
    base_name, ext = os.path.splitext(filename)
    safe_base = "".join(c if c.isalnum() or c in "-_" else "_" for c in base_name).strip("_")
    s3_key = f"deliverables/{safe_base}_{unique_id}{ext}"

    if bucket_name:
        try:
            s3 = boto3.client("s3", region_name=REGION)
            s3.put_object(
                Bucket=bucket_name,
                Key=s3_key,
                Body=file_bytes,
                ContentType=content_type,
                ContentDisposition=f'attachment; filename="{filename}"',
            )

            s3_uri = f"s3://{bucket_name}/{s3_key}"
            presigned_url = s3.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": bucket_name,
                    "Key": s3_key,
                    "ResponseContentDisposition": f'attachment; filename="{filename}"',
                },
                ExpiresIn=86400,  # 24 hours
            )
            return s3_uri, presigned_url, None
        except Exception as err:
            logger.error("Direct S3 deliverable upload failed: %s. Falling back to data URI.", err)

    # Fallback to local Base64 data URI if bucket unavailable or offline
    base64_data = base64.b64encode(file_bytes).decode("utf-8")
    data_uri = f"data:{content_type};base64,{base64_data}"
    return f"local://deliverables/{filename}", data_uri, data_uri
