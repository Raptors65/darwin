"use client";

import { useState, useEffect, useCallback } from "react";
import { DNAHelix } from "./dna-helix";
import {
  GitPullRequest,
  Bug,
  Sparkles,
  Radio,
  ExternalLink,
  Loader2,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { RulesModal } from "./rules-modal";
import {
  getSources,
  scrapeReddit,
  scrapeWeb,
  ingestSignals,
  getTasks,
  getRules,
  getSignals,
  type Signal as APISignal,
  type PersistedSignal,
  type Task,
  type Rule,
  type ScrapeSource,
} from "@/lib/api";

// =============================================================================
// PRECONFIGURED SOURCES FOR "ALL" SCRAPE
// Add or modify sources here to change what gets scraped when "All" is selected.
//
// Each source has:
//   - type: "web" (Browserbase) or "reddit" (Reddit API)
//   - query: URL for web scraper, or subreddit name for Reddit scraper
// =============================================================================
interface PreconfiguredSource {
  type: "web" | "reddit";
  query: string;
  description?: string; // Optional, for comments
}

const PRECONFIGURED_SOURCES: PreconfiguredSource[] = [
  // Web sources (using Browserbase)
  { type: "web", query: "https://discourse.joplinapp.org/latest", description: "Joplin Discourse forum" },

  // Reddit sources (using Reddit scraper - avoids bot detection)
  { type: "reddit", query: "joplinapp", description: "r/joplinapp subreddit" },

  // Add more sources here as needed:
  // { type: "web", query: "https://news.ycombinator.com/item?id=XXXXX", description: "HN thread" },
  // { type: "reddit", query: "selfhosted", description: "r/selfhosted" },
];

interface HoveredSignal {
  id: string;
  label: string;
  issue: string;
  type: "bug" | "feature" | "pr";
  position: { x: number; y: number };
  status: "generating" | "ready";
  prUrl?: string;
  issueUrl?: string;
}

export function CodeMutatorDashboard() {
  // Product context
  const [currentProduct, setCurrentProduct] = useState("joplin");

  // Scraping state
  const [sources, setSources] = useState<ScrapeSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("all"); // Default to "All"
  const [scrapeInput, setScrapeInput] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // Signals state (persisted signals from Redis)
  const [signals, setSignals] = useState<PersistedSignal[]>([]);
  const [activeSignalIndex, setActiveSignalIndex] = useState<number | null>(null);
  const [isLoadingSignals, setIsLoadingSignals] = useState(true);

  // Tasks state (classified actionable items)
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);

  // Rules state
  const [rules, setRules] = useState<Rule[]>([]);

  // Hover state for helix
  const [hoveredSignal, setHoveredSignal] = useState<HoveredSignal | null>(null);
  const [isHoveringTooltip, setIsHoveringTooltip] = useState(false);
  const [persistedSignal, setPersistedSignal] = useState<HoveredSignal | null>(null);

  const displayedSignal = hoveredSignal || (isHoveringTooltip ? persistedSignal : null);

  // Computed metrics from tasks
  const openTasksCount = tasks.filter(t => t.status === "open").length;
  const prsInProgress = tasks.filter(t => t.fix_status === "running").length;
  const completedPRs = tasks.filter(t => t.fix_pr_url).length;

  // "All" option that scrapes preconfigured sources
  const allSourceOption: ScrapeSource = {
    id: "all",
    name: "All Sources",
    requires: [],
    placeholder: "",
  };

  // Fetch available sources on mount
  useEffect(() => {
    getSources()
      .then((res) => {
        // Add "All" option at the beginning
        setSources([allSourceOption, ...res.sources]);
        // Keep "all" as default (don't override)
      })
      .catch((err) => {
        console.error("Failed to fetch sources:", err);
        // Fallback to default sources with "All" option
        setSources([
          allSourceOption,
          { id: "reddit", name: "Reddit", requires: ["subreddit"], placeholder: "Enter subreddit (e.g., joplinapp)" },
          { id: "web", name: "Web URL", requires: ["url", "instruction"], placeholder: "Enter URL to scrape" },
        ]);
      });
  }, []);

  // Fetch tasks initially and poll every 5 seconds
  const fetchTasks = useCallback(async () => {
    try {
      const tasksData = await getTasks({ limit: 50 });
      setTasks(tasksData);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setIsLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Fetch signals from Redis
  const fetchSignals = useCallback(async () => {
    try {
      const signalsData = await getSignals({ product: currentProduct, limit: 20 });
      setSignals(signalsData);
    } catch (err) {
      console.error("Failed to fetch signals:", err);
    } finally {
      setIsLoadingSignals(false);
    }
  }, [currentProduct]);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 5000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // Fetch rules for current product
  const fetchRules = useCallback(() => {
    getRules(currentProduct)
      .then((res) => setRules(res.rules))
      .catch((err) => console.error("Failed to fetch rules:", err));
  }, [currentProduct]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Pulse through signals for visual effect
  useEffect(() => {
    if (signals.length === 0) return;
    const interval = setInterval(() => {
      setActiveSignalIndex((prev) => {
        if (prev === null) return 0;
        return (prev + 1) % signals.length;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [signals.length]);

  // Handle scrape submission
  const handleScrape = async () => {
    // For "all" source, we don't need input; for others, we do
    if (selectedSource !== "all" && !scrapeInput.trim()) return;

    setIsScraping(true);
    setScrapeError(null);

    try {
      let allScrapedSignals: APISignal[] = [];

      if (selectedSource === "all") {
        // Scrape all preconfigured sources using appropriate scraper for each
        for (const source of PRECONFIGURED_SOURCES) {
          try {
            let signals: APISignal[];

            if (source.type === "reddit") {
              signals = await scrapeReddit({
                product_name: currentProduct,
                subreddit: source.query,
                max_posts: 5,
              });
            } else {
              signals = await scrapeWeb({
                url: source.query,
                instruction: "Extract user feedback, bug reports, feature requests, and complaints about the product",
                product_name: currentProduct,
                max_items: 5,
              });
            }

            allScrapedSignals = [...allScrapedSignals, ...signals];
            console.log(`Scraped ${signals.length} signals from ${source.description || source.query}`);
          } catch (err) {
            console.error(`Failed to scrape ${source.description || source.query}:`, err);
            // Continue with other sources even if one fails
          }
        }
      } else if (selectedSource === "reddit") {
        allScrapedSignals = await scrapeReddit({
          product_name: currentProduct,
          subreddit: scrapeInput.trim(),
          max_posts: 5,
        });
      } else if (selectedSource === "web") {
        allScrapedSignals = await scrapeWeb({
          url: scrapeInput.trim(),
          instruction: "Extract user feedback, bug reports, and feature requests",
          product_name: currentProduct,
          max_items: 5,
        });
      } else {
        throw new Error(`Unknown source: ${selectedSource}`);
      }

      if (allScrapedSignals.length === 0) {
        setScrapeError("No signals found from any source");
        return;
      }

      // Ingest the signals
      const ingestResult = await ingestSignals(allScrapedSignals);
      console.log("Ingest result:", ingestResult);

      // Clear input on success (only matters for non-"all" sources)
      setScrapeInput("");

      // Refresh signals and tasks after ingestion
      await fetchSignals();
      setActiveSignalIndex(0);

      // Refresh tasks after a short delay to allow classification
      setTimeout(fetchTasks, 2000);

    } catch (err) {
      console.error("Scrape failed:", err);
      setScrapeError(err instanceof Error ? err.message : "Scrape failed");
    } finally {
      setIsScraping(false);
    }
  };

  // Get current source config
  const currentSource = sources.find(s => s.id === selectedSource);
  const placeholder = currentSource?.placeholder || "Enter query...";
  const isAllSource = selectedSource === "all";

  // Map tasks to helix signals
  const helixSignals = tasks.slice(0, 6).map((task, i) => ({
    id: task.id,
    x: i % 2 === 0 ? 0.25 : 0.75,
    y: 0.20 + (i * 0.12),
    label: task.title,
    issue: task.summary || task.suggested_action || "",
    status: task.fix_status === "completed" ? ("ready" as const) : ("generating" as const),
    prUrl: task.fix_pr_url,
    issueUrl: task.github_issue_url,
    type: task.category === "BUG"
      ? ("bug" as const)
      : task.category === "FEATURE"
        ? ("feature" as const)
        : ("pr" as const),
  }));

  // Tasks with completed PRs for mutation history
  const completedTasks = tasks.filter(t => t.fix_pr_url);

  const handleSignalHover = (
    signal: {
      id: string;
      label: string;
      issue: string;
      type: "bug" | "feature" | "pr";
      status?: "generating" | "ready";
      prUrl?: string;
    } | null,
    position: { x: number; y: number } | null
  ) => {
    if (signal && position) {
      const newSignal = {
        ...signal,
        position,
        status: signal.status || "generating",
        prUrl: signal.prUrl,
      };
      setHoveredSignal(newSignal);
      setPersistedSignal(newSignal);
    } else {
      setHoveredSignal(null);
    }
  };

  const formatTimestamp = (ts?: number) => {
    if (!ts) return "";
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString();
  };

  return (
    <div className="h-screen bg-background text-foreground font-mono flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-foreground flex items-center justify-center">
            <span className="text-background font-bold text-sm">D</span>
          </div>
          <h1 className="text-lg font-medium tracking-tight">Darwin</h1>
          <span className="text-muted-foreground">·</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Product:</span>
            <input
              type="text"
              value={currentProduct}
              onChange={(e) => setCurrentProduct(e.target.value)}
              className="text-sm font-medium bg-transparent border-b border-dashed border-muted-foreground/50 focus:border-foreground focus:outline-none px-1"
            />
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{tasks.length} tasks</span>
          <span>·</span>
          <span>{signals.length} signals</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-72 border-r border-border flex flex-col bg-sidebar overflow-hidden">
          {/* Pipeline Status */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 bg-foreground" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Pipeline Status
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Open Tasks
                </span>
                <span className="text-sm font-medium">{openTasksCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3 h-3" />
                  PRs in Progress
                </span>
                <span className="text-sm font-medium text-yellow-500">{prsInProgress}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" />
                  Completed PRs
                </span>
                <span className="text-sm font-medium text-green-500">{completedPRs}</span>
              </div>
            </div>
          </div>

          {/* Active Signals */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Sticky Header */}
            <div className="flex items-center gap-2 p-4 pb-2 bg-sidebar">
              <div className="w-2 h-2 bg-blue-500" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Active Signals
              </span>
              {signals.length > 0 && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {signals.length}
                </span>
              )}
            </div>
            {/* Scrollable Content */}
            <div className="flex-1 overflow-auto min-h-0 px-4 pb-4">
              {isLoadingSignals ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading signals...
                </div>
              ) : signals.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No signals yet. Use the scrape bar below to fetch signals.
                </p>
              ) : (
                <div className="space-y-2">
                  {signals.map((signal, index) => (
                    <a
                      key={signal.id}
                      href={signal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block p-3 rounded border transition-all duration-300 ${activeSignalIndex === index
                        ? "border-foreground/40 bg-foreground/5"
                        : "border-border bg-card hover:border-foreground/20"
                        }`}
                    >
                      <div className="flex items-start gap-2">
                        <Radio
                          className={`w-3 h-3 mt-1 flex-shrink-0 ${activeSignalIndex === index
                            ? "text-foreground animate-pulse"
                            : "text-muted-foreground"
                            }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {signal.title || signal.text.slice(0, 50)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                            {signal.source}
                          </p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PR Activity */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                PR Activity
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex -space-x-1">
                {tasks.filter(t => t.fix_status === "running").slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    className="w-6 h-6 rounded-full border-2 border-sidebar bg-yellow-500/20 flex items-center justify-center"
                    title={t.title}
                  >
                    <GitPullRequest className="w-3 h-3 text-yellow-500" />
                  </div>
                ))}
                {prsInProgress === 0 && (
                  <div className="w-6 h-6 rounded-full border-2 border-sidebar bg-muted flex items-center justify-center">
                    <GitPullRequest className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {prsInProgress === 0
                  ? "No PRs generating"
                  : `${prsInProgress} PR${prsInProgress > 1 ? "s" : ""} generating...`}
              </span>
            </div>
          </div>

          {/* Rules Section */}
          <RulesModal
            product={currentProduct}
            rules={rules}
            onRulesChange={fetchRules}
          />

          {/* Version */}
          <div className="p-4 border-t border-border flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center">
              <span className="text-xs font-bold">D</span>
            </div>
            <span className="text-xs text-muted-foreground">Version 1.0</span>
          </div>
        </aside>

        {/* Main Canvas Area */}
        <main className="flex-1 relative overflow-hidden">
          {/* DNA Helix Visualization */}
          <div className="absolute inset-0">
            {isLoadingTasks ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DNAHelix
                signals={helixSignals}
                onSignalHover={handleSignalHover}
                isPaused={displayedSignal !== null}
              />
            )}
          </div>

          {/* Hover Annotation */}
          {displayedSignal && (
            <div
              className="absolute z-10 transition-all duration-150"
              style={{
                left: displayedSignal.position.x,
                top: displayedSignal.position.y,
                transform: "translate(20px, -50%)",
              }}
              onMouseEnter={() => setIsHoveringTooltip(true)}
              onMouseLeave={() => {
                setIsHoveringTooltip(false);
                setPersistedSignal(null);
              }}
            >
              <div className="bg-card/95 backdrop-blur-sm border border-foreground/30 rounded-lg p-4 min-w-[240px] max-w-[320px] shadow-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full border border-foreground/40 flex items-center justify-center bg-background/80">
                    {displayedSignal.type === "bug" ? (
                      <Bug className="w-4 h-4" />
                    ) : displayedSignal.type === "feature" ? (
                      <Sparkles className="w-4 h-4" />
                    ) : (
                      <GitPullRequest className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {displayedSignal.type === "bug"
                        ? "Bug Fix"
                        : displayedSignal.type === "feature"
                          ? "Feature Request"
                          : "Pull Request"}
                    </p>
                    <p className="text-sm font-medium truncate">{displayedSignal.label}</p>
                  </div>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground mb-1">Summary:</p>
                  <p className="text-sm text-foreground line-clamp-3">
                    {displayedSignal.issue}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${displayedSignal.status === "generating"
                        ? "bg-yellow-500 animate-pulse"
                        : "bg-green-500"
                        }`}
                    />
                    <span
                      className={`text-xs ${displayedSignal.status === "generating"
                        ? "text-yellow-400"
                        : "text-green-400"
                        }`}
                    >
                      {displayedSignal.status === "generating"
                        ? "Generating PR..."
                        : "PR Ready for Review"}
                    </span>
                  </div>
                  {displayedSignal.status === "generating" && displayedSignal.issueUrl && (
                    <a
                      href={displayedSignal.issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-foreground hover:text-yellow-400 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View Issue
                    </a>
                  )}
                  {displayedSignal.status === "ready" && displayedSignal.prUrl && (
                    <a
                      href={displayedSignal.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-foreground hover:text-green-400 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View PR
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Bar - Scrape Trigger */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl">
            <div className="bg-card/80 backdrop-blur border border-border rounded-lg overflow-hidden">
              <div className="flex items-center">
                {/* Source Selector */}
                <div className="relative border-r border-border">
                  <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    className="appearance-none bg-transparent px-4 py-3 pr-8 text-sm text-foreground focus:outline-none cursor-pointer"
                  >
                    {sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>

                {/* Input - hidden when "All" is selected */}
                {!isAllSource && (
                  <input
                    type="text"
                    value={scrapeInput}
                    onChange={(e) => setScrapeInput(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isScraping) {
                        handleScrape();
                      }
                    }}
                    disabled={isScraping}
                  />
                )}

                {/* Info text when "All" is selected */}
                {isAllSource && (
                  <div className="flex-1 px-4 py-3 text-sm text-muted-foreground">
                    Scrape {PRECONFIGURED_SOURCES.length} sources ({PRECONFIGURED_SOURCES.filter(s => s.type === "web").length} web, {PRECONFIGURED_SOURCES.filter(s => s.type === "reddit").length} Reddit)
                  </div>
                )}

                {/* Scrape Button */}
                <button
                  onClick={handleScrape}
                  disabled={isScraping || (!isAllSource && !scrapeInput.trim())}
                  className="px-4 py-3 text-sm font-medium text-foreground hover:bg-foreground/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 border-l border-border cursor-pointer"
                >
                  {isScraping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Radio className="w-4 h-4" />
                  )}
                  <span>{isScraping ? "Scraping..." : "Scrape"}</span>
                </button>
              </div>

              {/* Progress bar while scraping */}
              {isScraping && (
                <div className="h-0.5 bg-muted">
                  <div
                    className="h-full bg-foreground animate-pulse w-full"
                    style={{ animation: "pulse 1s ease-in-out infinite" }}
                  />
                </div>
              )}

              {/* Error message */}
              {scrapeError && (
                <div className="px-4 py-2 text-xs text-red-400 flex items-center gap-2 border-t border-border">
                  <AlertCircle className="w-3 h-3" />
                  {scrapeError}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right Sidebar - Mutation History */}
        <aside className="w-80 border-l border-border bg-sidebar overflow-auto">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 bg-foreground" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Completed PRs
              </span>
              {completedTasks.length > 0 && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {completedTasks.length}
                </span>
              )}
            </div>
            {completedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No completed PRs yet. Tasks with generated PRs will appear here.
              </p>
            ) : (
              <div className="space-y-1">
                {completedTasks.map((task, index) => (
                  <a
                    key={task.id}
                    href={task.fix_pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-3 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-2 h-2 rounded-full mt-1 ${task.category === "BUG"
                          ? "bg-red-500"
                          : task.category === "FEATURE"
                            ? "bg-blue-500"
                            : "bg-foreground"
                          }`}
                      />
                      {index < completedTasks.length - 1 && (
                        <div className="w-px h-full bg-border mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-green-400 transition-colors">
                        {task.title}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <GitPullRequest className="w-3 h-3" />
                        {task.fix_branch || "PR"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatTimestamp(task.updated_at)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
