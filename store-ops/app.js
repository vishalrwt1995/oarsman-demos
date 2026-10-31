/* (c) Oarsman AI. Demo use only, not licensed for reuse.
   Store Ops Copilot demo. Signature check mirrors the template's Crypto + IF nodes (HMAC-SHA256 of the raw body,
   base64, compared with X-Shopify-Hmac-Sha256). Dedupe and alert building are the template's real Code nodes (nodes.js).
   The weekly report data is real script output from our e-commerce pack, on its fictional sample store (data.js). */
(function () {
  'use strict';
  const SECRET = 'demo-signing-secret-not-a-real-key'; // placeholder: in real use this is the store's webhook signing secret
  const SHOP = 'oarsman-coffee-demo.myshopify.com';     // fictional store domain
  const SETTINGS = { telegram_chat_id: 'demo-chat', send_to_telegram: true, high_value_threshold: 3000, hide_customer_names: false, send_to_whatsapp: true, whatsapp_api_version: 'v21.0', whatsapp_phone_number_id: 'demo-phone-id', whatsapp_to: '+910000000000', whatsapp_template: 'order_alert', whatsapp_language: 'en' };
  // Fictional orders, written as raw JSON text exactly as Shopify would send it (note the 18-digit ids).
  const ORDERS = {
    cod: '{"id":820982911946160001,"admin_graphql_api_id":"gid://shopify/Order/820982911946160001","name":"#2041","order_number":2041,"currency":"INR","presentment_currency":"INR","total_price":"4974.00","current_total_price":"4974.00","total_discounts":"500.00","financial_status":"pending","payment_gateway_names":["Cash on Delivery (COD)"],"discount_codes":[{"code":"DIWALI10","amount":"500.00"}],"note":"Gift wrap please <b>no invoice</b> in the box","customer":{"first_name":"Aarav","last_name":"Mehta","orders_count":1},"shipping_address":{"city":"Pune","province_code":"MH","country_code":"IN"},"shipping_lines":[{"title":"Express (1-2 days)"}],"line_items":[{"title":"Hand Grinder Steel Burr","variant_title":null,"quantity":1,"price":"2499.00"},{"title":"Arabica Coffee Beans 250g","variant_title":"Medium roast","quantity":4,"price":"599.00"},{"title":"Paper Filters x100","variant_title":null,"quantity":2,"price":"289.50"}]}',
    card: '{"id":820982911946160002,"admin_graphql_api_id":"gid://shopify/Order/820982911946160002","name":"#2042","order_number":2042,"currency":"INR","total_price":"449.00","total_discounts":"0.00","financial_status":"paid","payment_gateway_names":["shopify_payments"],"discount_codes":[],"note":null,"customer":{"first_name":"Maya","last_name":"Chen","orders_count":6},"shipping_address":{"city":"Bengaluru","province_code":"KA","country_code":"IN"},"shipping_lines":[{"title":"Standard"}],"line_items":[{"title":"Cold Brew Bags x6","variant_title":null,"quantity":1,"price":"449.00"}]}',
    staff: '{"id":820982911946160003,"admin_graphql_api_id":"gid://shopify/Order/820982911946160003","name":"#2043","order_number":2043,"currency":"INR","total_price":"750.00","total_discounts":"749.00","financial_status":"paid","payment_gateway_names":["shopify_payments"],"discount_codes":[{"code":"STAFF50","amount":"749.00"}],"note":null,"customer":{"first_name":"Riya","last_name":"Kapoor","orders_count":1},"shipping_address":{"city":"Delhi","province_code":"DL","country_code":"IN"},"shipping_lines":[{"title":"Standard"}],"line_items":[{"title":"Coffee Sampler Gift Box","variant_title":null,"quantity":1,"price":"1499.00"}]}'
  };
  const EVENT_IDS = { cod: 'evt-demo-0001', card: 'evt-demo-0002', staff: 'evt-demo-0003' };
  let staticData = {}, log = [], alerts = [], lastWire = null;

  async function hmacB64(key, text) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
    let bin = ''; new Uint8Array(sig).forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin);
  }
  const wrap = (arr) => ({ all: () => arr, first: () => arr[0] });
  function runNode(name, input) { return window.SO_NODES[name](() => { throw new Error('no refs'); }, wrap(input), Date, () => staticData); }

  // Shopify's side: sign and send. Then the n8n side: verify, ack, dedupe, build alert.
  async function deliver(orderKey, mode) {
    let raw = ORDERS[orderKey];
    const headers = { 'content-type': 'application/json', 'x-shopify-topic': 'orders/create', 'x-shopify-shop-domain': SHOP, 'x-shopify-event-id': EVENT_IDS[orderKey] };
    if (mode !== 'missing') headers['x-shopify-hmac-sha256'] = await hmacB64(mode === 'forged' ? 'attacker-guess' : SECRET, raw);
    if (mode === 'tampered') raw = raw.replace(/"total_price":"[^"]+"/, '"total_price":"1.00"');
    // --- n8n: Compute Shopify signature (Crypto node, HMAC SHA256 over the raw body, base64) + Signature valid? (IF) ---
    const computed = await hmacB64(SECRET, raw);
    const given = headers['x-shopify-hmac-sha256'] || '';
    const valid = given !== '' && computed === given;
    const entry = { at: new Date().toISOString().slice(11, 19), order: JSON.parse(raw).name, mode, valid, status: valid ? 200 : 401, alert: '' };
    lastWire = { request: { headers, raw_body: raw }, computed_hmac: computed, signature_valid: valid };
    if (valid) {
      const item = { json: Object.assign({ headers, body: JSON.parse(raw) }, SETTINGS) };
      const fresh = runNode('Skip repeated deliveries', [item]);
      if (!fresh.length) entry.alert = 'skipped: repeat delivery';
      else {
        const out = runNode('Build order alert', fresh);
        out.forEach((o) => alerts.unshift(o.json));
        entry.alert = out.length ? 'Telegram + WhatsApp alert' : 'not an order topic';
        lastWire.alert = out[0] && out[0].json;
      }
    } else entry.alert = 'rejected, nothing trusted';
    log.unshift(entry); render(); return entry;
  }

  // ---- render ----
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Telegram HTML from the Code node: keep <b> and show <a> as plain underlined text (the store is fictional).
  function tgHtml(src) {
    const t = document.createElement('template'); t.innerHTML = src; const out = document.createElement('div');
    (function walk(from, to) {
      from.childNodes.forEach((n) => {
        if (n.nodeType === 3) to.appendChild(document.createTextNode(n.textContent));
        else if (n.nodeName === 'B') { const b = document.createElement('b'); walk(n, b); to.appendChild(b); }
        else if (n.nodeName === 'A') { const s = document.createElement('span'); s.className = 'fakelink'; s.title = n.getAttribute('href') || ''; walk(n, s); to.appendChild(s); }
        else walk(n, to);
      });
    })(t.content, out);
    return out.innerHTML.replace(/\n/g, '<br>');
  }
  function render() {
    $('#log').innerHTML = '<table><thead><tr><th>time</th><th>order</th><th>delivery</th><th>signature</th><th>HTTP</th><th>result</th></tr></thead><tbody>' +
      (log.length ? log.map((e) => '<tr><td>' + esc(e.at) + '</td><td>' + esc(e.order) + '</td><td>' + esc(e.mode) + '</td><td>' + (e.valid ? '<span class="ok">valid</span>' : '<span class="bad">invalid</span>') + '</td><td><b class="' + (e.status === 200 ? 'ok' : 'bad') + '">' + e.status + '</b></td><td class="wrap-ok">' + esc(e.alert) + '</td></tr>').join('') : '<tr><td colspan="6" class="muted">No webhooks yet.</td></tr>') + '</tbody></table>';
    $('#alerts').innerHTML = alerts.length ? alerts.map((a) => '<div class="tg"><div class="tghead">Telegram · Store alerts bot <span class="muted small">(simulated)</span></div><div class="tgbody">' + tgHtml(a.telegram_text) + '</div><div class="muted small" style="margin-top:6px">WhatsApp template params: ' + esc(JSON.stringify(a.whatsapp.params)) + '</div></div>').join('') : '<p class="muted small">No alerts yet.</p>';
    $('#wire').textContent = lastWire ? JSON.stringify(lastWire, null, 2) : '(send a webhook to see the raw request and the signature check)';
    $('#counts').textContent = log.filter((e) => e.status === 200).length + ' accepted · ' + log.filter((e) => e.status === 401).length + ' rejected (401) · ' + alerts.length + ' alert(s) sent';
  }

  // ---- weekly report (real pack output) ----
  const inr = (v) => 'INR ' + Math.round(v).toLocaleString('en-IN');
  function pct(a, b) { if (!b) return ''; const p = (a - b) / b * 100; return (p >= 0 ? '+' : '') + p.toFixed(1) + '%'; }
  function renderReport() {
    const d = window.SO_DATA, k = d.weekly.kpis, l = d.weekly.last_week;
    const cards = [['Net sales', inr(k.net_sales), pct(k.net_sales, l.net_sales)], ['Orders', k.orders, pct(k.orders, l.orders)], ['AOV', inr(k.aov), pct(k.aov, l.aov)], ['Discount rate', k.discount_rate_pct + '%', 'last week ' + l.discount_rate_pct + '%'], ['Refund rate', k.refund_rate_pct + '%', 'last week ' + l.refund_rate_pct + '%'], ['Cancelled', k.cancelled_orders, 'last week ' + l.cancelled_orders]];
    $('#kpis').innerHTML = cards.map((c) => '<div class="card kpi"><div class="muted small">' + esc(c[0]) + '</div><div class="stat">' + esc(c[1]) + '<small>' + esc(c[2]) + ' vs last week</small></div></div>').join('');
    $('#week').textContent = d.weekly.week.join(' to ');
    $('#anoms').innerHTML = d.anomalies.anomalies.map((a) => '<div class="anom sev-' + esc(a.severity) + '"><div><span class="sev">' + esc(a.severity) + '</span> <b>' + esc(a.type.replace(/_/g, ' ')) + ': ' + esc(a.subject) + '</b></div><div class="small">' + esc(a.finding) + '</div><div class="small muted">Check: ' + esc(a.what_to_check) + '</div></div>').join('');
    $('#quiet').textContent = 'Control week ' + d.quiet.week.join(' to ') + ': ' + d.quiet.count + ' anomalies flagged (nothing was planted that week).';
    const p = d.profit;
    $('#profit').innerHTML = '<table><thead><tr><th>SKU</th><th>product</th><th>units</th><th>net sales</th><th>contribution</th><th>margin</th><th>flag</th></tr></thead><tbody>' + p.skus.map((s) => '<tr><td>' + esc(s.sku) + '</td><td>' + esc(s.product) + '</td><td>' + s.units + '</td><td>' + inr(s.net_sales) + '</td><td>' + (s.contribution < 0 ? '−' : '') + inr(Math.abs(s.contribution)) + '</td><td>' + s.margin_pct + '%</td><td>' + (p.loss_making.includes(s.sku) ? '<span class="bad">losing money</span>' : p.missing_costs.includes(s.sku) ? '<span class="warn">cost missing</span>' : '') + '</td></tr>').join('') + '</tbody></table>';
    $('#profit-sum').textContent = p.period + ': net sales ' + inr(p.totals.net_sales) + ', contribution ' + inr(p.totals.contribution) + ' (' + p.totals.margin_pct + '%) after COGS, packaging, platform fees and shipping.';
    const acts = d.anomalies.anomalies.filter((a) => a.severity === 'high').map((a) => [a.subject, a.what_to_check.split('. ')[0]]).concat(p.loss_making.map((s) => [s, 'Raise price, cut cost or stop promoting: it loses money after fees.']), p.missing_costs.map((s) => [s, 'Add its unit cost: profit is overstated until you do.']));
    $('#actions').innerHTML = acts.map((a, i) => '<li><label><input type="checkbox"> <b>' + esc(a[0]) + '</b>: ' + esc(a[1]) + '</label></li>').join('');
  }
  window.STORE_DEMO = { deliver, log: () => log, alerts: () => alerts };
  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-send]').forEach((b) => { b.onclick = () => { const [o, m] = b.dataset.send.split(':'); deliver(o, m); }; });
    $('#reset').onclick = () => { staticData = {}; log = []; alerts = []; lastWire = null; render(); };
    document.querySelectorAll('.tabs.views button').forEach((b) => { b.onclick = () => { document.querySelectorAll('.tabs.views button').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== b.dataset.view; }); }; });
    render(); renderReport();
  });
})();
