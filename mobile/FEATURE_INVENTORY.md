# Existing capability → mobile implementation

| Screen | Existing API / infrastructure | Implemented interaction |
| --- | --- | --- |
| Sign in / session | `/api/auth/mobile/login`, `/refresh`, `/logout`, `/sessions`; existing authService/refreshToken | SecureStore credentials, one concurrent renewal, revocation, device session list, biometrics |
| Home | `/api/execution/status`, `/api/paper-portfolio`, `/api/trading/session`, `/api/alerts`, `/api/paper-trades` | Environment-separated balance, P&L where supplied, real recorded chart history, activity, automation shortcut |
| Markets | `/api/watchlist`, `/api/scan-results`, `/api/scans/start`, `/api/market-data/quotes` | Symbol lookup, add/remove watchlist, paged quote subscriptions, scanner explanations, explicit server scan |
| Symbol detail | `/api/market-data/:symbol/quote`, `/price-history`, `/ws/market-data` | Timestamped quote, chart ranges, indicators from scanner, source-labelled company research/news via copilot |
| AI | `/api/ai/chat`, `/api/research/copilot/ask`, `/api/portfolio/copilot/ask` | User-triggered general/research/portfolio questions, contextual follow-ups, report/evidence display |
| Research | `/api/research/projects`, `/:id/notes`, `/ask`, `/reports`, `/archive` | Project creation, paginated history, notes, structured report generation, saved analysis |
| AI memory | `/api/memory/events`, `/exclude`, `/api/memory/personalization/preferences` | Paged historical context, exclude evidence, explicit preference |
| Strategies | `/api/strategy-experiments`, `/active-strategy`, `/strategy-lifecycle`, `/strategy-deployment-allocation` | Paged compact library, saved versions, draft numeric parameters, inspection, paper-only validated activation |
| Strategy detail | `/api/strategy-experiments/:id/run`, `/walk-forward` | Explicit server jobs, saved metrics, risk/walk-forward evidence; errors retained |
| Portfolio | `/api/paper-portfolio`, `/api/trading/session`, `/api/broker/orders`, `/fills`, `/reconciliation` | Positions, allocations, balances, history/fills, P&L, fees and reconciliation; no paper fallback for live |
| Automation | `/api/execution/status`, `/strategies`, `/stop`, `/activate`, `/configure`, `/api/engine-status` | Status, allowlist, risk budget, protection, events, owner emergency stop, paper pause/resume/settings, disabled-live readiness |
| Proposal review | `/api/approval-requests`, `/:id/reject` | Review/reject via existing server authorization; no mobile real-order confirmation shortcut |
| Alerts | `/api/alerts` | Existing server alerts and failure messages |
| Device push | `/api/mobile/devices`, `/deliveries`; existing alert worker | Per-category preference, registration/removal, scoped durable delivery, Expo ticket/receipt handling, allowlisted deep links |

The added endpoints only adapt native authentication and device delivery. No mobile
trading engine, broker SDK, local strategy executor, fake account balances or fixture
AI is shipped. Existing owner/page/verification checks apply server-side.

Adaptation limits: symbol search is exact backend symbol lookup rather than a new
security-master service. Company news appears only when existing research sources
provide evidence. Full visual DSL/matrix construction remains on the web; mobile
supports parameter drafts and complete result inspection. No detached phone-side
background scheduler is implemented: autonomous trading continues on the server.

Verification distinguishes local PostgreSQL/fake provider regression, local real API
browser checks, Android bundle generation and actual device/account acceptance.
