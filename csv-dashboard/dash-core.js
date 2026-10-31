/* CSV -> KPI dashboard core: parsing, column detection, aggregation and RAG flags. Browser or Node.
   (c) Oarsman AI, demo build, no client. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.DashCore = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function detectDelimiter(text) {
    var line = text.split(/\r?\n/).slice(0, 5).join('\n'), best = ',', n = -1;
    [',', ';', '\t', '|'].forEach(function (d) { var c = line.split(d).length; if (c > n) { n = c; best = d; } });
    return best;
  }
  // RFC 4180-style parser: quoted fields, "" escapes, newlines inside quotes, CRLF, BOM.
  function parseCSV(text, delim) {
    text = String(text).replace(/^\uFEFF/, ''); delim = delim || detectDelimiter(text);
    var rows = [], row = [], f = '', q = false, i = 0, c;
    for (; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"' && f === '') q = true;
      else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); if (row.length > 1 || row[0] !== '') rows.push(row); }
    if (!rows.length) throw new Error('The file is empty.');
    var header = rows.shift().map(function (h, i) { h = h.trim(); return h || 'column_' + (i + 1); });
    var seen = {}; header = header.map(function (h) { if (seen[h]) { seen[h]++; return h + '_' + seen[h]; } seen[h] = 1; return h; });
    var data = rows.map(function (r) { var o = {}; header.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i].trim(); }); return o; });
    return { header: header, rows: data, delimiter: delim };
  }
  function toNumber(v) {
    if (v == null) return NaN; var s = String(v).trim(); if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s); s = s.replace(/[()\s$€£₹%]/g, ''); if (!/^[-+]?(\d|[.,]\d)[\d.,]*$/.test(s)) return NaN;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
    var n = Number(s); return neg ? -n : n;
  }
  function parseDate(v, order) {
    var s = String(v || '').trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return mk(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) return order === 'dmy' ? mk(+m[3], +m[2], +m[1]) : mk(+m[3], +m[1], +m[2]);
    return null;
    function mk(y, mo, d) { if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; var dt = new Date(Date.UTC(y, mo - 1, d)); return dt.getUTCMonth() === mo - 1 ? dt : null; }
  }
  function detectColumns(parsed) {
    var rows = parsed.rows.slice(0, 500), out = { date: [], numeric: [], category: [], flag: [], dateOrder: {} };
    parsed.header.forEach(function (h) {
      var vals = rows.map(function (r) { return r[h]; }).filter(function (v) { return v !== ''; }); if (!vals.length) return;
      var slash = vals.filter(function (v) { return /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$/.test(v); });
      var order = slash.some(function (v) { return +v.split(/[\/.\-]/)[0] > 12; }) ? 'dmy' : 'mdy';
      var dates = vals.filter(function (v) { return parseDate(v, order); }).length;
      if (dates / vals.length >= 0.8) { out.date.push(h); out.dateOrder[h] = order; return; }
      var distinct = {}; vals.forEach(function (v) { distinct[v.toLowerCase()] = 1; }); var dk = Object.keys(distinct);
      if (dk.length <= 2 && dk.every(function (v) { return ['0', '1', 'yes', 'no', 'true', 'false', 'y', 'n', 'ja', 'nein'].indexOf(v) !== -1; })) { out.flag.push(h); return; }
      var nums = vals.filter(function (v) { return isFinite(toNumber(v)); }).length;
      if (nums / vals.length >= 0.9) { out.numeric.push(h); return; }
      if (dk.length >= 2 && dk.length <= 40) out.category.push(h);
    });
    return out;
  }
  function guessMapping(det, header) {
    var pick = function (list, re) { return list.filter(function (h) { return re.test(h); })[0] || null; };
    return {
      date: det.date[0] || null,
      value: pick(det.numeric, /revenue|sales|amount|total|value|price/i) || det.numeric.filter(function (h) { return !/id$|_id|year|month/i.test(h); })[0] || null,
      cost: pick(det.numeric, /cost|cogs|expense/i),
      qty: pick(det.numeric, /units|qty|quantity|count/i),
      category: pick(det.category, /category|product|type|plan/i) || det.category[0] || null,
      segment: pick(det.category, /channel|source|region|segment/i) || det.category[1] || null,
      flag: pick(det.flag, /return|refund|churn/i) || det.flag[0] || null
    };
  }
  function truthy(v) { return ['1', 'yes', 'true', 'y', 'ja'].indexOf(String(v).trim().toLowerCase()) !== -1; }
  function monthKey(d) { return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
  function rag(actual, target) { if (!target || !isFinite(target)) return 'none'; var r = actual / target; return r >= 1 ? 'green' : r >= 0.9 ? 'amber' : 'red'; }
  // Turn rows into clean records using the mapping; reports rows skipped.
  function normalize(parsed, map, order) {
    var recs = [], skipped = 0;
    parsed.rows.forEach(function (r) {
      var d = map.date ? parseDate(r[map.date], order) : null, v = toNumber(r[map.value]);
      if (!d || !isFinite(v)) { skipped++; return; }
      recs.push({ date: d, month: monthKey(d), value: v, cost: map.cost ? toNumber(r[map.cost]) : NaN, qty: map.qty ? toNumber(r[map.qty]) : NaN, category: map.category ? (r[map.category] || '(blank)') : 'All', segment: map.segment ? (r[map.segment] || '(blank)') : 'All', flag: map.flag ? truthy(r[map.flag]) : false, raw: r });
    });
    return { recs: recs, skipped: skipped };
  }
  function filter(recs, f) {
    f = f || {};
    return recs.filter(function (r) { return (!f.from || r.month >= f.from) && (!f.to || r.month <= f.to) && (!f.category || f.category === 'all' || r.category === f.category) && (!f.segment || f.segment === 'all' || r.segment === f.segment); });
  }
  function aggregate(recs, targets) {
    targets = targets || {};
    var sum = function (a, k) { return a.reduce(function (s, r) { return s + (isFinite(r[k]) ? r[k] : 0); }, 0); };
    var hasCost = recs.some(function (r) { return isFinite(r.cost); }), hasQty = recs.some(function (r) { return isFinite(r.qty); });
    var months = {}, cats = {}, segs = {};
    recs.forEach(function (r) {
      var m = months[r.month] || (months[r.month] = { month: r.month, value: 0, cost: 0, rows: 0, flagged: 0, qty: 0 });
      m.value += r.value; m.cost += isFinite(r.cost) ? r.cost : 0; m.rows++; m.flagged += r.flag ? 1 : 0; m.qty += isFinite(r.qty) ? r.qty : 0;
      cats[r.category] = (cats[r.category] || 0) + r.value; segs[r.segment] = (segs[r.segment] || 0) + r.value;
    });
    var monthly = Object.keys(months).sort().map(function (k) { var m = months[k]; m.margin = hasCost && m.value ? (m.value - m.cost) / m.value : null; m.valueFlag = rag(m.value, targets.monthlyValue); m.marginFlag = m.margin == null ? 'none' : rag(m.margin, targets.marginPct != null ? targets.marginPct / 100 : null); return m; });
    var total = sum(recs, 'value'), cost = sum(recs, 'cost');
    var last = monthly[monthly.length - 1], prev = monthly[monthly.length - 2];
    return {
      rows: recs.length, total: total, avg: recs.length ? total / recs.length : 0, qty: hasQty ? sum(recs, 'qty') : null,
      margin: hasCost && total ? (total - cost) / total : null, flagRate: recs.length ? recs.filter(function (r) { return r.flag; }).length / recs.length : 0,
      lastMonth: last || null, prevMonth: prev || null, mom: last && prev && prev.value ? (last.value - prev.value) / prev.value : null,
      monthly: monthly,
      byCategory: Object.keys(cats).map(function (k) { return { name: k, value: cats[k] }; }).sort(function (a, b) { return b.value - a.value; }),
      bySegment: Object.keys(segs).map(function (k) { return { name: k, value: segs[k] }; }).sort(function (a, b) { return b.value - a.value; }),
      monthsOnTarget: monthly.filter(function (m) { return m.valueFlag === 'green'; }).length
    };
  }
  return { parseCSV: parseCSV, detectDelimiter: detectDelimiter, toNumber: toNumber, parseDate: parseDate, detectColumns: detectColumns, guessMapping: guessMapping, normalize: normalize, filter: filter, aggregate: aggregate, rag: rag };
});
