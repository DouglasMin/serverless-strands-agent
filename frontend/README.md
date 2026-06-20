# Frontend (React + Vite)

Minimal chat UI for the Serverless Strands agent.

## Local dev

```bash
cd frontend
npm install
# Optional — proxy /api/* to the deployed Lambda URL while iterating on UI:
echo "VITE_DEV_API_TARGET=https://<lambda-url-host>" > .env.local
npm run dev          # http://localhost:5173
```

Without `VITE_DEV_API_TARGET`, `/api/*` requests will fail in dev (no proxy target). Production builds rely on CloudFront serving `/api/*` from the same origin, so no env var needed at build time.

## Build + deploy

```bash
npm run build
aws s3 sync dist/ s3://<ui-bucket>/ --delete --profile developer-dongik
aws cloudfront create-invalidation \
  --distribution-id <id> --paths "/*" --profile developer-dongik
```

The bucket and distribution id come from `terraform output` in `infra/envs/dev`.
