/**
 * API client for the Darwin backend
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// =============================================================================
// Types
// =============================================================================

export interface Signal {
  id: string;
  text: string;
  source: string;
  url: string;
  timestamp: string;
  title?: string;
  author?: string;
  product?: string;
}

export interface ScrapeSource {
  id: string;
  name: string;
  requires: string[];
  placeholder?: string;
}

export interface ScrapeSourcesResponse {
  sources: ScrapeSource[];
}

export interface RedditScrapeConfig {
  product_name: string;
  subreddit: string;
  max_posts?: number;
  sort_by?: 'new' | 'hot' | 'top';
}

export interface WebScrapeConfig {
  url: string;
  instruction: string;
  source_name?: string;
  max_items?: number;
  product_name?: string;
}

export interface IngestResult {
  signal_id: string;
  signal_hash: string;
  status: 'queued' | 'duplicate' | 'invalid';
}

export interface BatchIngestResult {
  total: number;
  queued: number;
  duplicates: number;
  invalid: number;
  results: IngestResult[];
}

export interface Task {
  id: string;
  topic_id?: string;
  category: 'BUG' | 'FEATURE' | 'UX' | 'OTHER';
  title: string;
  summary: string;
  severity?: 'critical' | 'major' | 'minor';
  suggested_action?: string;
  confidence?: number;
  product?: string;
  status: 'open' | 'in_progress' | 'done';
  github_issue_url?: string;
  github_issue_number?: number;
  fix_status?: 'running' | 'completed' | 'failed';
  fix_pr_url?: string;
  fix_branch?: string;
  created_at?: number;
  updated_at?: number;
}

export interface Rule {
  id: string;
  product: string;
  content: string;
  category: 'style' | 'convention' | 'workflow' | 'constraint';
  source: 'manual' | 'review_feedback';
  times_applied: number;
  created_at: number;
  last_applied_at?: number;
}

export interface RulesResponse {
  product: string;
  rules: Rule[];
  count: number;
}

export interface PersistedSignal {
  id: string;
  text: string;
  normalized: string;
  source: string;
  url: string;
  title: string;
  author: string;
  product: string;
  topic_id: string;
  first_seen: number;
  last_seen: number;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Fetch available scrape sources
 */
export async function getSources(): Promise<ScrapeSourcesResponse> {
  const res = await fetch(`${API_BASE}/scrape/sources`);
  if (!res.ok) {
    throw new Error(`Failed to fetch sources: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Scrape signals from Reddit
 */
export async function scrapeReddit(config: RedditScrapeConfig): Promise<Signal[]> {
  const res = await fetch(`${API_BASE}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Failed to scrape Reddit');
  }
  return res.json();
}

/**
 * Scrape signals from a web URL
 */
export async function scrapeWeb(config: WebScrapeConfig): Promise<Signal[]> {
  const res = await fetch(`${API_BASE}/scrape/web`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Failed to scrape web');
  }
  return res.json();
}

/**
 * Ingest signals into the pipeline
 */
export async function ingestSignals(signals: Signal[]): Promise<BatchIngestResult> {
  const res = await fetch(`${API_BASE}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signals),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Failed to ingest signals');
  }
  return res.json();
}

/**
 * Fetch persisted signals from Redis
 */
export async function getSignals(options?: {
  product?: string;
  limit?: number;
}): Promise<PersistedSignal[]> {
  const params = new URLSearchParams();
  if (options?.product) params.set('product', options.product);
  if (options?.limit) params.set('limit', options.limit.toString());
  
  const url = `${API_BASE}/signals${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch signals: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch all tasks
 */
export async function getTasks(options?: {
  status?: string;
  category?: string;
  limit?: number;
}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.category) params.set('category', options.category);
  if (options?.limit) params.set('limit', options.limit.toString());
  
  const url = `${API_BASE}/tasks${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch tasks: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Get a single task by ID
 */
export async function getTask(taskId: string): Promise<Task> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch task: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Trigger fix for a task
 */
export async function fixTask(taskId: string): Promise<{
  task_id: string;
  fix_status: string;
  fix_pr_url?: string;
  fix_branch?: string;
  files_changed?: string[];
}> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/fix`, {
    method: 'POST',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Failed to fix task');
  }
  return res.json();
}

/**
 * Fetch rules for a product
 */
export async function getRules(product: string): Promise<RulesResponse> {
  const res = await fetch(`${API_BASE}/products/${encodeURIComponent(product)}/rules`);
  if (!res.ok) {
    throw new Error(`Failed to fetch rules: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Create a new rule for a product
 */
export async function createRule(
  product: string,
  content: string,
  category: Rule['category']
): Promise<Rule> {
  const res = await fetch(`${API_BASE}/products/${encodeURIComponent(product)}/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, category }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Failed to create rule');
  }
  return res.json();
}

/**
 * Delete a rule
 */
export async function deleteRule(product: string, ruleId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/products/${encodeURIComponent(product)}/rules/${ruleId}`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Failed to delete rule');
  }
}

