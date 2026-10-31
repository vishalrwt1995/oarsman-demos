/* Unit tests for dash-core.js. Run: node tests.js (also run in the browser by the Self-check button). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { var fs = require('fs'), path = require('path'); module.exports = factory(require('./dash-core.js'), fs.readFileSync(path.join(__dirname, 'sample-orders.csv'), 'utf8')); if (require.main === module) { var r = module.exports.run(); r.results.forEach(function (x) { console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.err ? ' :: ' + x.err : '')); }); console.log(r.passed + '/' + r.results.length + ' unit tests passed'); process.exit(r.passed === r.results.length ? 0 : 1); } }
  else root.DashTests = factory(root.DashCore, null);
})(typeof self !== 'undefined' ? self : this, function (D, SAMPLE) {
  var T = []; function t(n, f) { T.push({ name: n, fn: f }); }
  function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
  function near(a, b, e) { if (Math.abs(a - b) > (e || 1e-6)) throw new Error(a + ' not near ' + b); }
  t('CSV: quoted commas, escaped quotes and newlines in quotes', function () { var p = D.parseCSV('a,b\n"x, y","say ""hi"""\n"multi\nline",2\n'); eq(p.rows.length, 2); eq(p.rows[0].a, 'x, y'); eq(p.rows[0].b, 'say "hi"'); eq(p.rows[1].a, 'multi\nline'); });
  t('CSV: CRLF line endings and BOM', function () { var p = D.parseCSV('\uFEFFa,b\r\n1,2\r\n3,4\r\n'); eq(p.header[0], 'a'); eq(p.rows.length, 2); });
  t('CSV: semicolon delimiter detected', function () { eq(D.parseCSV('a;b\n1;2').delimiter, ';'); });
  t('CSV: tab delimiter detected', function () { eq(D.parseCSV('a\tb\n1\t2').delimiter, '\t'); });
  t('CSV: blank and duplicate headers fixed', function () { var p = D.parseCSV('x,,x\n1,2,3'); eq(p.header.join('|'), 'x|column_2|x_2'); });
  t('CSV: empty file rejected', function () { try { D.parseCSV(''); } catch (e) { return; } throw new Error('no error'); });
  t('numbers: $1,234.50, (200), 1.234,5 and 12%', function () { eq(D.toNumber('$1,234.50'), 1234.5); eq(D.toNumber('(200)'), -200); eq(D.toNumber('1.234,5'), 1234.5); eq(D.toNumber('12%'), 12); eq(isNaN(D.toNumber('abc')), true); });
  t('dates: ISO, US and day-first; invalid 2026-02-30 rejected', function () { eq(D.parseDate('2026-03-04').getUTCDate(), 4); eq(D.parseDate('03/04/2026', 'mdy').getUTCMonth(), 2); eq(D.parseDate('25/12/2026', 'dmy').getUTCMonth(), 11); eq(D.parseDate('2026-02-30'), null); });
  t('detect: day-first dates found when a day is > 12', function () { var p = D.parseCSV('d,v\n25/01/2026,1\n02/02/2026,2'); var d = D.detectColumns(p); eq(d.date[0], 'd'); eq(d.dateOrder.d, 'dmy'); });
  t('RAG flags: >=100% green, >=90% amber, else red', function () { eq(D.rag(100, 100), 'green'); eq(D.rag(91, 100), 'amber'); eq(D.rag(89, 100), 'red'); eq(D.rag(5, 0), 'none'); });
  t('aggregate: totals, margin, flag rate on a tiny set', function () {
    var p = D.parseCSV('date,rev,cost,cat,ret\n2026-01-05,100,60,A,0\n2026-01-20,50,20,B,1\n2026-02-03,150,90,A,0\n');
    var map = D.guessMapping(D.detectColumns(p), p.header); eq(map.value, 'rev'); eq(map.cost, 'cost'); eq(map.flag, 'ret');
    var n = D.normalize(p, map, 'mdy'), a = D.aggregate(n.recs, { monthlyValue: 160 });
    eq(a.total, 300); near(a.margin, (300 - 170) / 300); near(a.flagRate, 1 / 3); eq(a.monthly.length, 2); eq(a.monthly[0].valueFlag, RAGX(150, 160)); near(a.mom, 0); eq(a.byCategory[0].name, 'A');
    function RAGX(x, y) { return D.rag(x, y); }
  });
  t('normalize: rows with bad dates or values are skipped and counted', function () { var p = D.parseCSV('date,rev\n2026-01-01,10\nnot a date,5\n2026-01-02,n/a\n'); var n = D.normalize(p, { date: 'date', value: 'rev' }, 'mdy'); eq(n.recs.length, 1); eq(n.skipped, 2); });
  t('filter: month range and category', function () { var p = D.parseCSV('date,rev,cat\n2026-01-01,10,A\n2026-02-01,20,B\n2026-03-01,30,A\n'); var n = D.normalize(p, { date: 'date', value: 'rev', category: 'cat' }, 'mdy'); eq(D.filter(n.recs, { from: '2026-02', to: '2026-03' }).length, 2); eq(D.filter(n.recs, { category: 'A' }).length, 2); });
  if (SAMPLE) t('sample file: 1,551 orders, 12 months, revenue 128,908.69', function () {
    var p = D.parseCSV(SAMPLE), det = D.detectColumns(p), map = D.guessMapping(det, p.header);
    eq(map.date, 'order_date'); eq(map.value, 'revenue'); eq(map.cost, 'cost'); eq(map.category, 'category'); eq(map.segment, 'channel'); eq(map.flag, 'returned');
    var a = D.aggregate(D.normalize(p, map, 'mdy').recs); eq(a.rows, 1551); eq(a.monthly.length, 12); near(a.total, 128908.69, 0.01);
  });
  function run() { var results = T.map(function (x) { try { x.fn(); return { name: x.name, pass: true }; } catch (e) { return { name: x.name, pass: false, err: e.message }; } }); return { results: results, passed: results.filter(function (r) { return r.pass; }).length }; }
  return { run: run };
});
