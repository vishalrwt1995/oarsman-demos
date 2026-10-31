# Oarsman AI: live demos

Static demo site (HTML, CSS, JS only: no build step, no tracking, no API keys).

- `index.html`: links to both demos
- `front-desk/`: AI receptionist demo. The booking, FAQ, cancel and escalation logic is the real engine from the AI Front Desk n8n kit (`assets/js/frontdesk-core.js`, copied from the kit's tool-router Code node). The conversation is scripted and the "Google Sheet" lives in the browser. The business and people are fictional.
- `automation/`: real sample outputs from our Apify actors (run on public data on 31 Oct 2026) and diagrams generated from real n8n workflow files.

Luxon (`assets/js/luxon.min.js`) is MIT-licensed; see `assets/js/luxon-LICENSE.md`.
- `saas-mvp/`: Plotboard, a working SaaS MVP demo (mock sign-in, CRUD, admin/member/viewer roles, test-mode billing, localStorage). `node saas-mvp/tests.js` runs the unit tests. Fictional data.
- `rag-assistant/`: handbook assistant over a fictional company handbook. In-browser BM25 retrieval, extractive answers with citations, "I don't know" gate, live eval panel. No LLM or API key.
- `csv-dashboard/`: drop a CSV and get a KPI dashboard (targets with RAG flags, Chart.js charts, Excel export via SheetJS). Files never leave the browser. `sample-orders.csv` is fictional. Chart.js (MIT) and SheetJS CE (Apache 2.0) licences are in `csv-dashboard/vendor/`.

## Business site (31 Oct 2026)
The root `index.html` is now the Oarsman AI business home page. The demo hub moved to `demos/`; every demo URL is unchanged. Other pages: `pricing/`, `services/`, `about/`, `contact/`, `ai-and-recording/`, `privacy/`, `terms/`, plus `sitemap.xml` and `robots.txt`. Marketing only: there's no checkout on this site.
