# Project Instructions

This is a personal trading dashboard project.

Architecture:
- python-engine: quantitative analysis, indicators, strategy, backtesting, scanner, regime detection
- node-backend: Express API that serves scan results
- frontend: Vite React dashboard

Rules:
- Keep trading logic modular.
- Do not hardcode secrets or API keys.
- Do not change strategy behavior unless asked.
- Prefer small, reviewable changes.
- Explain what files changed.
- Use fetch in frontend instead of axios.
- Python engine should remain reusable by Node later.