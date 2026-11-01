# Oarsman AI: live demos

Static demo site (HTML, CSS, JS only: no build step, no tracking, no API keys) with live, in-browser demos of Oarsman AI's ready-made agents and tools. The products themselves are at https://oarsmanai.com/.

- `index.html`: demos-only home page, one card per demo, each linking to its live demo, case study and product page on oarsmanai.com.
- `demos/`: the demo hub, with what is real, sample or simulated on each demo.
- `front-desk/`: AI receptionist demo. The booking, FAQ, cancel and escalation logic is the real engine from the Front Desk n8n kit (`assets/js/frontdesk-core.js`, copied from the kit's tool-router Code node). The conversation is scripted and the "Google Sheet" lives in the browser. The business and people are fictional. Product: https://oarsmanai.com/agents/front-desk/
- `ai-ops-agent/`: lead intake, AI scoring (with the outage fallback) and follow-up, running the real Code nodes of the Lead Autopilot n8n kit in the browser. Product: https://oarsmanai.com/agents/lead-autopilot/
- `store-ops/`: signed Shopify order alerts and a weekly exception report for a fictional store. Products: https://oarsmanai.com/agents/store-ops-copilot/, https://oarsmanai.com/agents/shopify-order-alerts/, https://oarsmanai.com/agents/ecommerce-weekly-report/
- `rag-assistant/`: handbook assistant over a fictional company handbook. In-browser BM25 retrieval, extractive answers with citations, "I don't know" gate, live eval panel. No LLM or API key. Product: https://oarsmanai.com/agents/website-support-agent/
- `csv-dashboard/`: drop a CSV and get a KPI dashboard (targets with RAG flags, Chart.js charts, Excel export via SheetJS). Files never leave the browser. `sample-orders.csv` is fictional. Chart.js (MIT) and SheetJS CE (Apache 2.0) licences are in `csv-dashboard/vendor/`. Product: https://oarsmanai.com/agents/csv-kpi-dashboard/
- `saas-mvp/`: Plotboard, a working SaaS MVP demo (mock sign-in, CRUD, admin/member/viewer roles, test-mode billing, localStorage). `node saas-mvp/tests.js` runs the unit tests. Fictional data. Product: https://oarsmanai.com/agents/saas-mvp-starter/
- `automation/`: real sample outputs from Oarsman AI's Apify actors (run on public data on 31 Oct 2026) and diagrams generated from real n8n workflow files. Product: https://oarsmanai.com/agents/free-n8n-workflow-pack/

Luxon (`assets/js/luxon.min.js`) is MIT-licensed; see `assets/js/luxon-LICENSE.md`.

## Moved pages (1 Nov 2026)
`services/`, `pricing/` and `contact/` redirect to the home page. `about/`, `ai-and-recording/`, `privacy/` and `terms/` redirect to the matching pages on oarsmanai.com (about, AI disclosure, privacy, terms). GitHub Pages can't do server redirects, so each is a small noindex page with a meta refresh, a canonical link and visible links. Contact: hello@oarsmanai.com.
