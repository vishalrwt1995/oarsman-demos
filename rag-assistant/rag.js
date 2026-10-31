/* Oarsman AI RAG demo engine: BM25 retrieval + extractive answers with citations + "I don't know" gate.
   No language model: every answer sentence is copied word for word from the handbook. (c) Oarsman AI, demo build, no client. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RagEngine = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var STOP = ('a an the and or but if of to in on at for from by with about as into than then so is are was were be been being am do does did doing have has had having ' +
    'i me my we our you your he she it its they them their this that these those there here what which who whom whose when where why how ' +
    'can could should would will shall may might must need needs please tell know want get got go going much many long often any some every each ' +
    'not no yes also just only very more most other same such own too up down out over again further once all both few nor per via let lets like ' +
    'brightmoor company handbook policy policies rule rules happen happens allowed allow work working employee employees staff people someone tell').split(' ');
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });
  // Hand-written synonym list for this handbook's domain (query expansion). Keys and values are stemmed at load.
  var SYN = {
    pto: ['vacation'], annual: ['vacation'], holiday: ['vacation', 'holiday'], vacation: ['vacation'], dayoff: ['vacation'], leave: ['vacation', 'leave'],
    ill: ['sick'], illness: ['sick'], sick: ['sick'], unwell: ['sick'],
    maternity: ['parental'], paternity: ['parental'], baby: ['parental'], adoption: ['parental'],
    wfh: ['remote'], home: ['remote', 'home'], abroad: ['country'], country: ['country'],
    reimburse: ['expense', 'reimbursed'], reimbursement: ['expense', 'reimbursed'], claim: ['expense', 'claim'], receipt: ['receipt'],
    salary: ['salary', 'pay'], paid: ['paid', 'pay'], payday: ['paid', 'payroll'], paycheck: ['payroll', 'paid'],
    computer: ['laptop'], laptop: ['laptop'], mac: ['laptop'],
    '2fa': ['mfa'], twofactor: ['mfa'], mfa: ['mfa'],
    training: ['learning'], course: ['learning', 'course'], conference: ['conference', 'learning'], book: ['book'],
    quit: ['notice', 'leaving'], resign: ['notice', 'leaving'], resignation: ['notice', 'leaving'],
    refer: ['referral'], friend: ['referral', 'refer'],
    medical: ['health', 'insurance'], doctor: ['doctor', 'health'], dentist: ['dental'], dental: ['dental'],
    hack: ['security'], hacked: ['security'], scam: ['phishing'], phish: ['phishing'],
    harass: ['harassment'], bully: ['bullying'], complaint: ['concern', 'report'],
    gym: ['gym', 'wellbeing'], fitness: ['wellbeing', 'gym'],
    meeting: ['meeting'], flight: ['flight', 'flights'], fly: ['flight'], plane: ['flight'], hotel: ['hotel', 'hotels'], meal: ['meal', 'per diem'], food: ['meal'],
    raise: ['salary'], required: ['mandatory', 'required'], require: ['mandatory'], compulsory: ['mandatory'], promotion: ['review', 'salary'], appraisal: ['review'],
    retirement: ['pension'], '401k': ['pension'], chair: ['chair', 'home office'], desk: ['desk'], internet: ['internet'], wifi: ['internet']
  };
  function stem(w) {
    if (w.length <= 3) return w;
    w = w.replace(/'s$/, '');
    if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
    if (/sses$/.test(w)) return w.slice(0, -2);
    if (/ing$/.test(w) && w.length > 5) { w = w.slice(0, -3); return w.replace(/(.)\1$/, '$1'); }
    if (/ed$/.test(w) && w.length > 4) { w = w.slice(0, -2); return w.replace(/(.)\1$/, '$1'); }
    if (/s$/.test(w) && !/ss$/.test(w) && !/us$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function words(text) { return String(text).toLowerCase().replace(/days? off/g, 'dayoff').replace(/two[- ]factor/g, 'twofactor').replace(/per diem/g, 'perdiem').match(/[a-z0-9]+(?:'[a-z]+)?/g) || []; }
  function tokens(text) { return words(text).filter(function (w) { return !STOPSET[w]; }).map(stem); }
  var SYNS = {}; Object.keys(SYN).forEach(function (k) { SYNS[stem(k)] = SYN[k].reduce(function (a, v) { return a.concat(tokens(v)); }, []); });
  function splitSentences(p) { return p.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(function (s) { return s.trim(); }).filter(Boolean); }

  function build(handbook, opts) {
    opts = opts || {}; var k1 = 1.2, b = 0.75;
    var MIN_COVERAGE = opts.minCoverage != null ? opts.minCoverage : 0.5, MIN_SCORE = opts.minScore != null ? opts.minScore : 3.0;
    var chunks = [];
    handbook.sections.forEach(function (s) { s.paras.forEach(function (p, i) { var toks = tokens(s.title.replace(/^\d+\.\s*/, '')).concat(tokens(p)); chunks.push({ id: s.id + '#' + i, section: s.id, title: s.title, para: i, text: p, toks: toks, tf: tf(toks) }); }); });
    function tf(t) { var m = {}; t.forEach(function (x) { m[x] = (m[x] || 0) + 1; }); return m; }
    var N = chunks.length, avgdl = chunks.reduce(function (a, c) { return a + c.toks.length; }, 0) / N, df = {};
    chunks.forEach(function (c) { Object.keys(c.tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    function idf(t) { var n = df[t] || 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)); }
    var vocab = df;
    function expand(q) {
      var base = tokens(q), terms = {}, groups = [];
      base.forEach(function (t) { var g = [t].concat(SYNS[t] || []); groups.push({ term: t, alts: g }); terms[t] = Math.max(terms[t] || 0, 1); (SYNS[t] || []).forEach(function (s) { terms[s] = Math.max(terms[s] || 0, 0.6); }); });
      return { base: base, terms: terms, groups: groups };
    }
    function score(c, terms) { var s = 0; Object.keys(terms).forEach(function (t) { var f = c.tf[t]; if (!f) return; s += terms[t] * idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * c.toks.length / avgdl)); }); return s; }
    function search(q, k) { var e = expand(q); return { e: e, hits: chunks.map(function (c) { return { c: c, s: score(c, e.terms) }; }).filter(function (h) { return h.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, k || 5) }; }
    function ask(q) {
      var r = search(q, 5), e = r.e, hits = r.hits;
      var known = e.groups.filter(function (g) { return g.alts.some(function (a) { return vocab[a]; }); });
      var sectionToks = {}; if (hits[0]) hits.filter(function (h) { return h.c.section === hits[0].c.section; }).concat(chunks.filter(function (c) { return c.section === hits[0].c.section; }).map(function (c) { return { c: c }; })).forEach(function (h) { h.c.toks.forEach(function (t) { sectionToks[t] = 1; }); });
      var covered = e.groups.filter(function (g) { return g.alts.some(function (a) { return sectionToks[a]; }); });
      var coverage = e.groups.length ? covered.length / e.groups.length : 0, top = hits[0] ? hits[0].s : 0;
      var debug = { terms: e.base, expanded: Object.keys(e.terms).filter(function (t) { return e.base.indexOf(t) === -1; }), coverage: Math.round(coverage * 100) / 100, topScore: Math.round(top * 100) / 100, unknownTerms: e.groups.filter(function (g) { return known.indexOf(g) === -1; }).map(function (g) { return g.term; }),
        retrieved: hits.map(function (h) { return { id: h.c.id, title: h.c.title, score: Math.round(h.s * 100) / 100 }; }), thresholds: { minCoverage: MIN_COVERAGE, minScore: MIN_SCORE } };
      if (!e.groups.length || !hits.length || top < MIN_SCORE || coverage < MIN_COVERAGE) {
        var why = !e.groups.length ? 'The question has no searchable words.' : !hits.length ? 'No handbook passage shares any words with the question.' : top < MIN_SCORE ? 'The best passage matched too weakly (score ' + debug.topScore + ' < ' + MIN_SCORE + ').' : 'The best section covers only ' + Math.round(coverage * 100) + '% of the question\'s key words (needs ' + Math.round(MIN_COVERAGE * 100) + '%).';
        return { refused: true, answer: [], sources: [], reason: why, debug: debug };
      }
      // Extractive answer: best sentences from passages that score close to the top one.
      var cands = [];
      hits.forEach(function (h, rank) {
        if (h.s < top * 0.6) return;
        splitSentences(h.c.text).forEach(function (s, i) {
          var st = tf(tokens(s)), v = 0; Object.keys(e.terms).forEach(function (t) { if (st[t]) v += e.terms[t] * idf(t); });
          if (v > 0) cands.push({ text: s, chunk: h.c, v: v + (rank === 0 ? 0.5 : 0), order: rank * 100 + i });
        });
      });
      cands.sort(function (a, b) { return b.v - a.v; });
      var picked = cands.slice(0, 1); var second = cands.filter(function (c, i) { return i > 0 && c.chunk.section === cands[0].chunk.section; })[0]; if (second && second.v >= cands[0].v * 0.7) picked.push(second);
      
      var sources = [];
      var answer = picked.map(function (p) { var n = sources.findIndex(function (s) { return s.id === p.chunk.id; }); if (n === -1) { sources.push({ id: p.chunk.id, section: p.chunk.section, title: p.chunk.title, para: p.chunk.para, text: p.chunk.text }); n = sources.length - 1; } return { text: p.text, cite: n + 1 }; });
      return { refused: false, answer: answer, sources: sources, debug: debug };
    }
    return { ask: ask, search: search, chunks: chunks, tokens: tokens };
  }
  return { build: build, tokens: tokens, stem: stem };
});
