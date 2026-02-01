# Darwin Architecture

This document provides an in-depth overview of Darwin's architecture, explaining how user feedback is transformed into automated code fixes through an AI-powered pipeline.

## Table of Contents

- [Overview](#overview)
- [High-Level Architecture](#high-level-architecture)
- [Pipeline Stages](#pipeline-stages)
- [Technology Stack](#technology-stack)
- [Redis Usage](#redis-usage)
- [Browserbase Integration](#browserbase-integration)
- [Component Deep Dives](#component-deep-dives)
- [Self-Improvement Loop](#self-improvement-loop)
- [API Endpoints](#api-endpoints)
- [Data Flow Diagram](#data-flow-diagram)

---

## Overview

Darwin is an autonomous feedback-to-fix pipeline that:

1. **Scrapes** user feedback from multiple sources (Reddit, forums, web pages)
2. **Deduplicates** and normalizes incoming signals
3. **Clusters** similar signals into topics using semantic embeddings
4. **Classifies** topics to identify actionable items (bugs, features, UX issues)
5. **Fixes** issues automatically using an AI coding agent
6. **Learns** from PR feedback to improve future fixes

```
User Feedback → Signals → Topics → Tasks → Code Fix → PR → Merge → Learning
```

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Scrape    │  │   Tasks     │  │   Signals   │  │    Rules    │         │
│  │   Panel     │  │   View      │  │   Feed      │  │   Manager   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ HTTP/REST
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND (FastAPI)                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          API Layer (main.py)                         │   │
│  │  /scrape  /scrape/web  /ingest  /topics  /tasks  /webhooks/github    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐  │
│  │                    Background Workers                                 │  │
│  │  ┌──────────────┐              │              ┌───────────────┐       │  │
│  │  │ EmbedWorker  │◀─ queue:to-embed ──────────▶│ClassifyWorker │       │  │
│  │  │  (embed +    │              │              │ (LLM classify │       │  │
│  │  │   cluster)   │              │              │  + auto-fix)  │       │  │
│  │  └──────────────┘              │              └───────────────┘       │  │
│  └────────────────────────────────┼──────────────────────────────────────┘  │
│                                    │                                        │
│  ┌─────────────────────────────────┼─────────────────────────────────────┐  │
│  │                        Service Layer                                  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │  │
│  │  │ Scrapers │ │ Ingest   │ │ Cluster  │ │Classifier│ │ Fix Agent│     │  │
│  │  │ (Reddit, │ │ (dedupe, │ │ (vector  │ │ (OpenAI  │ │ (Claude  │     │  │
│  │  │  Web)    │ │ normalize│ │  search) │ │  LLM)    │ │  Agent)  │     │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                        ┌───────────┼───────────┐
                        ▼           ▼           ▼
              ┌─────────────┐ ┌─────────┐ ┌───────────┐
              │ Redis Stack │ │ GitHub  │ │Browserbase│
              │ (data store,│ │   API   │ │(headless  │
              │  queues,    │ │         │ │ browser)  │
              │  vectors)   │ │         │ │           │
              └─────────────┘ └─────────┘ └───────────┘
```

---

## Pipeline Stages

### Stage 1: Signal Collection (Scraping)

Signals are raw pieces of user feedback collected from various sources.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Reddit     │     │  Discourse   │     │  Any Web     │
│   r/joplin   │     │   Forums     │     │    Page      │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │  Reddit API        │  Browserbase       │  Browserbase
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                     Scrapers Layer                        │
│  ┌─────────────────┐        ┌─────────────────┐          │
│  │  RedditScraper  │        │   WebScraper    │          │
│  │  (Reddit JSON)  │        │  (Stagehand AI) │          │
│  └─────────────────┘        └─────────────────┘          │
└──────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  List[Signal]    │
                    │  - id, text      │
                    │  - source, url   │
                    │  - product       │
                    └──────────────────┘
```

**Components:**

| Component | File | Description |
|-----------|------|-------------|
| `RedditScraper` | `scrapers/reddit.py` | Fetches posts/comments from Reddit's JSON API |
| `WebScraper` | `scrapers/web.py` | Uses Browserbase + Stagehand for AI-powered extraction |
| `Signal` | `models.py` | Pydantic model for normalized signals |

### Stage 2: Ingestion (Deduplication + Queuing)

Incoming signals are normalized, deduplicated via SHA256 hash, and queued for processing.

```
┌────────────────┐
│  Raw Signals   │
└───────┬────────┘
        │
        ▼
┌────────────────────────────────────────────────────────┐
│                   IngestService                        │
│                                                        │
│  1. Normalize text (lowercase, strip whitespace)       │
│  2. Compute SHA256 hash of normalized text             │
│  3. Check Redis for existing hash                      │
│  4. If new: store signal + push to embed queue         │
│                                                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │  normalize  │───▶│  dedupe     │───▶│  queue      │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
└────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────┐
│  Redis                                                 │
│  ├── signal:{hash} → Signal data (HSET)                │
│  └── queue:to-embed → [hash1, hash2, ...] (LIST)       │
└────────────────────────────────────────────────────────┘
```

**Key Functions:**

- `normalize_text()` - Strips whitespace, lowercases, removes noise
- `compute_hash()` - SHA256 hash for deduplication
- `check_and_store_signal()` - Atomic check-and-set in Redis

### Stage 3: Embedding + Clustering

Background worker generates embeddings and clusters signals into topics.

```
┌────────────────────────────────────────────────────────┐
│                    EmbedWorker                         │
│                 (Background Task)                      │
│                                                        │
│  Loop:                                                 │
│    1. Pop signal hash from queue:to-embed              │
│    2. Load signal data from Redis                      │
│    3. Generate embedding (sentence-transformers)       │
│    4. Find similar topics (KNN vector search)          │
│    5. Cluster: attach to topic OR create new topic     │
│    6. If new topic: push to queue:to-classify          │
└────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────┐
│  Clustering Decision Tree                              │
│                                                        │
│  similarity = KNN_search(embedding, k=5)               │
│                                                        │
│  if similarity >= 0.75:                                │
│      → Attach to existing topic (update centroid)      │
│  elif similarity >= 0.60:                              │
│      → Add to triage queue (manual review)             │
│  else:                                                 │
│      → Create new topic + queue for classification     │
└────────────────────────────────────────────────────────┘
```

**Embedding Model:**

- **Model**: `all-MiniLM-L6-v2` (sentence-transformers)
- **Dimensions**: 384
- **Distance Metric**: Cosine similarity
- **Storage**: Redis Vector Search (RediSearch)

**Topic Structure:**

```
topic:{id} (HASH)
├── title         - Generated from first signal
├── summary       - LLM-generated summary
├── status        - open | closed
├── product       - Product name
├── signal_count  - Number of attached signals
├── embedding     - Binary vector for search
├── embedding_b64 - Base64 for Python retrieval
├── created_at    - Unix timestamp
└── updated_at    - Unix timestamp
```

### Stage 4: Classification

Background worker classifies topics using LLM to identify actionable items.

```
┌────────────────────────────────────────────────────────┐
│                  ClassifyWorker                        │
│                (Background Task)                       │
│                                                        │
│  Loop:                                                 │
│    1. Pop topic_id from queue:to-classify              │
│    2. Load topic data from Redis                       │
│    3. Call LLM with classification prompt              │
│    4. If actionable: create Task + GitHub issue        │
│    5. Optional: auto-trigger fix agent                 │
└────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────┐
│  LLM Classification Response (Structured Output)       │
│                                                        │
│  {                                                     │
│    "category": "BUG" | "FEATURE" | "UX" | "OTHER",     │
│    "title": "Clear, actionable title",                 │
│    "summary": "What the issue is about",               │
│    "severity": "critical" | "major" | "minor",         │
│    "suggested_action": "How to fix it",                │
│    "confidence": 0.95                                  │
│  }                                                     │
└────────────────────────────────────────────────────────┘
```

**Categories:**

| Category | Description | Actionable |
|----------|-------------|------------|
| `BUG` | Something is broken | ✅ Yes |
| `FEATURE` | Feature request | ✅ Yes |
| `UX` | User experience issue | ✅ Yes |
| `OTHER` | General feedback, praise, etc. | ❌ No |

### Stage 5: Automated Fixing

For actionable tasks, the Claude Agent SDK autonomously fixes the code.

```
┌────────────────────────────────────────────────────────┐
│                     Fix Pipeline                       │
│                                                        │
│  1. Clone target repository (shallow clone)            │
│  2. Create feature branch: darwin/fix-{task_id}        │
│  3. Load similar past fixes (vector search)            │
│  4. Load style rules for product                       │
│  5. Run Claude Agent with task context                 │
│  6. Agent uses tools: Read, Edit, Glob, Grep, Bash     │
│  7. Commit changes and push branch                     │
│  8. Create Pull Request via GitHub API                 │
│  9. Cleanup temporary directory                        │
└────────────────────────────────────────────────────────┘
```

**Agent Tools:**

| Tool | Purpose |
|------|---------|
| `Read` | Read file contents |
| `Edit` | Modify files |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |
| `Bash` | Run shell commands |

**Agent Prompt Includes:**

1. Task details (category, title, summary, suggested action)
2. Style rules learned from past reviews
3. Similar successful fixes for reference
4. Instructions for minimal, focused changes

---

## Technology Stack

### Backend

| Technology | Purpose |
|------------|---------|
| **FastAPI** | Async REST API framework |
| **Redis Stack** | Data store, queues, vector search |
| **Pydantic** | Data validation and serialization |
| **sentence-transformers** | Local embedding generation |
| **OpenAI API** | LLM for classification |
| **Claude Agent SDK** | Autonomous code fixing |
| **httpx** | Async HTTP client |
| **Stagehand** | AI-powered browser automation |

### Frontend

| Technology | Purpose |
|------------|---------|
| **Next.js 15** | React framework with App Router |
| **TypeScript** | Type-safe JavaScript |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Component library |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **Docker Compose** | Local Redis Stack deployment |
| **Browserbase** | Cloud headless browser service |
| **GitHub API** | Issue/PR creation, webhooks |
| **Weave** | Agent observability (optional) |

---

## Redis Usage

Redis Stack serves as the central nervous system of Darwin, handling:

### 1. Signal Storage (Deduplication)

```
Key Pattern: signal:{sha256_hash}
Type: HASH
Fields:
├── text         - Original signal text
├── normalized   - Normalized text for embedding
├── source       - Source platform (reddit, web)
├── url          - Link to original
├── title        - Post/page title
├── author       - Author username
├── product      - Product this is about
├── topic_id     - Assigned topic (after clustering)
├── first_seen   - When first ingested
└── last_seen    - When last seen (for duplicates)
```

### 2. Topic Storage (Clusters)

```
Key Pattern: topic:{uuid}
Type: HASH
Fields:
├── title         - Representative title
├── summary       - LLM-generated summary
├── status        - open | closed
├── product       - Product name
├── category      - BUG | FEATURE | UX | OTHER
├── signal_count  - Number of signals
├── embedding     - Binary vector (for RediSearch)
├── embedding_b64 - Base64 vector (for Python)
├── created_at    - Unix timestamp
└── updated_at    - Unix timestamp

Index: idx:topics
- VectorField: embedding (FLAT, COSINE, 384 dims)
- TextField: title, summary
- TagField: status
```

### 3. Task Storage (Actionable Items)

```
Key Pattern: task:{uuid}
Type: HASH
Fields:
├── topic_id          - Source topic
├── category          - BUG | FEATURE | UX
├── title             - Task title
├── summary           - Task summary
├── severity          - critical | major | minor
├── suggested_action  - How to fix
├── confidence        - LLM confidence score
├── product           - Product name
├── status            - open | in_progress | done
├── github_issue_url  - Created issue URL
├── github_issue_number - Issue number
├── fix_status        - running | completed | failed
├── fix_pr_url        - Pull request URL
├── fix_branch        - Branch name
├── created_at        - Unix timestamp
└── updated_at        - Unix timestamp
```

### 4. Successful Fixes (Self-Improvement)

```
Key Pattern: fix:success:{task_id}
Type: HASH
Fields:
├── task_id           - Original task ID
├── category          - Task category
├── title             - Task title
├── summary           - Task summary
├── suggested_action  - What was suggested
├── product           - Product name
├── pr_url            - Merged PR URL
├── pr_title          - PR title
├── merged_at         - When merged
├── stored_at         - When stored
├── files_changed     - JSON list of files
├── embedding         - Binary vector
└── embedding_b64     - Base64 vector

Index: idx:successful_fixes
- VectorField: embedding (FLAT, COSINE, 384 dims)
- TextField: title, summary
- TagField: category, product
```

### 5. Style Rules (Learning)

```
Key Pattern: rule:{product}:{uuid}
Type: HASH
Fields:
├── id              - Rule ID
├── product         - Product name
├── content         - Rule text (e.g., "Use early returns")
├── category        - style | convention | workflow | constraint
├── source          - manual | review_feedback
├── source_task_id  - Task that generated this rule
├── reviewer        - GitHub username
├── times_applied   - Usage counter
├── last_applied_at - Last used timestamp
└── created_at      - When created
```

### 6. Processing Queues

```
queue:to-embed     (LIST) - Signal hashes awaiting embedding
queue:to-classify  (LIST) - Topic IDs awaiting classification
queue:triage       (LIST) - Signals with low-confidence matches
```

### Redis Stack Features Used

| Feature | Purpose |
|---------|---------|
| **Hashes** | Structured data storage for signals, topics, tasks |
| **Lists** | FIFO queues for background worker pipelines |
| **RediSearch** | Full-text search and vector similarity search |
| **Vector Search** | KNN similarity for clustering and learning |

### Docker Configuration

```yaml
services:
  redis:
    image: redis/redis-stack:latest
    ports:
      - "6379:6379"   # Redis server
      - "8001:8001"   # RedisInsight UI
    volumes:
      - redis_data:/data
    environment:
      - REDIS_ARGS=--save 60 1 --loglevel warning
```

---

## Browserbase Integration

Browserbase provides cloud-hosted headless browsers for scraping JavaScript-heavy websites.

### How It's Used

The `WebScraper` component uses Browserbase through the **Stagehand** SDK for AI-powered web extraction:

```python
# scrapers/web.py

class WebScraper(BaseScraper):
    """Generic web scraper using Stagehand browser automation."""

    async def scrape_url(self, url: str, extraction_instruction: str, ...):
        async with AsyncStagehand() as client:
            # Create a new browser session on Browserbase
            session = await client.sessions.start(model_name="openai/gpt-5-nano")

            # Live debugging URL
            live_url = f"https://www.browserbase.com/sessions/{session.id}"

            # Navigate to the target page
            await session.navigate(url=url)

            # Dismiss popups (AI-powered)
            await session.act(
                input="If there are any cookie consent banners, popups, "
                      "or overlay dialogs visible, close or dismiss them."
            )

            # Extract content using natural language
            extract_response = await session.extract(
                instruction=f"""
                    {extraction_instruction}

                    Extract up to {max_items} items. For each item, extract:
                    - title: the main title or heading
                    - body: the content/description text
                    - author: who posted it (if available)
                    - url: link to the item (if available)
                    - timestamp: when it was posted (if available)
                """,
                schema={
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "body": {"type": "string"},
                                    "author": {"type": "string"},
                                    "url": {"type": "string"},
                                    "timestamp": {"type": "string"},
                                },
                                "required": ["title"],
                            },
                        }
                    },
                    "required": ["items"],
                },
            )

            await session.end()
```

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Headless Chrome** | Full browser environment in the cloud |
| **JavaScript Rendering** | Handles SPAs, dynamic content |
| **AI Extraction** | Natural language instructions for data extraction |
| **Action Automation** | Click, scroll, dismiss popups via AI commands |
| **Session Replay** | Debug via live view at browserbase.com |
| **Structured Output** | JSON schema-based extraction |

### Comparison: Reddit vs Web Scraper

| Aspect | RedditScraper | WebScraper (Browserbase) |
|--------|--------------|--------------------------|
| **Method** | Reddit JSON API | Headless browser |
| **Speed** | Fast | Slower (browser startup) |
| **JavaScript** | Not needed | Full support |
| **Rate Limits** | Reddit API limits | Browserbase quotas |
| **Bot Detection** | Rare | Handles CAPTCHAs |
| **Best For** | Reddit content | Forums, Discourse, any web page |

### Environment Variables

```bash
BROWSERBASE_API_KEY=...   # Browserbase API key
BROWSERBASE_PROJECT_ID=...  # Project ID
```

---

## Component Deep Dives

### Background Workers

Workers run as asyncio tasks within the FastAPI lifespan:

```python
@asynccontextmanager
async def lifespan(_: FastAPI):
    # Startup
    redis_client = await init_redis()

    _embed_worker = EmbedWorker(redis_client)
    _embed_worker.start()

    _classify_worker = ClassifyWorker(redis_client)
    _classify_worker.start()

    yield  # Application runs

    # Shutdown
    await _classify_worker.stop()
    await _embed_worker.stop()
    await close_redis()
```

**EmbedWorker Loop:**

```python
while self._running:
    queue_len = await get_embed_queue_length(self.redis)
    if queue_len > 0:
        processed = await self.process_batch()
    else:
        await asyncio.sleep(POLL_INTERVAL)
```

### GitHub Integration

**Issue Creation:**

```python
# When a topic is classified as actionable
title = format_issue_title(task_data)  # "[BUG] Sync fails silently"
body = format_issue_body(task_data, topic_id)
labels = get_labels_for_task(task_data)  # ["bug", "darwin"]

issue = await github_client.create_issue(repo, title, body, labels)
await update_task_github_issue(redis, task_id, issue.html_url, issue.number)
```

**PR Creation (after fix):**

```python
pr_data = await create_pr(
    repo=repo,
    branch=branch_name,
    title=f"[Darwin] {task_title}",
    body=pr_body,  # Includes task details, files changed
    base=default_branch
)
```

### GitHub Webhooks (Self-Improvement)

Webhooks capture feedback on Darwin's PRs:

```python
@app.post("/webhooks/github")
async def github_webhook(request: Request):
    # Verify signature
    if not verify_signature(body, signature):
        raise HTTPException(status_code=401)

    if event_type == "pull_request":
        if action == "closed" and merged:
            # PR was merged - SUCCESS!
            await store_successful_fix(task_id, pr_data, redis)

    elif event_type == "pull_request_review":
        if review_state == "changes_requested":
            # Extract rules from feedback
            await _extract_and_store_rules(feedback, task_id, ...)
```

---

## Self-Improvement Loop

Darwin learns from PR feedback to improve future fixes:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Self-Improvement Loop                        │
│                                                                 │
│   ┌──────────────┐                                              │
│   │ PR Created   │                                              │
│   └──────┬───────┘                                              │
│          │                                                      │
│          ▼                                                      │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │               Human Review on GitHub                     │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│   │  │   Approve   │  │  Request    │  │   Close     │       │  │
│   │  │             │  │  Changes    │  │  (reject)   │       │  │
│   │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │  │
│   └─────────┼────────────────┼────────────────┼──────────────┘  │
│             │                │                │                 │
│             ▼                ▼                ▼                 │
│      ┌──────────┐     ┌──────────────┐   ┌──────────┐           │
│      │  Merge   │     │ Webhook:     │   │ Mark as  │           │
│      │          │     │ Extract rules│   │ rejected │           │
│      └────┬─────┘     └──────┬───────┘   └──────────┘           │
│           │                  │                                  │
│           ▼                  ▼                                  │
│   ┌──────────────┐   ┌──────────────┐                           │
│   │ Store as     │   │ Create style │                           │
│   │ successful   │   │ rules for    │                           │
│   │ fix example  │   │ future use   │                           │
│   └──────────────┘   └──────────────┘                           │
│           │                  │                                  │
│           └────────┬─────────┘                                  │
│                    │                                            │
│                    ▼                                            │
│   ┌───────────────────────────────────────────────────────────┐ │
│   │              Future Fix Agent Runs                        │ │
│   │  ┌─────────────────────┐  ┌─────────────────────┐         │ │
│   │  │ Similar Past Fixes  │  │ Style Rules         │         │ │
│   │  │ (vector search)     │  │ (by usage count)    │         │ │
│   │  └─────────────────────┘  └─────────────────────┘         │ │
│   └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### What Gets Learned

1. **Successful Fix Patterns**
   - When a PR is merged, the task details and approach are stored
   - Vector embedding allows finding similar past fixes
   - Future tasks see "Similar Fix #1, #2, #3" in agent prompt

2. **Style Rules from Reviews**
   - When a reviewer requests changes, the feedback is analyzed
   - LLM extracts generalizable rules (e.g., "Use early returns")
   - Rules are categorized: style, convention, workflow, constraint
   - Top rules (by usage count) are included in agent prompts

### Rule Extraction Prompt

```python
# learning/rule_extractor.py

EXTRACTION_PROMPT = """
Extract coding style rules from this code review feedback.

Feedback: {feedback}
Task context: {task}

Return rules that are:
- Generalizable (not specific to this exact change)
- Actionable (can be applied by an AI)
- Clear and concise

Categories:
- style: Code formatting, naming conventions
- convention: Project-specific patterns
- workflow: Process requirements (tests, docs)
- constraint: Limitations, don'ts
"""
```

---

## API Endpoints

### Scraping

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/scrape/sources` | List available scrape sources |
| `POST` | `/scrape` | Scrape Reddit subreddit |
| `POST` | `/scrape/web` | Scrape any URL via Browserbase |

### Data Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/ingest` | Ingest signals (dedupe + queue) |
| `GET` | `/signals` | List persisted signals |
| `GET` | `/topics` | List clustered topics |
| `GET` | `/topics/{id}` | Get specific topic |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tasks` | List tasks (filter by status/category) |
| `GET` | `/tasks/{id}` | Get specific task |
| `PATCH` | `/tasks/{id}` | Update task status |
| `POST` | `/tasks/{id}/create-issue` | Create GitHub issue |
| `POST` | `/tasks/{id}/fix` | Trigger fix agent |

### Learning & Rules

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/products/{product}/rules` | List rules for product |
| `POST` | `/products/{product}/rules` | Create manual rule |
| `DELETE` | `/products/{product}/rules/{id}` | Delete rule |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhooks/github` | Handle GitHub PR/review events |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (includes Redis status) |

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Complete Data Flow                              │
└──────────────────────────────────────────────────────────────────────────────┘

                                    USER
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                    ┌──────────┐            ┌──────────┐
                    │ Frontend │            │  GitHub  │
                    │  (React) │            │ Webhooks │
                    └────┬─────┘            └────┬─────┘
                         │                       │
       ──────────────────┼───────────────────────┼──────────────── API Layer ──
                         │                       │
                         ▼                       ▼
                 ┌──────────────────────────────────────────┐
                 │              FastAPI Backend             │
                 └──────────────────────────────────────────┘
                         │
       ──────────────────┼──────────────────────────────────────── Scrapers ──
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
    ┌────────────┐ ┌───────────────┐ ┌─────────────────┐
    │   Reddit   │ │ Discourse     │ │  Any Web        │
    │    API     │ │ (Browserbase) │ │  (Browserbase)  │
    └─────┬──────┘ └─────┬─────────┘ └──┬──────────────┘
          │              │              │
          └──────────────┴──────────────┘
                         │
                   List[Signal]
                         │
       ──────────────────┼──────────────────────────────────────── Ingest ──
                         │
                         ▼
                 ┌───────────────┐
                 │  Normalize    │
                 │  + Dedupe     │──────────▶ signal:{hash}
                 └───────┬───────┘                  │
                         │                          │
                   queue:to-embed ◀─────────────────┘
                         │
       ──────────────────┼─────────────────────────────────────── Embedding ──
                         │
                         ▼
                 ┌───────────────┐
                 │  EmbedWorker  │
                 │  (sentence-   │
                 │  transformers)│
                 └───────┬───────┘
                         │
                    [embedding]
                         │
       ──────────────────┼───────────────────────────────────── Clustering ──
                         │
                         ▼
                 ┌───────────────────────────────────────┐
                 │         Vector KNN Search             │
                 │  ┌─────────────────────────────────┐  │
                 │  │ similarity >= 0.75 → attach     │  │
                 │  │ similarity >= 0.60 → triage     │  │
                 │  │ otherwise → create new topic    │  │
                 │  └─────────────────────────────────┘  │
                 └───────────────┬───────────────────────┘
                                 │
                           topic:{id}
                                 │
                       queue:to-classify
                                 │
       ──────────────────────────┼─────────────────────────── Classification ──
                                 │
                                 ▼
                 ┌───────────────────────────────────────┐
                 │        ClassifyWorker (LLM)           │
                 │  ┌─────────────────────────────────┐  │
                 │  │  Is this actionable?            │  │
                 │  │  BUG / FEATURE / UX → YES       │  │
                 │  │  OTHER → NO                     │  │
                 │  └─────────────────────────────────┘  │
                 └───────────────┬───────────────────────┘
                                 │
                                 │ if actionable
                                 ▼
                         ┌───────────────┐
                         │  Create Task  │───────▶ task:{id}
                         └───────┬───────┘
                                 │
       ──────────────────────────┼────────────────────────── GitHub Integration ──
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
           ┌───────────────┐           ┌───────────────┐
           │ Create Issue  │           │  Run Fix      │
           │ (GitHub API)  │           │  Agent        │
           └───────────────┘           └───────┬───────┘
                                               │
       ────────────────────────────────────────┼─────────────────── Fix Agent ──
                                               │
                                               ▼
                 ┌─────────────────────────────────────────────────────┐
                 │                  Claude Agent SDK                   │
                 │                                                     │
                 │  1. Clone repo (git clone --depth 1)                │
                 │  2. Load context:                                   │
                 │     - Task details                                  │
                 │     - Similar past fixes (fix:success:*)            │
                 │     - Style rules (rule:{product}:*)                │
                 │  3. Explore codebase (Glob, Grep, Read)             │
                 │  4. Make changes (Edit)                             │
                 │  5. Commit + Push                                   │
                 │  6. Create PR                                       │
                 └─────────────────────────────────────────────────────┘
                                               │
                                        Pull Request
                                               │
       ────────────────────────────────────────┼───────────────────── Feedback ──
                                               │
                                               ▼
                                      Human Review
                                               │
                         ┌─────────────────────┼─────────────────────┐
                         ▼                     ▼                     ▼
                    ┌─────────┐          ┌───────────┐         ┌─────────┐
                    │ Merged  │          │ Changes   │         │ Closed  │
                    │         │          │ Requested │         │         │
                    └────┬────┘          └─────┬─────┘         └─────────┘
                         │                     │
                         ▼                     ▼
               ┌─────────────────┐   ┌─────────────────┐
               │ Store Successful│   │ Extract Style   │
               │ Fix (embedding) │   │ Rules (LLM)     │
               └────────┬────────┘   └────────┬────────┘
                        │                     │
                        ▼                     ▼
                 fix:success:{id}      rule:{product}:{id}
                        │                     │
                        └──────────┬──────────┘
                                   │
       ────────────────────────────┼────────────────────────── Self-Improvement ──
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │     Future Agent Prompts      │
                    │  - Include similar past fixes │
                    │  - Apply learned style rules  │
                    └───────────────────────────────┘
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | No | Redis connection URL (default: `redis://localhost:6379`) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM classification |
| `LLM_MODEL` | No | OpenAI model name (default: `gpt-5-nano`) |
| `LLM_PROVIDER` | No | LLM provider (default: `openai`) |
| `EMBEDDING_PROVIDER` | No | Embedding provider (default: `local`) |
| `EMBEDDING_MODEL` | No | Sentence transformer model (default: `all-MiniLM-L6-v2`) |
| `GITHUB_TOKEN` | Yes | GitHub PAT for issues/PRs |
| `GITHUB_WEBHOOK_SECRET` | No | Webhook signature verification |
| `BROWSERBASE_API_KEY` | Yes | Browserbase API key |
| `BROWSERBASE_PROJECT_ID` | No | Browserbase project |
| `PRODUCT_REPOS` | No | JSON mapping of product → GitHub repo |
| `WANDB_API_KEY` | No | Weights & Biases key for Weave |
| `WEAVE_PROJECT` | No | Weave project name |
| `CLUSTER_THRESHOLD_HIGH` | No | Clustering high confidence (default: `0.75`) |
| `CLUSTER_THRESHOLD_LOW` | No | Clustering low confidence (default: `0.60`) |

---

## Getting Started

```bash
# Start Redis Stack
docker compose up -d

# Install backend dependencies
cd backend
uv sync

# Set environment variables
cp .env.example .env
# Edit .env with your API keys

# Run the backend
uv run uvicorn main:app --reload

# In another terminal, start the frontend
cd frontend
pnpm install
pnpm dev
```

**Access:**

- Backend API: http://localhost:8000
- Frontend: http://localhost:3000
- RedisInsight: http://localhost:8001

---

## Future Improvements

- [ ] Support more scrape sources (Discord, Twitter/X, HackerNews)
- [ ] Add webhook for Slack/Discord notifications
- [ ] Implement rate limiting and auth for API
- [ ] Add support for multiple LLM providers
- [ ] Create mobile-friendly dashboard
- [ ] Implement A/B testing for agent prompts
- [ ] Add metrics and analytics dashboard

