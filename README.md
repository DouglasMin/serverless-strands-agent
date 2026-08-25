# ⚡ Serverless Strands: Autonomous Multi-Agent Workspace & Office Deliverables Engine

[![AWS Bedrock AgentCore](https://img.shields.io/badge/AWS-Bedrock_AgentCore-orange?logo=amazon-aws&logoColor=white)](https://aws.amazon.com/bedrock/)
[![Claude 3.7 Sonnet](https://img.shields.io/badge/LLM-Claude_3.7_Sonnet-purple)](https://www.anthropic.com/claude)
[![React 19](https://img.shields.io/badge/Frontend-React_19_TypeScript-blue?logo=react&logoColor=white)](https://react.dev/)
[![Live Demo](https://img.shields.io/badge/Live_Demo-CloudFront_CDN-success?logo=cloudflare&logoColor=white)](https://d1rur2clzx2nyl.cloudfront.net)
[![Observability](https://img.shields.io/badge/Telemetry-Langfuse_OTel-black?logo=opentelemetry&logoColor=white)](https://langfuse.com/)

[ **English** ] | [ [한국어](#-serverless-strands-자율형-멀티에이전트-워크스페이스--오피스-산출물-엔진) ]

---

## 🌐 English

> An enterprise-grade, serverless autonomous AI agent platform powered by **AWS Bedrock AgentCore**, **Claude 3.7 Sonnet**, and **Agent-to-Agent (A2A) orchestration**. 
> Capable of autonomous deep web & academic research, multi-sheet financial modeling (Excel), executive presentation generation (PowerPoint), document synthesis (Word), Python computational sandboxes, and mobility routing—all paired with a high-performance in-browser **Workspace Studio**.

🔗 **Live Production URL:** [https://d1rur2clzx2nyl.cloudfront.net](https://d1rur2clzx2nyl.cloudfront.net)

---

### 🏗️ System Architecture

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

### 🌟 Key Technical Highlights

1. **Autonomous Office Deliverables Engine (Zero Base64 Bloat)**
   - Programmatically builds `.xlsx`, `.pptx`, and `.docx` in-memory.
   - Uploads directly to S3 (`s3://serverlessstrands-dev-user-uploads-*/deliverables/`) and issues 24-hour presigned attachment URLs.
   - Completely prevents DynamoDB 400KB item size limits and eliminates base64 SSE streaming latency.

2. **Agent-to-Agent (A2A) Multi-Agent Delegation**
   - The coordinator `MainAgent` transparently delegates deep literature and web research to `DeepResearchAgent` over MCP/SSE.
   - Live research steps, search queries, and academic papers (ArXiv / Web) are streamed side-by-side in real-time.

3. **Unified Workspace Studio & In-Browser Document Previews**
   - **PowerPoint Slide Deck Carousel**: 16:9 widescreen presentation viewer with dark/light themes, stat cards, and two-column layouts.
   - **Excel Spreadsheet Grid**: Multi-sheet tab switcher, search/filter input, and summary total formula rows.
   - **Executive Word Reader**: Dossier view with headings, callouts (`💡`), and bordered tables.
   - **High-Res Mermaid Diagram Lightbox**: Diagrams zoomable up to 400% with fullscreen lightbox.

4. **Slash-Commands (`/`) & Quick Mode Toggles**
   - Autocomplete palette for `/research`, `/ppt`, `/excel`, `/word`, `/route`, `/finance`, `/code`.
   - Mode pills to instantly set specialized agent goals.

5. **Session Portability & 1-Click Deliverables ZIP**
   - Export full conversation sessions to Markdown (`.md`), HTML dossiers, or download all generated deliverables in a single `.zip` bundle using `jszip`.

---

### 🛠️ Tech Stack & Infrastructure

| Layer | Technology | Purpose / Notes |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite | Sub-component modularization, 65% initial bundle reduction via `manualChunks` |
| **Edge & CDN** | AWS CloudFront + Amazon S3 | Global CDN edge caching & SPA distribution |
| **Agent Runtime** | AWS Bedrock AgentCore (Firecracker microVMs) | Isolated Python microVM runtimes for `MainAgent` & `DeepResearchAgent` |
| **Foundational Model** | Claude 3.7 Sonnet (`anthropic.claude-3-7-sonnet-20250219-v1:0`) | Reasoning, function calling, tool orchestration |
| **Office Tooling** | `openpyxl`, `python-pptx`, `python-docx` | Programmatic creation of spreadsheets, presentations, and documents |
| **Memory Architecture**| Bedrock AgentCore Memory + Amazon DynamoDB | Short-Term Context + Long-Term Semantic & Preference Memory |
| **Identity & OAuth** | Amazon Cognito + AgentCore 3LO Identity | Google IdP federation with PKCE; GitHub, Google Calendar, Notion integrations |
| **Observability** | Langfuse Cloud + OpenTelemetry | Multi-turn latency tracking, tool waterfall inspection, token analytics |
| **IaC** | Terraform + AgentCore CDK | Declarative reproducible cloud infrastructure |

---

## 🇰🇷 한국어 (Korean)

> **AWS Bedrock AgentCore**, **Claude 3.7 Sonnet**, 그리고 **Agent-to-Agent (A2A) 오케스트레이션** 기반의 엔터프라이즈급 서버리스 자율 AI 에이전트 플랫폼입니다.
> 자율 심층 웹/학술 리서치, 다중 시트 재무 모델링(Excel), 경영진 발표 자료 생성(PowerPoint), 보고서 작성(Word), Python 코드 인터프리터 샌드박스, 모빌리티 경로 추천을 제공하며, 브라우저 내 인터랙티브 **Workspace Studio**를 통해 실시간으로 확인하고 다운로드할 수 있습니다.

🔗 **라이브 배포 데모 URL:** [https://d1rur2clzx2nyl.cloudfront.net](https://d1rur2clzx2nyl.cloudfront.net)

---

### 🌟 핵심 기술적 차별점

1. **오피스 산출물 엔진 (Base64 페이로드 제거 및 S3 직연동)**
   - 파이썬 엔진에서 `.xlsx`, `.pptx`, `.docx`를 메모리 상에서 생성 후 S3 버킷(`s3://serverlessstrands-dev-user-uploads-*/deliverables/`)으로 직접 스트리밍 업로드합니다.
   - 24시간 유효한 Presigned Download URL을 발급하여 DynamoDB 400KB 아이템 크기 제한 위험을 원천 차단하고 SSE 스트리밍 지연을 최소화했습니다.

2. **에이전트 간 협업 (A2A: Agent-to-Agent Delegation)**
   - 메인 코디네이터 에이전트(`MainAgent`)가 심층 조사가 필요한 작업을 전문 리서치 에이전트(`DeepResearchAgent`)에게 MCP 프로토콜로 위임합니다.
   - 리서치 진행 단계, 검색 쿼리, 학술 논문(ArXiv / 웹) 출처가 실시간으로 스트리밍되어 확인할 수 있습니다.

3. **통합 워크스페이스 스튜디오 (Workspace Studio) & 브라우저 뷰어**
   - **PowerPoint 슬라이드 캐러셀**: 16:9 와이드스크린 슬라이드 넘기기(`< 이전 / 다음 >`), 다크/라이트 테마, 통계 지표 카드, 2단 비교 레이아웃을 브라우저에서 바로 확인.
   - **Excel 다중 시트 스프레드시트 그리드**: 시트 탭 전환, 실시간 검색/필터링, 서식화된 합계 수식 행 지원.
   - **Word 경영 보고서 리더**: 대단원 목차, 콜아웃 강조 박스(`💡`), 테두리 데이터 테이블 지원.
   - **고해상도 Mermaid 아키텍처 다이어그램**: 최대 400% 확대/축소 및 전체화면 라이트박스 모달 제공.

4. **슬래시 명령어 (`/`) & 퀵 모드 토글**
   - `/research`, `/ppt`, `/excel`, `/word`, `/route`, `/finance`, `/code` 자동완성 팔레트 및 키보드 화살표 탐색 지원.
   - 프롬프트 입력창 상단 모드 알약 버튼으로 특화 에이전트 모드 즉시 전환.

5. **세션 내보내기 & 산출물 일괄 압축 ZIP 다운로드**
   - 대화 내역을 마크다운(`.md`) 또는 단독 실행 가능한 HTML 보고서로 내보내기 지원.
   - 대화 중 생성된 모든 엑셀, 파워포인트, 워드 파일을 `JSZip`을 통해 하나의 `.zip` 파일로 1클릭 일괄 다운로드.

---

### 🛠️ 기술 스택 요약

| 계층 | 사용 기술 | 설명 |
| :--- | :--- | :--- |
| **프론트엔드** | React 19, TypeScript, Vite | 서브 컴포넌트 모듈화, Vite Rollup `manualChunks`로 초기 번들 65% 경량화 |
| **CDN & 호스팅** | AWS CloudFront + Amazon S3 | 글로벌 엣지 캐싱 및 SPA 정적 호스팅 |
| **에이전트 런타임** | AWS Bedrock AgentCore (Firecracker microVM) | `MainAgent` 및 `DeepResearchAgent` 독립 격리 런타임 환경 |
| **파운데이션 모델**| Claude 3.7 Sonnet | 복합 추론, 도구 호출, 멀티에이전트 오케스트레이션 |
| **오피스 생성** | `openpyxl`, `python-pptx`, `python-docx` | 엑셀, 파워포인트, 워드 산출물 자율 생성 엔진 |
| **메모리** | Bedrock AgentCore Memory + DynamoDB | 단기 대화 컨텍스트 + 장기 시맨틱 & 사용자 선호도 메모리 |
| **인증 & OAuth** | Amazon Cognito + AgentCore 3LO Identity | Google IdP 소셜 로그인 (PKCE), GitHub, Google Calendar, Notion 연동 |
| **모니터링** | Langfuse Cloud + OpenTelemetry | 멀티턴 지연시간 추적, 도구 워터폴 시각화, 토큰 사용량 분석 |
| **IaC** | Terraform + AgentCore CDK | 인프라 자동화 코드 관리 |

---

## 📁 디렉터리 구조

```text
├── frontend/                     # React 19 + TypeScript SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── composer/         # SlashCommandMenu, ModePills
│   │   │   ├── messages/         # AssistantMessage, UserMessage, ToolBadges, GeneratingCard
│   │   │   ├── studio/           # StudioDrawer, PowerPointViewer, ExcelViewer, WordViewer
│   │   │   ├── ExportMenu.tsx    # 마크다운/HTML 내보내기 & ZIP 일괄 다운로드
│   │   │   └── MermaidDiagram.tsx# 확대 가능한 SVG 다이어그램 & 라이트박스
│   │   ├── lib/                  # API 클라이언트, 타입 정의, 인증
│   │   └── App.tsx               # 루트 애플리케이션 & 스튜디오 상태 관리
│   └── vite.config.ts            # 롤업 벤더 청크 분할 설정
│
├── serverlessstrands/            # AgentCore 파이썬 에이전트 코드
│   └── app/MainAgent/
│       ├── office_tools/         # excel_tool.py, powerpoint_tool.py, word_tool.py, s3_storage.py
│       ├── oauth_tools/          # github.py, google_calendar.py, notion.py
│       ├── mobility_tools/       # google_maps.py 경로 프리뷰 & 지오코딩
│       └── tests/                # pytest 테스트 스위트
│
├── tools/                        # 게이트웨이 도구 타깃 (Lambda / ECR 컨테이너)
│   ├── finance/                  # Yahoo Finance 실시간 주가 & 차트
│   ├── google-maps/              # Google Maps 길찾기 & 거리 계산
│   └── tavily/                   # 웹 검색 & 뉴스 인텔리전스
│
├── infra/                        # Terraform 인프라 모듈
│   └── envs/dev/                 # AWS 개발 환경 배포 설정
│
└── scripts/                      # 배포 스크립트 및 IAM 자동 패처
    ├── deploy.sh                 # 에이전트 배포 & post_deploy.py 실행
    └── post_deploy.py            # IAM 역할 권한 자동 보정기
```

---

## 🚀 로컬 실행 및 배포 가이드

### 1. 프론트엔드 로컬 개발
```bash
cd frontend
npm install
npm run dev
```
브라우저에서 `http://localhost:5173` 접속.

### 2. 백엔드 단위 테스트 실행
```bash
uv run --project serverlessstrands/app/MainAgent pytest serverlessstrands/app/MainAgent/tests
```

### 3. AWS 배포
```bash
# 1. Bedrock AgentCore 에이전트 배포
./scripts/deploy.sh

# 2. 프론트엔드 빌드 및 S3 + CloudFront 배포
npm --prefix frontend run build
AWS_PROFILE=developer-dongik aws s3 sync frontend/dist/ s3://serverlessstrands-dev-ui-44c04df4 --delete
AWS_PROFILE=developer-dongik aws cloudfront create-invalidation --distribution-id E1MXHPQJ748UK2 --paths "/*"
```

---

## 📄 License
MIT License.
