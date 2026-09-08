# Recomp Ledger

Daily body-recomposition tracker + AI coach. Originally built as a claude.ai
artifact; this is the local, runnable version.

## Setup

```
npm install
cp .env.example .env   # add your Anthropic API key to .env
```

## Running

Two processes, in separate terminals:

```
npm run server   # API proxy on http://localhost:8787 (holds ANTHROPIC_API_KEY)
npm run dev      # Vite dev server on http://localhost:5173
```

Open the Vite URL. The dev server proxies `/api/*` requests to the local
server, so the browser never sees the API key.

## How it's wired up

- **Persistence** — entries and settings are stored in the browser's
  `localStorage`. No server round-trip, but it's tied to this browser
  profile on this machine; clearing site data or switching browsers loses
  the data.
- **Coach (Claude API)** — the frontend calls `/api/messages` on this
  origin, which the local Express server (`server/index.js`) proxies to
  `https://api.anthropic.com/v1/messages`, attaching your API key from
  `.env`. The key never reaches the browser.

## Not yet decided

This only runs locally for now — nothing is deployed or exposed publicly.
