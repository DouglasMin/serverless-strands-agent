import type { SubAgentTask, ToolUse } from "../../lib/types";

const TOOL_ICONS: Record<string, string> = {
  TavilySearchPost: "/tool-icons/tavily-search.png",
  TavilySearchExtract: "/tool-icons/tavily.png",
  add_numbers: "/tool-icons/calculator.svg",
  stock_quote: "/tool-icons/financial.svg",
  stock_history: "/tool-icons/financial.svg",
  stock_compare: "/tool-icons/financial.svg",
  financial_news: "/tool-icons/financial-news.svg",
  stock_analysis: "/tool-icons/financial.svg",
  options_chain: "/tool-icons/financial.svg",
  github_list_repos: "/tool-icons/github.svg",
  github_get_repo: "/tool-icons/github.svg",
  github_list_issues: "/tool-icons/github.svg",
  create_excel_spreadsheet: "/tool-icons/excel.svg",
  create_word_document: "/tool-icons/word.svg",
  create_powerpoint_presentation: "/tool-icons/powerpoint.svg",
  google_calendar_list_events: "/tool-icons/google-calendar.svg",
  google_calendar_find_events_with_location: "/tool-icons/google-calendar.svg",
  google_calendar_set_event_reminder: "/tool-icons/google-calendar.svg",
  google_calendar_today: "/tool-icons/google-calendar.svg",
  google_maps_geocode: "/tool-icons/workspace.svg",
  google_maps_place_search: "/tool-icons/workspace.svg",
  google_maps_compute_route: "/tool-icons/workspace.svg",
  google_maps_route_preview: "/tool-icons/workspace.svg",
  notion_search: "/tool-icons/notion.svg",
  notion_get_page: "/tool-icons/notion.svg",
  code_interpreter: "/tool-icons/code-interpreter.svg",
  deep_research: "/tool-icons/research-agent.svg",
};

export function getToolIcon(name: string): string {
  const short = name.includes("___") ? name.split("___")[1] : name;
  if (short.includes("deep_research") || short.includes("research")) return "/tool-icons/research-agent.svg";
  if (short.startsWith("github_")) return "/tool-icons/github.svg";
  if (short.startsWith("notion_")) return "/tool-icons/notion.svg";
  if (short.startsWith("google_calendar_")) return "/tool-icons/google-calendar.svg";
  if (short.startsWith("google_maps_")) return "/tool-icons/google-maps.svg";
  if (short.includes("excel")) return "/tool-icons/excel.svg";
  if (short.includes("word")) return "/tool-icons/word.svg";
  if (short.includes("powerpoint") || short.includes("pptx")) return "/tool-icons/powerpoint.svg";
  return TOOL_ICONS[short] ?? TOOL_ICONS[name] ?? "/tool-icons/workspace.svg";
}

export function toolLabel(name: string): string {
  const short = name.includes("___") ? name.split("___")[1] : name;
  const map: Record<string, string> = {
    create_powerpoint_presentation: "PowerPoint (.pptx)",
    create_word_document: "Word (.docx)",
    create_excel_spreadsheet: "Excel (.xlsx)",
    deep_research: "Deep Research Agent",
    code_interpreter: "Python Sandbox",
    google_calendar_list_events: "Google Calendar",
    google_calendar_find_events_with_location: "Google Calendar",
    google_calendar_set_event_reminder: "Calendar Reminder",
    google_maps_route_preview: "Google Maps Route",
    google_maps_geocode: "Location Geocode",
    google_maps_place_search: "Place Search",
    notion_search: "Notion Search",
    notion_get_page: "Notion Page",
    github_list_repos: "GitHub Repos",
    github_get_repo: "GitHub Repo",
    github_list_issues: "GitHub Issues",
  };
  if (map[short]) return map[short];
  return short.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim();
}

const INTERNAL_SUBAGENT_TOOLS = new Set([
  "tavily_search",
  "tavily",
  "arxiv_search",
  "wikipedia_search",
  "web_extract"
]);

interface ToolBadgesProps {
  tools: ToolUse[];
  subagentTasks?: SubAgentTask[];
  isStreaming?: boolean;
  onOpenSubAgent?: (task: SubAgentTask) => void;
}

export function ToolBadges({
  tools,
  subagentTasks,
  isStreaming,
  onOpenSubAgent
}: ToolBadgesProps) {
  const latestSubAgentTask =
    subagentTasks && subagentTasks.length > 0 ? subagentTasks[subagentTasks.length - 1] : null;

  const visibleTools = tools.filter((t) => !INTERNAL_SUBAGENT_TOOLS.has(t.name.toLowerCase()));

  if (visibleTools.length === 0) return null;

  return (
    <div className="msg__tools">
      {visibleTools.map((t, idx) => {
        const isSubAgent = t.name.includes("deep_research") || t.name.includes("research");
        const isLatest = isStreaming && idx === visibleTools.length - 1;
        return (
          <span
            key={t.name}
            className={`tool-badge ${isSubAgent ? "tool-badge--subagent" : ""}`}
            style={{ "--badge-idx": idx } as React.CSSProperties}
          >
            {isLatest && <span className="tool-badge__pulse" />}
            <img
              className="tool-badge__icon"
              src={getToolIcon(t.name)}
              alt=""
              width={16}
              height={16}
            />
            <span className="tool-badge__name mono">
              {toolLabel(t.name)}
              {isLatest && " • in progress"}
            </span>
            {isSubAgent && onOpenSubAgent && (
              <button
                type="button"
                className="tool-badge__canvas-btn mono"
                onClick={() =>
                  onOpenSubAgent(
                    latestSubAgentTask || {
                      id: `subagent-task-${Date.now()}`,
                      agentName: "DeepResearchAgent",
                      topic: "Autonomous Research Mission",
                      status: "searching",
                      startTime: Date.now(),
                      steps: [
                        {
                          time: new Date().toLocaleTimeString(),
                          tool: "research_agent",
                          detail: "Initializing autonomous search vectors..."
                        }
                      ],
                      sources: []
                    }
                  )
                }
                title="Open Sub-Agent Live Execution Canvas"
              >
                🔬 Live Canvas ↗
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
