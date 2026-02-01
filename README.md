# Darwin

**Turn user feedback into actionable code changes, automatically.**

Darwin scrapes user signals from Reddit, forums, and web pages, clusters similar feedback into topics, and uses AI to identify actionable items like bugs, feature requests, and UX issues. These get turned into tasks for an autonomous coding agent to resolve—and it learns from human feedback to improve over time.

## How It Works

```
Signal → Topic → Task → Code Fix → PR → Human Review → Learning
```

1. **Scrape** - Collect user feedback from Reddit, Discourse forums, GitHub issues, or any web page (via Browserbase)
2. **Deduplicate** - Hash-based deduplication to avoid processing duplicates
3. **Cluster** - Group similar signals into topics using semantic embeddings
4. **Classify** - LLM identifies actionable topics (bugs, features, UX) → becomes a Task
5. **Resolve** - Coding agent (Claude) works on prioritized tasks, creates PRs
6. **Learn** - When PRs are reviewed, Darwin extracts style rules and stores successful fixes for future reference

## Self-Improvement Loop

Darwin gets better over time:

- **Successful fixes** are stored with embeddings for similarity search—future tasks see relevant past fixes
- **Style rules** are extracted from PR review feedback (e.g., "use early returns", "prefer const over let")
- **Auto-fix on feedback** - When a reviewer requests changes, Darwin automatically attempts to address the feedback and updates the PR (up to 3 iterations)

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Reddit/   │────▶│   Ingest    │────▶│   Cluster   │────▶│  Classify   │
│   Web       │     │  (dedupe)   │     │  (embed)    │     │   (LLM)     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                   │
                                                                   ▼
                                                            ┌─────────────┐
                                                            │   Coding    │
                                                            │   Agent     │◀── Past Fixes + Style Rules
                                                            └─────────────┘
                                                                   │
                                                                   ▼
                                                            ┌─────────────┐
                                                            │  GitHub PR  │───▶ Webhooks ───▶ Learning
                                                            └─────────────┘
```

## Quick Start

```bash
# Start Redis
docker compose up -d

# Install backend dependencies
cd backend
uv sync

# Run the server
uv run uvicorn main:app --reload

# In another terminal, start the frontend
cd frontend
pnpm install
pnpm dev
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /scrape` | Scrape signals from Reddit |
| `POST /scrape/web` | Scrape any URL using Browserbase |
| `POST /ingest` | Ingest signals (dedupe + queue for embedding) |
| `GET /signals` | List persisted signals |
| `GET /topics` | List clustered topics |
| `GET /tasks` | List classified tasks |
| `POST /tasks/{id}/fix` | Trigger the fix agent |
| `GET /products/{product}/rules` | List learned style rules |
| `POST /webhooks/github` | Handle PR feedback webhooks |

## Useful Commands for Development

- Flush Redis: `docker exec -it weavehacks-redis redis-cli FLUSHALL`
- Ingest + scrape:
```bash
curl -s -X POST "http://localhost:8000/ingest" \
  -H "Content-Type: application/json" \
  -d "$(curl -s -X POST "http://localhost:8000/scrape" \
    -H "Content-Type: application/json" \
    -d '{"product_name": "joplin", "subreddit": "joplinapp", "max_posts": 5}')" | jq
```
- Topics (clustered signals): `curl http://localhost:8000/topics | jq`
- Tasks (classified actionable topics): `curl http://localhost:8000/tasks | jq`
- Create GitHub issue: `curl -X POST http://localhost:8000/tasks/{task_id}/create-issue | jq`
- Run fix agent: `curl -X POST http://localhost:8000/tasks/{task_id}/fix | jq`
- Clear PR for specific task ID: `redis-cli HDEL task:8b99797e fix_pr_url fix_status fix_outcome`
    - also probably need to clear the branch: `git push origin --delete darwin/fix-8b99797e`

## Tech Stack

- **Backend**: FastAPI, Redis Stack (vectors + queues), Claude Agent SDK
- **Frontend**: Next.js 15, TypeScript, Tailwind, shadcn/ui
- **Scraping**: Reddit JSON API, Browserbase + Stagehand (AI-powered web extraction)
- **AI**: OpenAI for classification, Claude for code fixing, sentence-transformers for embeddings

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed documentation.
