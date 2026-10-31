/* RAG demo UI. (c) Oarsman AI, demo build, no client. */
(function () {
  'use strict';
  var H = window.HANDBOOK, rag = window.RagEngine.build(H), EV = window.EVALSET;
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  $('#hbmeta').textContent = H.company + ' employee handbook ' + H.version + ', updated ' + H.updated + '. ' + H.sections.length + ' sections. Fictional.';
  $('#hbtext').innerHTML = H.sections.map(function (s) { return '<h3 class="hbh" id="s-' + s.id + '">' + esc(s.title) + '</h3>' + s.paras.map(function (p, i) { return '<p id="p-' + s.id + '-' + i + '">' + esc(p) + '</p>'; }).join(''); }).join('');
  function show(id) {
    var el = document.getElementById('p-' + id.replace('#', '-')); if (!el) return;
    document.querySelectorAll('.hb p.hit').forEach(function (p) { p.classList.remove('hit'); }); el.classList.add('hit');
    var box = $('#hb'); box.scrollTop = el.offsetTop - box.offsetTop - 60;
    if (window.innerWidth < 860) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function add(cls, html) { var d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html; $('#chat').appendChild(d); $('#chat').scrollTop = 1e6; return d; }
  function howTable(r) {
    var d = r.debug;
    return '<details class="how"><summary>How this was found</summary><div>Key words: ' + esc(d.terms.join(', ') || '(none)') + (d.expanded.length ? ' · synonyms added: ' + esc(d.expanded.join(', ')) : '') + (d.unknownTerms.length ? ' · not in handbook: ' + esc(d.unknownTerms.join(', ')) : '') +
      '<br>Coverage ' + Math.round(d.coverage * 100) + '% (min ' + Math.round(d.thresholds.minCoverage * 100) + '%) · top BM25 score ' + d.topScore + ' (min ' + d.thresholds.minScore + ')</div>' +
      (d.retrieved.length ? '<div class="table-wrap" style="margin-top:4px"><table><thead><tr><th>Passage</th><th>BM25</th></tr></thead><tbody>' + d.retrieved.map(function (x) { return '<tr><td>' + esc(x.title) + ' ¶' + (Number(x.id.split('#')[1]) + 1) + '</td><td>' + x.score + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') + '</details>';
  }
  function ask(q) {
    q = String(q || '').trim(); if (!q) return;
    add('user', '<span class="who">You</span>' + esc(q));
    var r = rag.ask(q);
    if (r.refused) {
      add('bot idk', '<span class="who">Assistant</span>I don\'t know. The Brightmoor handbook doesn\'t seem to cover that, so I won\'t guess. Try asking the People team at people@brightmoor.example.<div class="srcs">Why: ' + esc(r.reason) + '</div>' + howTable(r));
    } else {
      var body = r.answer.map(function (a) { return esc(a.text) + '<sup class="cite"><a href="#" data-src="' + r.sources[a.cite - 1].id + '">' + a.cite + '</a></sup>'; }).join(' ');
      var srcs = r.sources.map(function (s, i) { return '[' + (i + 1) + '] <a href="#" data-src="' + s.id + '">' + esc(s.title) + ', paragraph ' + (s.para + 1) + '</a>'; }).join('<br>');
      add('bot', '<span class="who">Assistant · quoted from the handbook</span>' + body + '<div class="srcs">' + srcs + '</div>' + howTable(r));
      show(r.sources[0].id);
    }
  }
  $('#chat').addEventListener('click', function (e) { var a = e.target.closest('[data-src]'); if (a) { e.preventDefault(); show(a.dataset.src); } });
  $('#askform').onsubmit = function (e) { e.preventDefault(); ask($('#q').value); $('#q').value = ''; };
  ['How many vacation days do I get?', 'Do I need a receipt for a 30 euro lunch?', 'What is the hotel limit in London?', 'Can I bring my dog to the office?', 'What is the capital of France?'].forEach(function (s) {
    var b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = s; b.onclick = function () { ask(s); }; $('#sugs').appendChild(b);
  });
  add('bot', '<span class="who">Assistant</span>Hi! Ask me about vacation, sick leave, expenses, travel, security, pay or benefits at Brightmoor Labs (a fictional company). I only quote the handbook, and I\'ll say if I don\'t know.');
  function runEval() {
    var pass = 0, rows = EV.map(function (x, i) {
      var r = rag.ask(x.q), ok, got;
      if (x.oos) { ok = r.refused; got = r.refused ? 'I don\'t know' : 'Answered from ' + r.sources[0].section; }
      else { var txt = r.answer.map(function (a) { return a.text; }).join(' '); ok = !r.refused && r.sources[0].section === x.section && txt.indexOf(x.expect) !== -1; got = r.refused ? 'I don\'t know' : r.sources[0].section + ': ' + txt; }
      if (ok) pass++;
      return '<tr><td>' + (i + 1) + '</td><td class="wrap-ok">' + esc(x.q) + '</td><td class="wrap-ok">' + (x.oos ? 'I don\'t know' : esc(x.section + ' + "' + x.expect + '"')) + '</td><td class="wrap-ok">' + esc(got.length > 140 ? got.slice(0, 140) + '…' : got) + '</td><td class="' + (ok ? 'pass' : 'fail') + '">' + (ok ? 'PASS' : 'FAIL') + '</td></tr>';
    });
    var inS = EV.filter(function (x) { return !x.oos; }).length;
    $('#evaltable tbody').innerHTML = rows.join('');
    $('#evalscore').innerHTML = pass + '/' + EV.length + ' <small>passed (' + inS + ' in-scope, ' + (EV.length - inS) + ' out-of-scope). Failures are left visible on purpose.</small>';
    return { pass: pass, total: EV.length };
  }
  $('#runeval').onclick = runEval;
  window.__runEval = runEval;
})();
