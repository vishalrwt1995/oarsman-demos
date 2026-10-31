/* (c) Oarsman AI. Demo use only, not licensed for reuse.
   AI Ops Agent demo. Runs the real Code nodes of Lead Autopilot v1.1 (nodes.js) in the browser,
   wired the same way as the n8n workflows. Google Sheets, Slack, email and IMAP are simulated in the page. */
(function () {
  'use strict';
  const N = window.LA_NODES;
  const RealDate = Date;
  let offsetMs = 0;
  function clockDate() {
    const off = offsetMs;
    class D extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + off); } static now() { return RealDate.now() + off; } }
    return D;
  }
  // Workflow Config node (shipped defaults; business is a fictional placeholder; URLs are example addresses).
  const CFG = {
    sheet_tab: 'Leads', llm_base_url: 'https://api.openai.com/v1', llm_model: 'gpt-4o-mini',
    business_name: 'Acme Growth Studio', ideal_customer: 'B2B SaaS and e-commerce companies with 10-200 employees in US/UK/EU that need paid ads or CRO help',
    services: 'Paid ads management, landing-page CRO, marketing automation', min_budget_usd: 1500,
    from_email: 'hello@acme-growth.example', from_name: 'Acme Growth Studio', booking_link: 'https://cal.example/acme/intro-call',
    alert_email: 'owner@acme-growth.example', tier_a_min: 70, tier_b_min: 40, b_first_delay_minutes: 15, max_emails_per_run: 25
  };
  // n8n-style helpers so the node code runs unchanged.
  const wrap = (arr) => ({ all: () => arr, first: () => arr[0], last: () => arr[arr.length - 1], item: arr[0] });
  function runNode(name, input, refs) {
    const $ = (n) => { if (!refs[n]) throw new Error('demo wiring: no node ' + n); return wrap(refs[n]); };
    return N[name]($, wrap(input), clockDate(), () => ({}));
  }

  // ---- state ----
  let sheet = [], outbox = [], slack = [], trace = [], runs = 0;
  const stats = () => sheet.reduce((m, r) => { m[r.tier] = (m[r.tier] || 0) + 1; return m; }, {});

  // ---- workflow 01: intake ----
  function intake(payload, aiMode, exampleReply) {
    runs += 1; trace = [];
    const T = (node, kind, out, note) => trace.push({ node, kind, out, note });
    const webhookItem = { json: { headers: { 'content-type': 'application/json' }, body: payload } };
    T('Lead Webhook', 'Webhook', webhookItem.json, 'POST /webhook/lead-intake (simulated: the form posts to this page instead of n8n)');
    const cfgItem = { json: Object.assign({}, webhookItem.json, CFG) };
    T('Config', 'Set', CFG, 'Shipped Config fields (fictional business).');
    const norm = runNode('Normalize & Validate', [cfgItem], { Config: [cfgItem] });
    T('Normalize & Validate', 'Code · real', norm[0].json);
    if (norm[0].json.valid !== 'true') {
      const resp = { status: 400, body: { ok: false, error: norm[0].json.error } };
      T('Valid lead?', 'IF', { valid: norm[0].json.valid }, 'false branch');
      T('Respond 400', 'Respond', resp);
      return { resp };
    }
    T('Valid lead?', 'IF', { valid: 'true' }, 'true branch');
    const prompt = runNode('Build AI prompt', norm, { Config: [cfgItem] });
    T('Build AI prompt', 'Code · real', prompt[0].json.llm_body, 'The exact request the workflow would send to your LLM. The demo does not send it anywhere.');
    let llmOut;
    if (aiMode === 'example') {
      llmOut = { json: { choices: [{ message: { content: exampleReply } }] } };
      T('AI Qualify (LLM)', 'HTTP · simulated', llmOut.json, 'Hand-written example reply (edit it in the box). Not produced by a model.');
    } else {
      llmOut = { json: { error: 'connect ECONNREFUSED (demo: no AI provider connected)' } };
      T('AI Qualify (LLM)', 'HTTP · simulated', llmOut.json, 'Provider unreachable, so the next node uses its rule-based fallback. This is the real outage path.');
    }
    const parsed = runNode('Parse AI result', [llmOut], { Config: [cfgItem], 'Build AI prompt': prompt });
    const p = parsed[0].json;
    T('Parse AI result', 'Code · real', { row: p.row, reply_subject: p.reply_subject }, 'scored_by = ' + p.row.scored_by);
    const kept = runNode('Keep sheet columns', parsed, {});
    const row = kept[0].json;
    const i = sheet.findIndex((r) => r.lead_id === row.lead_id);
    if (i >= 0) sheet[i] = Object.assign({}, sheet[i], row); else sheet.push(Object.assign({ owner: '', replied_at: '' }, row));
    T('Upsert lead in Sheet', 'Google Sheets · simulated', { matched_on: 'lead_id', action: i >= 0 ? 'updated existing row' : 'appended new row', lead_id: row.lead_id });
    if (p.tier === 'A') {
      slack.unshift({ at: new (clockDate())().toISOString(), payload: p.slack_payload, kind: 'Hot lead alert' });
      outbox.unshift({ at: new (clockDate())().toISOString(), to: p.email, subject: p.reply_subject, html: p.reply_html, kind: 'Instant reply (A-tier)' });
      outbox.unshift({ at: new (clockDate())().toISOString(), to: CFG.alert_email, subject: '🔥 Hot lead: ' + (p.name || p.email) + ' (score ' + p.score + ')', html: '<h3>Hot lead: ' + escH(p.name) + '</h3><p><b>Score:</b> ' + p.score + ' (tier A)<br><b>Email:</b> ' + escH(p.email) + '<br><b>Company:</b> ' + escH(p.company) + '</p><p>' + escH(p.need_summary) + '</p>', kind: 'Alert to owner (template simplified for the demo)' });
      T('Tier A?', 'IF', { tier: 'A' }, 'true: Slack alert, owner email and instant reply sent (simulated)');
    } else T('Tier A?', 'IF', { tier: p.tier }, 'false: no alert. ' + (p.tier === 'B' ? 'First follow-up due in ' + CFG.b_first_delay_minutes + ' min (workflow 02).' : p.tier === 'C' ? 'Goes to monthly nurture.' : 'Spam: nothing is sent.'));
    const resp = { status: 200, body: { ok: true, lead_id: p.lead_id, tier: p.tier } };
    T('Respond OK', 'Respond', resp);
    return { resp, row: p };
  }
  function escH(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---- workflow 02: follow-ups (hourly schedule) ----
  function followups() {
    const items = sheet.map((r) => ({ json: Object.assign({}, r) }));
    const out = runNode('Pick due follow-ups', items, { Config: [{ json: CFG }] });
    out.forEach((o) => {
      outbox.unshift({ at: new (clockDate())().toISOString(), to: o.json.email, subject: o.json.subject, html: o.json.html, kind: 'Follow-up step ' + o.json.update.followup_step });
      const r = sheet.find((x) => x.lead_id === o.json.update.lead_id); Object.assign(r, o.json.update);
    });
    return out.length;
  }
  // ---- workflow 03: reply detector ----
  function reply(email, text) {
    const mail = [{ json: { from: 'Lead <' + email + '>', subject: 'Re: your enquiry', textPlain: text } }];
    const out = runNode('Match reply to lead', sheet.map((r) => ({ json: Object.assign({}, r) })), { 'New email (IMAP)': mail });
    out.forEach((o) => { const r = sheet.find((x) => x.lead_id === o.json.row.lead_id); Object.assign(r, o.json.row); slack.unshift({ at: new (clockDate())().toISOString(), payload: o.json.slack_payload, kind: 'Reply detected' }); });
    return out.length;
  }
  // ---- workflow 04: daily report ----
  function report() {
    const out = runNode('Build report', sheet.map((r) => ({ json: Object.assign({}, r) })), {});
    outbox.unshift({ at: new (clockDate())().toISOString(), to: CFG.alert_email, subject: out[0].json.subject, html: out[0].json.html, kind: 'Daily report (08:00)' });
    slack.unshift({ at: new (clockDate())().toISOString(), payload: out[0].json.slack_payload, kind: 'Daily report' });
    return out[0].json.stats;
  }
  // ---- workflow 06: error alerts ----
  function breakIt() {
    const ev = [{ json: { workflow: { name: '01 · Lead intake + AI qualification' }, execution: { error: { message: 'Google Sheets API: 429 Too Many Requests (simulated)' }, lastNodeExecuted: 'Upsert lead in Sheet', url: 'https://your-n8n.example/workflow/1/executions/1234' } } }];
    const out = runNode('Format alert', [], { 'On workflow error': ev });
    slack.unshift({ at: new (clockDate())().toISOString(), payload: out[0].json.slack_payload, kind: 'Error alert' });
    outbox.unshift({ at: new (clockDate())().toISOString(), to: CFG.alert_email, subject: out[0].json.subject, html: out[0].json.html, kind: 'Error alert' });
  }

  // ---- UI ----
  const $ = (s) => document.querySelector(s);
  const esc = escH;
  const SHEET_COLS = ['lead_id', 'name', 'company', 'score', 'tier', 'status', 'scored_by', 'followup_step', 'next_followup_at', 'need_summary'];
  function fmtT(iso) { if (!iso) return ''; const d = new RealDate(iso); return d.toISOString().slice(5, 16).replace('T', ' ') + 'Z'; }
  function render() {
    const s = stats();
    $('#stats').innerHTML = ['A', 'B', 'C', 'SPAM'].map((t) => '<span class="tierpill t' + t + '">' + t + ' ' + (s[t] || 0) + '</span>').join('') + '<span class="muted small"> ' + sheet.length + ' row(s) · ' + outbox.length + ' email(s) · ' + slack.length + ' Slack post(s)</span>';
    $('#sheet').innerHTML = '<table><thead><tr>' + SHEET_COLS.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
      (sheet.length ? sheet.map((r) => '<tr>' + SHEET_COLS.map((c) => '<td' + (c === 'need_summary' ? ' class="wrap-ok"' : '') + '>' + (c === 'tier' ? '<span class="tierpill t' + esc(r.tier) + '">' + esc(r.tier) + '</span>' : c === 'next_followup_at' ? esc(fmtT(r[c])) : esc(r[c])) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + SHEET_COLS.length + '" class="muted">No leads yet. Send one on the left.</td></tr>') + '</tbody></table>';
    $('#trace').innerHTML = trace.length ? trace.map((t, i) => '<details class="step"' + (i === trace.length - 1 ? ' open' : '') + '><summary><span class="n">' + (i + 1) + '</span><b>' + esc(t.node) + '</b><span class="kind ' + (/real/.test(t.kind) ? 'real' : /simulated/.test(t.kind) ? 'sim' : '') + '">' + esc(t.kind) + '</span>' + (t.note ? '<span class="note">' + esc(t.note) + '</span>' : '') + '</summary><pre>' + esc(JSON.stringify(t.out, null, 2)) + '</pre></details>').join('') : '<p class="muted small">Send a lead to see each node run.</p>';
    $('#slack').innerHTML = slack.length ? slack.map((m) => '<div class="slackmsg"><div class="muted small">' + esc(m.kind) + ' · ' + esc(fmtT(m.at)) + '</div>' + slackHtml(m.payload) + '</div>').join('') : '<p class="muted small">No Slack posts yet.</p>';
    $('#outbox').innerHTML = outbox.length ? outbox.map((m, i) => '<div class="mail"><div class="mailhead"><b>' + esc(m.subject) + '</b><span class="muted small">To ' + esc(m.to) + ' · ' + esc(m.kind) + ' · ' + esc(fmtT(m.at)) + '</span></div><iframe sandbox="" title="Rendered email ' + (i + 1) + '" data-i="' + i + '"></iframe></div>').join('') : '<p class="muted small">No emails yet.</p>';
    document.querySelectorAll('#outbox iframe').forEach((f) => { f.srcdoc = '<!doctype html><meta charset="utf-8"><body style="font:14px/1.5 Arial,sans-serif;color:#1b1f2a;margin:12px">' + outbox[Number(f.dataset.i)].html + '</body>'; });
    const leads = sheet.filter((r) => r.email && !['spam'].includes(r.status));
    $('#reply-lead').innerHTML = leads.length ? leads.map((r) => '<option value="' + esc(r.email) + '">' + esc((r.name || r.email) + ' (' + r.tier + ', ' + r.status + ')') + '</option>').join('') : '<option value="">(send a lead first)</option>';
    $('#clock').textContent = 'Demo clock: ' + new (clockDate())().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' + (offsetMs ? ' (+' + Math.round(offsetMs / 36e5) + ' h ahead)' : '');
  }
  function slackHtml(p) {
    if (p.blocks) return p.blocks.map((b) => {
      if (b.type === 'header') return '<div class="sh">' + esc(b.text.text) + '</div>';
      if (b.type === 'section' && b.fields) return '<div class="sf">' + b.fields.map((f) => '<div>' + mrk(f.text) + '</div>').join('') + '</div>';
      if (b.type === 'section') return '<div>' + mrk(b.text.text) + '</div>';
      if (b.type === 'context') return '<div class="muted small">' + b.elements.map((e) => mrk(e.text)).join(' ') + '</div>';
      return '';
    }).join('');
    return '<div>' + mrk(p.text) + '</div>';
  }
  function mrk(t) { return esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/&lt;(https?:[^|]+)\|([^&]+)&gt;/g, '<u>$2</u>').replace(/\n&gt;/g, '\n› ').replace(/\n/g, '<br>'); }
  function status(r) { $('#resp').textContent = 'HTTP ' + r.status + ' ' + JSON.stringify(r.body); $('#resp').className = 'resp ' + (r.status === 200 ? 'ok' : 'bad'); }

  const EXAMPLE_REPLY = JSON.stringify({ need_summary: 'Wants a CRO audit and redesign of 2-3 demo-request landing pages this quarter', service_match: 'landing-page CRO', urgency: 'medium', budget_band: '1k-5k', intent: 'high', is_spam: false, score: 74, tags: ['b2b', 'cro'], reasoning: 'Clear need matching a core service, budget above minimum, timeline this quarter.' }, null, 2);
  function formPayload() {
    const f = $('#lead-form'); const o = {};
    ['name', 'email', 'company', 'budget', 'service', 'message'].forEach((k) => { const v = f.elements[k].value.trim(); if (v) o[k] = v; });
    o.source = 'website'; return o;
  }
  function send(payload) {
    let r; try { r = intake(payload, $('#ai-mode').value, $('#example-reply').value); } catch (e) { r = { resp: { status: 500, body: { ok: false, error: String(e.message || e) } } }; }
    status(r.resp); render();
    return r;
  }
  function samples() {
    const items = runNode('Sample leads', [], {});
    const res = items.map((it) => intake(it.json, 'down', ''));
    status(res[res.length - 1].resp); render();
    $('#batch').textContent = 'Workflow 07 sent ' + items.length + ' test leads: ' + res.map((r, i) => (items[i].json.name || '?') + ' → ' + (r.resp.status === 200 ? r.resp.body.tier + (r.row ? ' (' + r.row.score + ')' : '') : '400')).join(' · ');
    return res;
  }
  window.OPS_DEMO = { samples, followups, report, reply, breakIt, sheet: () => sheet, outbox: () => outbox, slack: () => slack, advance: (h) => { offsetMs += h * 36e5; render(); }, send };
  window.addEventListener('DOMContentLoaded', () => {
    $('#example-reply').value = EXAMPLE_REPLY;
    $('#ai-mode').onchange = () => { $('#example-wrap').hidden = $('#ai-mode').value !== 'example'; };
    $('#lead-form').onsubmit = (e) => { e.preventDefault(); send(formPayload()); };
    $('#raw-send').onclick = () => { let p; try { p = JSON.parse($('#raw').value); } catch (e) { status({ status: 400, body: { ok: false, error: 'demo: that is not valid JSON' } }); return; } send(p); };
    $('#samples').onclick = samples;
    document.querySelectorAll('[data-adv]').forEach((b) => { b.onclick = () => { offsetMs += Number(b.dataset.adv) * 36e5; const n = followups(); $('#timemsg').textContent = 'Clock moved +' + b.dataset.adv + ' h. Workflow 02 ran: ' + n + ' follow-up email(s) due and sent.'; render(); }; });
    $('#do-reply').onclick = () => { const em = $('#reply-lead').value; if (!em) return; const n = reply(em, $('#reply-text').value); $('#timemsg').textContent = n ? 'Workflow 03 matched the reply. Automation is paused for this lead.' : 'No lead matched that sender.'; render(); };
    $('#do-report').onclick = () => { const s = report(); $('#timemsg').textContent = 'Workflow 04 built the daily report: ' + s.new + ' new in 24 h, ' + s.hotWaiting + ' hot lead(s) with no owner.'; render(); };
    $('#do-break').onclick = () => { breakIt(); $('#timemsg').textContent = 'Workflow 06 turned a (simulated) Google Sheets 429 error into an alert.'; render(); };
    $('#reset').onclick = () => { sheet = []; outbox = []; slack = []; trace = []; offsetMs = 0; $('#batch').textContent = ''; $('#timemsg').textContent = ''; $('#resp').textContent = ''; render(); };
    document.querySelectorAll('.wf-tabs button').forEach((b) => { b.onclick = () => { document.querySelectorAll('.wf-tabs button').forEach((x) => x.classList.toggle('on', x === b)); $('#wf-img').src = b.dataset.src; }; });
    render();
  });
})();
