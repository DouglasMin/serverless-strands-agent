# syntax=docker/dockerfile:1.7
FROM public.ecr.aws/lambda/nodejs:22

# Install deps first for layer caching. Lock optional in dev; use ci if present.
COPY package.json package-lock.json* ${LAMBDA_TASK_ROOT}/
RUN if [ -f ${LAMBDA_TASK_ROOT}/package-lock.json ]; then \
      npm ci --omit=dev --prefix ${LAMBDA_TASK_ROOT}; \
    else \
      npm install --omit=dev --prefix ${LAMBDA_TASK_ROOT}; \
    fi

COPY handler.mjs ${LAMBDA_TASK_ROOT}/

# Handler: <file-without-ext>.<exported-name>
CMD ["handler.handler"]
