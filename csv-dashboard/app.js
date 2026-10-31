/* CSV dashboard UI. (c) Oarsman AI, demo build, no client. */
(function () {
  'use strict';
  var D = window.DashCore, $ = function (s) { return document.querySelector(s); };
  var st = { parsed: null, det: null, map: null, order: 'mdy', recs: [], filters: { from: '', to: '', category: 'all', segment: 'all' }, targets: {}, charts: {}, name: '' };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var fmt = new Intl.NumberFormat('en', { maximumFractionDigits: 0 }), fmt2 = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
  function pct(x) { return x == null ? '—' : (x * 100).toFixed(1) + '%'; }
  Chart.defaults.color = '#9aa3c7'; Chart.defaults.borderColor = '#232b47'; Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  var PAL = ['#34f5c5', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171', '#22d3ee', '#f472b6', '#84cc16'];
  function status(t) { $('#status').textContent = t; }
  function load(text, name) {
    try {
      var t0 = performance.now();
      st.parsed = D.parseCSV(text); st.det = D.detectColumns(st.parsed); st.map = D.guessMapping(st.det, st.parsed.header); st.name = name;
      if (!st.map.date || !st.map.value) throw new Error('I couldn\'t find ' + (!st.map.date ? 'a date column' : 'a number column') + '. Columns found: ' + st.parsed.header.join(', '));
      st.order = st.det.dateOrder[st.map.date] || 'mdy'; st.filters = { from: '', to: '', category: 'all', segment: 'all' };
      renormalize();
      var avg = st.recs.length ? Math.round(st.recs.reduce(function (s, r) { return s + r.value; }, 0) / Math.max(1, new Set(st.recs.map(function (r) { return r.month; })).size)) : 0;
      st.targets = { monthlyValue: Math.round(avg * 1.05 / 100) * 100, marginPct: st.map.cost ? 50 : null };
      $('#t-value').value = st.targets.monthlyValue; $('#t-margin').value = st.targets.marginPct == null ? '' : st.targets.marginPct; $('#t-margin').disabled = !st.map.cost;
      $('#dash').classList.remove('hidden');
      buildControls(); render();
      status('Loaded "' + name + '": ' + st.parsed.rows.length.toLocaleString() + ' rows, ' + st.parsed.header.length + ' columns, delimiter "' + (st.parsed.delimiter === '\t' ? 'tab' : st.parsed.delimiter) + '", ' + (st.lastSkipped ? st.lastSkipped + ' rows skipped (no valid date or number), ' : '') + 'read in ' + Math.round(performance.now() - t0) + ' ms. Nothing was uploaded.');
    } catch (e) { status('Couldn\'t read that file: ' + e.message); }
  }
  function renormalize() { var n = D.normalize(st.parsed, st.map, st.order); st.recs = n.recs; st.lastSkipped = n.skipped; }
  function opt(list, cur, none) { return (none ? '<option value="">' + none + '</option>' : '') + list.map(function (h) { return '<option' + (h === cur ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join(''); }
  function buildControls() {
    var h = st.parsed.header, num = st.det.numeric, cat = st.det.category.concat(st.det.flag);
    $('#mapping').innerHTML =
      '<div><label for="m-date">Date column</label><select id="m-date" data-k="date">' + opt(st.det.date, st.map.date) + '</select></div>' +
      '<div><label for="m-value">Value to sum</label><select id="m-value" data-k="value">' + opt(num, st.map.value) + '</select></div>' +
      '<div><label for="m-cost">Cost (for margin)</label><select id="m-cost" data-k="cost">' + opt(num, st.map.cost, '(none)') + '</select></div>' +
      '<div><label for="m-flag">Rate column (yes/no)</label><select id="m-flag" data-k="flag">' + opt(st.det.flag, st.map.flag, '(none)') + '</select></div>' +
      '<div><label for="m-cat">Breakdown 1</label><select id="m-cat" data-k="category">' + opt(cat, st.map.category, '(none)') + '</select></div>' +
      '<div><label for="m-seg">Breakdown 2</label><select id="m-seg" data-k="segment">' + opt(cat, st.map.segment, '(none)') + '</select></div>' +
      '<div><label for="m-qty">Quantity</label><select id="m-qty" data-k="qty">' + opt(num, st.map.qty, '(none)') + '</select></div>';
    document.querySelectorAll('#mapping select').forEach(function (s) { s.onchange = function () { st.map[s.dataset.k] = s.value || null; if (s.dataset.k === 'date') st.order = st.det.dateOrder[s.value] || 'mdy'; renormalize(); $('#t-margin').disabled = !st.map.cost; buildFilters(); render(); }; });
    buildFilters();
  }
  function buildFilters() {
    var months = Array.from(new Set(st.recs.map(function (r) { return r.month; }))).sort();
    var cats = Array.from(new Set(st.recs.map(function (r) { return r.category; }))).sort(), segs = Array.from(new Set(st.recs.map(function (r) { return r.segment; }))).sort();
    var mo = function (cur) { return months.map(function (m) { return '<option' + (m === cur ? ' selected' : '') + '>' + m + '</option>'; }).join(''); };
    st.filters.from = st.filters.from && months.indexOf(st.filters.from) !== -1 ? st.filters.from : months[0]; st.filters.to = st.filters.to && months.indexOf(st.filters.to) !== -1 ? st.filters.to : months[months.length - 1];
    $('#filters').innerHTML = '<div><label for="f-from">From month</label><select id="f-from" data-f="from">' + mo(st.filters.from) + '</select></div><div><label for="f-to">To month</label><select id="f-to" data-f="to">' + mo(st.filters.to) + '</select></div>' +
      '<div><label for="f-cat">' + esc(st.map.category || 'Breakdown 1') + '</label><select id="f-cat" data-f="category"><option value="all">All</option>' + opt(cats, st.filters.category) + '</select></div>' +
      '<div><label for="f-seg">' + esc(st.map.segment || 'Breakdown 2') + '</label><select id="f-seg" data-f="segment"><option value="all">All</option>' + opt(segs, st.filters.segment) + '</select></div>';
    document.querySelectorAll('#filters select').forEach(function (s) { s.onchange = function () { st.filters[s.dataset.f] = s.value; render(); }; });
  }
  function current() { var recs = D.filter(st.recs, st.filters); return { recs: recs, a: D.aggregate(recs, st.targets) }; }
  function render() {
    var c = current(), a = c.a, last = a.lastMonth;
    var flagT = last ? D.rag(last.value, st.targets.monthlyValue) : 'none', flagM = a.margin == null ? 'none' : D.rag(a.margin, st.targets.marginPct != null ? st.targets.marginPct / 100 : null);
    var mom = a.mom == null ? '' : '<em class="' + (a.mom >= 0 ? 'up' : 'down') + '">' + (a.mom >= 0 ? '▲ ' : '▼ ') + Math.abs(a.mom * 100).toFixed(1) + '% vs ' + a.prevMonth.month + '</em>';
    $('#kpis').innerHTML =
      '<div class="kpi" id="kpi-total"><b>' + fmt.format(a.total) + '</b><span>Total ' + esc(st.map.value) + ' · ' + a.rows.toLocaleString() + ' rows</span></div>' +
      '<div class="kpi ' + flagT + '" id="kpi-last"><b>' + (last ? fmt.format(last.value) : '—') + '</b><span><span class="dot ' + flagT + '"></span>Latest month' + (last ? ' (' + last.month + ')' : '') + ' vs target ' + fmt.format(st.targets.monthlyValue || 0) + '</span>' + mom + '</div>' +
      '<div class="kpi ' + flagM + '" id="kpi-margin"><b>' + pct(a.margin) + '</b><span><span class="dot ' + flagM + '"></span>' + (st.map.cost ? 'Margin vs target ' + (st.targets.marginPct || 0) + '%' : 'Margin (pick a cost column)') + '</span></div>' +
      '<div class="kpi" id="kpi-avg"><b>' + fmt2.format(a.avg) + '</b><span>Average per row' + (st.map.flag ? ' · ' + esc(st.map.flag) + ' rate ' + pct(a.flagRate) : '') + '</span><em class="muted">' + a.monthsOnTarget + ' of ' + a.monthly.length + ' months on target</em></div>';
    var labels = a.monthly.map(function (m) { return m.month; });
    chart('trend', 'c-trend', { type: 'line', data: { labels: labels, datasets: [{ label: st.map.value, data: a.monthly.map(function (m) { return Math.round(m.value); }), borderColor: '#34f5c5', backgroundColor: 'rgba(52,245,197,.12)', fill: true, tension: .3, pointBackgroundColor: a.monthly.map(function (m) { return { green: '#34f5c5', amber: '#fbbf24', red: '#f87171' }[m.valueFlag] || '#60a5fa'; }), pointRadius: 5 }, { label: 'Target', data: labels.map(function () { return st.targets.monthlyValue || null; }), borderColor: '#fbbf24', borderDash: [6, 5], pointRadius: 0 }] }, options: base() });
    $('#c-cat-title').textContent = 'By ' + (st.map.category || 'category');
    chart('cat', 'c-cat', { type: 'bar', data: { labels: a.byCategory.map(function (x) { return x.name; }), datasets: [{ label: st.map.value, data: a.byCategory.map(function (x) { return Math.round(x.value); }), backgroundColor: PAL }] }, options: Object.assign(base(), { indexAxis: 'y', plugins: { legend: { display: false } } }) });
    $('#c-seg-title').textContent = 'By ' + (st.map.segment || 'segment');
    chart('seg', 'c-seg', { type: 'doughnut', data: { labels: a.bySegment.map(function (x) { return x.name; }), datasets: [{ data: a.bySegment.map(function (x) { return Math.round(x.value); }), backgroundColor: PAL, borderColor: '#0d1222' }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom' } } } });
    $('#mtable thead').innerHTML = '<tr><th>Month</th><th>' + esc(st.map.value) + '</th><th>Target</th><th>Rows</th>' + (st.map.cost ? '<th>Margin</th>' : '') + (st.map.flag ? '<th>' + esc(st.map.flag) + ' rate</th>' : '') + '</tr>';
    $('#mtable tbody').innerHTML = a.monthly.map(function (m) { return '<tr><td>' + m.month + '</td><td><span class="dot ' + m.valueFlag + '"></span>' + fmt.format(m.value) + '</td><td>' + fmt.format(st.targets.monthlyValue || 0) + '</td><td>' + m.rows + '</td>' + (st.map.cost ? '<td><span class="dot ' + m.marginFlag + '"></span>' + pct(m.margin) + '</td>' : '') + (st.map.flag ? '<td>' + pct(m.flagged / m.rows) + '</td>' : '') + '</tr>'; }).join('');
    window.__dash = { total: a.total, rows: a.rows, months: a.monthly.length, flags: a.monthly.map(function (m) { return m.valueFlag; }) };
  }
  function base() { return { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { boxWidth: 12 } } }, scales: { y: { beginAtZero: true } } }; }
  function chart(k, id, cfg) { if (st.charts[k]) st.charts[k].destroy(); st.charts[k] = new Chart(document.getElementById(id), cfg); }
  ['t-value', 't-margin'].forEach(function (id) { $('#' + id).oninput = function () { st.targets.monthlyValue = Number($('#t-value').value) || 0; st.targets.marginPct = $('#t-margin').value === '' ? null : Number($('#t-margin').value); render(); }; });
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function monthlyRows(a) { return a.monthly.map(function (m) { var r = { Month: m.month }; r[st.map.value] = Math.round(m.value * 100) / 100; r.Target = st.targets.monthlyValue || 0; r['vs target'] = m.valueFlag; r.Rows = m.rows; if (st.map.cost) { r['Margin %'] = m.margin == null ? '' : Math.round(m.margin * 1000) / 10; r['Margin flag'] = m.marginFlag; } if (st.map.flag) r[st.map.flag + ' rate %'] = Math.round(1000 * m.flagged / m.rows) / 10; return r; }); }
  function loadXlsx(cb) { if (window.XLSX) return cb(); var s = document.createElement('script'); s.src = 'vendor/xlsx.mini.min.js'; s.onload = cb; s.onerror = function () { status('Could not load the Excel writer.'); }; document.head.appendChild(s); }
  $('#xlsx').onclick = function () {
    loadXlsx(function () {
      var c = current(), a = c.a, wb = XLSX.utils.book_new();
      var sum = [['Oarsman AI CSV dashboard export (demo build)'], ['Source file', st.name], ['Filters', st.filters.from + ' to ' + st.filters.to + ', ' + st.filters.category + ', ' + st.filters.segment], ['Rows', a.rows], ['Total ' + st.map.value, Math.round(a.total * 100) / 100], ['Average per row', Math.round(a.avg * 100) / 100], ['Margin %', a.margin == null ? '' : Math.round(a.margin * 1000) / 10], ['Monthly target', st.targets.monthlyValue || 0], ['Months on target', a.monthsOnTarget + ' of ' + a.monthly.length]];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Summary');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows(a)), 'Monthly');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(a.byCategory.map(function (x) { var r = {}; r[st.map.category || 'category'] = x.name; r[st.map.value] = Math.round(x.value * 100) / 100; return r; })), 'By category');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(c.recs.map(function (r) { return r.raw; })), 'Filtered rows');
      var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'kpi-dashboard.xlsx'); status('Excel file created in your browser: 4 sheets, ' + c.recs.length + ' filtered rows.');
    });
  };
  $('#csvout').onclick = function () { var rows = monthlyRows(current().a); if (!rows.length) return; var h = Object.keys(rows[0]); var q = function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; download(new Blob([[h.map(q).join(',')].concat(rows.map(function (r) { return h.map(function (k) { return q(r[k]); }).join(','); })).join('\n')], { type: 'text/csv' }), 'kpi-monthly.csv'); };
  function readFile(f) { if (!f) return; if (f.size > 50 * 1024 * 1024) return status('That file is over 50 MB, which is too big for an in-browser demo.'); var r = new FileReader(); r.onload = function () { load(r.result, f.name); }; r.readAsText(f); }
  $('#file').onchange = function (e) { readFile(e.target.files[0]); };
  var drop = $('#drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { readFile(e.dataTransfer.files[0]); });
  $('#sample').onclick = function () { status('Loading the sample file…'); fetch('sample-orders.csv').then(function (r) { return r.text(); }).then(function (t) { load(t, 'sample-orders.csv (fictional)'); }); };
  $('#selftest').onclick = function () { var r = window.DashTests.run(); $('#selfscore').textContent = r.passed + '/' + r.results.length + ' passed'; };
  window.__loadCSV = load;
})();
