# Oarsman AI: live demos

Static demo site (HTML, CSS, JS only: no build step, no tracking, no API keys).

- `index.html`: links to both demos
- `front-desk/`: AI receptionist demo. The booking, FAQ, cancel and escalation logic is the real engine from the AI Front Desk n8n kit (`assets/js/frontdesk-core.js`, copied from the kit's tool-router Code node). The conversation is scripted and the "Google Sheet" lives in the browser. The business and people are fictional.
- `automation/`: real sample outputs from our Apify actors (run on public data on 31 Oct 2026) and diagrams generated from real n8n workflow files.

Luxon (`assets/js/luxon.min.js`) is MIT-licensed; see `assets/js/luxon-LICENSE.md`.
