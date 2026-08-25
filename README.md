# ⚡ Serverless Strands: Autonomous Multi-Agent Workspace & Office Deliverables Engine

[![AWS Bedrock AgentCore](https://img.shields.io/badge/AWS-Bedrock_AgentCore-orange?logo=amazon-aws&logoColor=white)](https://aws.amazon.com/bedrock/)
[![Claude 3.7 Sonnet](https://img.shields.io/badge/LLM-Claude_3.7_Sonnet-purple)](https://www.anthropic.com/claude)
[![React 19](https://img.shields.io/badge/Frontend-React_19_TypeScript-blue?logo=react&logoColor=white)](https://react.dev/)
[![Live Demo](https://img.shields.io/badge/Live_Demo-CloudFront_CDN-success?logo=cloudflare&logoColor=white)](https://d1rur2clzx2nyl.cloudfront.net)
[![Observability](https://img.shields.io/badge/Telemetry-Langfuse_OTel-black?logo=opentelemetry&logoColor=white)](https://langfuse.com/)

[ **English** ] | [ [한국어 (Korean)](./README.ko.md) ]

---

> An enterprise-grade, serverless autonomous AI agent platform powered by **AWS Bedrock AgentCore**, **Claude 3.7 Sonnet**, and **Agent-to-Agent (A2A) orchestration**. 
> Capable of autonomous deep web & academic research, multi-sheet financial modeling (Excel), executive presentation generation (PowerPoint), document synthesis (Word), Python computational sandboxes, and mobility routing—all paired with a high-performance in-browser **Workspace Studio**.

🔗 **Live Production URL:** [https://d1rur2clzx2nyl.cloudfront.net](https://d1rur2clzx2nyl.cloudfront.net)

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    %% Styling Classes
    classDef client fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef cloudfront fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#38bdf8;
    classDef bedrock fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#f3e8ff;
    classDef agent fill:#092e20,stroke:#10b981,stroke-width:2px,color:#d1fae5;
    classDef tool fill:#172554,stroke:#3b82f6,stroke-width:1px,color:#dbeafe;
    classDef storage fill:#311515,stroke:#f87171,stroke-width:1px,color:#fee2e2;
    classDef telemetry fill:#2e1065,stroke:#c084fc,stroke-width:1px,color:#fae8ff;

    %% Client Frontend Layer
    subgraph UI ["🌐 Modern React 19 Frontend (Vite + TypeScript)"]
        Browser["🖥️ User Browser Client"]:::client
        Studio["📁 Unified Workspace Studio\n(PPT Carousel, Excel Grid, Word Viewer)"]:::client
        Composer["⚡ Slash-Command Composer\n(/research, /ppt, /excel, /route)"]:::client
    end

    %% CDN & Static Hosting
    subgraph Edge ["☁️ AWS Edge Infrastructure"]
        CF["CloudFront CDN Distribution"]:::cloudfront
        S3UI["S3 Static Hosting Bucket\n(serverlessstrands-dev-ui)"]:::storage
    end

    %% AWS Serverless Strands Backend
    subgraph AWS ["☁️ AWS Bedrock AgentCore Platform (ap-northeast-2)"]
        APIGW["AgentCore Main Gateway\n(SSE Stream & MCP Proxy)"]:::cloudfront
        
        %% Agents Layer
        subgraph Agents ["🤖 Agent-to-Agent (A2A) Orchestration"]
            MainAgent["🧠 Main Coordinator Agent\n(Claude 3.7 Sonnet / Bedrock Runtime)"]:::agent
            ResearchAgent["🔬 Deep Research Subagent\n(Autonomous Multi-Step Web & ArXiv)"]:::agent
            ChatMemory["💾 Bedrock Session Memory\n(DynamoDB Short/Long-Term)"]:::storage
        end

        %% Execution Tools Layer
        subgraph Tools ["🛠️ Execution Engine & MCP Tools"]
            Sandbox["💻 Python Execution Sandbox\n(Code Interpreter & Charting)"]:::tool
            Office["📄 Office Deliverables Engine\n(openpyxl, python-pptx, python-docx)"]:::tool
            Mobility["🗺️ Google Mobility & Maps Engine\n(Geocoding, Distance Matrix, Routes)"]:::tool
            OAuth["🔐 OAuth Integrations\n(GitHub, Notion, Google Calendar, Gmail)"]:::tool
            WebTools["🌐 Web Intelligence\n(Tavily Search, DuckDuckGo, Wikipedia)"]:::tool
        end

        %% Storage & Deliverables
        subgraph DataLayer ["📦 User Storage & Deliverables"]
            S3Uploads["🪣 User Uploads & Deliverables Bucket\n(s3://serverlessstrands-dev-user-uploads-*)"]:::storage
            Presigned["🔗 24h Presigned S3 Attachment URLs\n(Direct Binary Stream)"]:::storage
        end
    end

    %% Observability Layer
    subgraph Obs ["⚡ Observability & Telemetry"]
        Langfuse["📊 Langfuse Tracing & Evaluation"]:::telemetry
        OTel["📡 OpenTelemetry Event Collector"]:::telemetry
    end

    %% Connections
    Browser <--> CF
    CF <--> S3UI
    Browser <--> APIGW
    APIGW <--> MainAgent

    MainAgent <--> ChatMemory
    MainAgent <-- "A2A Delegation Protocol" --> ResearchAgent
    ResearchAgent <--> WebTools

    MainAgent --> Sandbox
    MainAgent --> Office
    MainAgent --> Mobility
    MainAgent --> OAuth

    Office --> S3Uploads
    S3Uploads --> Presigned
    Presigned -.-> Browser

    MainAgent -.-> OTel
    ResearchAgent -.-> OTel
    OTel --> Langfuse
```

---

## 🌟 Core Technical Highlights

### 1. Autonomous Office Deliverables Engine (Zero Base64 Bloat)
* **Direct S3 Upload & 24h Presigned Download URLs**: When generating `.xlsx`, `.pptx`, or `.docx` files, the Python engine compiles binaries in-memory, streams directly to S3 (`s3://serverlessstrands-dev-user-uploads-*/deliverables/`), and issues secure 24-hour presigned attachment URLs.
* **Solves DynamoDB Limits**: Completely eliminates the risk of exceeding the DynamoDB 400KB item size limit and eliminates SSE streaming latency overhead.

### 2. Multi-Agent Agent-to-Agent (A2A) Delegation
* **Coordinator + Subagent Pipeline**: The `MainAgent` transparently delegates complex investigation tasks to a specialized `DeepResearchAgent` runtime over MCP/SSE.
* **Real-time Live Canvas**: Live streaming trace of research steps, search queries, and academic papers (ArXiv / Web) viewed side-by-side in the chat.

### 3. Unified Workspace Studio & In-Browser Document Previews
* **PowerPoint 16:9 Slide Carousel**: Browse through dark/light theme slides with `< Previous / Next >`, stat cards, and two-column benchmarks directly in the browser.
* **Excel Multi-Sheet Spreadsheet Grid**: Switch sheets, view styled zebra rows, filter rows with real-time keyword search, and highlight summary total formulas.
* **Executive Word Reader**: Dossier view with headings, callouts (`💡`), and bordered tables.
* **High-Res Mermaid Diagram Lightbox**: Diagrams zoomable up to 400% with fullscreen lightbox.

### 4. Slash-Commands (`/`) & Quick Mode Toggles
* **Interactive Command Palette**: Type `/` to access `/research`, `/ppt`, `/excel`, `/word`, `/route`, `/finance`, `/code` with full arrow-key keyboard navigation.
* **Mode Pills**: One-click switching to specialized agent workflows with contextual placeholder guidance.

### 5. Session Portability & 1-Click Deliverables ZIP
* **Export Options**: Export any session to Markdown (`.md`), styled HTML reports, or download all generated deliverables and charts in a single bundled `.zip` archive via `jszip`.

---

## 🛠️ Tech Stack & Infrastructure

| Layer | Technology | Purpose / Notes |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite | Sub-component modularization, 65% bundle reduction via `manualChunks` |
| **Edge & Hosting** | AWS CloudFront + Amazon S3 | Global CDN edge caching & SPA distribution |
| **Agent Runtimes** | AWS Bedrock AgentCore (Firecracker microVMs) | Isolated Python runtime environments for `MainAgent` & `DeepResearchAgent` |
| **Foundational Model** | Claude 3.7 Sonnet (`anthropic.claude-3-7-sonnet-20250219-v1:0`) | Reasoning, function calling, tool orchestration |
| **Office Tooling** | `openpyxl`, `python-pptx`, `python-docx` | Autonomous programmatic creation of spreadsheets, decks, and dossiers |
| **Memory Architecture**| Bedrock AgentCore Memory + Amazon DynamoDB | Short-Term Context + Long-Term Semantic & Preference Memory |
| **Identity & OAuth** | Amazon Cognito + AgentCore 3LO Identity | Google IdP federation with PKCE; GitHub, Google Calendar, Notion integrations |
| **Observability** | Langfuse Cloud + OpenTelemetry | Multi-turn latency tracking, tool waterfall inspection, token analytics |
| **Infrastructure as Code** | Terraform + AgentCore CDK | Declarative reproducible cloud infrastructure |

---

## 📁 Repository Structure

```text
├── frontend/                     # React 19 + TypeScript SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── composer/         # SlashCommandMenu, ModePills
│   │   │   ├── messages/         # AssistantMessage, UserMessage, ToolBadges, GeneratingCard
│   │   │   ├── studio/           # StudioDrawer, PowerPointViewer, ExcelViewer, WordViewer
│   │   │   ├── ExportMenu.tsx    # Markdown/HTML export & ZIP bundle generator
│   │   │   └── MermaidDiagram.tsx# Zoomable SVG diagram renderer & fullscreen lightbox
│   │   ├── lib/                  # API client, types, auth utilities
│   │   └── App.tsx               # Root application & Studio orchestration
│   └── vite.config.ts            # Dynamic chunk splitting (vendor, markdown, diagrams)
│
├── serverlessstrands/            # AgentCore Python agent definitions
│   └── app/MainAgent/
│       ├── office_tools/         # excel_tool.py, powerpoint_tool.py, word_tool.py, s3_storage.py
│       ├── oauth_tools/          # github.py, google_calendar.py, notion.py
│       ├── mobility_tools/       # google_maps.py route previews & geocoding
│       └── tests/                # pytest test suite for office and A2A tools
│
├── tools/                        # Gateway tool targets (Lambda / ECR containers)
│   ├── finance/                  # Yahoo Finance real-time stock quotes & charts
│   ├── google-maps/              # Google Maps routing & distance matrix
│   └── tavily/                   # Web search & news intelligence
│
├── infra/                        # Terraform infrastructure modules
│   └── envs/dev/                 # AWS dev environment configuration
│
└── scripts/                      # Deployment scripts & IAM fixup automations
    ├── deploy.sh                 # Full agent deploy & post-deploy IAM patcher
    └── post_deploy.py            # Idempotent IAM role policy synthesizer
```

---

## 🚀 Quickstart & Local Development

### Prerequisites
- Node.js 22+ & npm
- Python 3.12+ with `uv`
- AWS CLI configured with appropriate permissions

### 1. Frontend Development
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` to test the UI locally.

### 2. Run Backend Unit Tests
```bash
uv run --project serverlessstrands/app/MainAgent pytest serverlessstrands/app/MainAgent/tests
```

### 3. Deploy to AWS
```bash
# Deploy Bedrock AgentCore agents
./scripts/deploy.sh

# Build & Deploy Frontend to S3 + CloudFront
npm --prefix frontend run build
AWS_PROFILE=your-profile aws s3 sync frontend/dist/ s3://<UI_BUCKET> --delete
AWS_PROFILE=your-profile aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
```

---

## 📄 License
MIT License.
