/* Plotboard unit tests. Run in the browser (Self-tests page) or with: node tests.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./core.js')); if (require.main === module) { var r = module.exports.run(); r.results.forEach(function (x) { console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + (x.err ? ' :: ' + x.err : '')); }); console.log(r.passed + '/' + r.results.length + ' unit tests passed'); process.exit(r.passed === r.results.length ? 0 : 1); } }
  else root.PlotTests = factory(root.PlotCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  function mem() { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, _m: m }; }
  function fresh() { var s = mem(); return { st: s, store: Core.createStore(s, { today: '2026-10-31' }) }; }
  var T = [];
  function t(name, fn) { T.push({ name: name, fn: fn }); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
  function throwsCode(fn, code) { try { fn(); } catch (e) { if (e.code === code) return; throw new Error('threw ' + e.code + ' (' + e.message + ') instead of ' + code); } throw new Error('did not throw ' + code); }
  var good = { name: 'New site', clientId: 'c_fern', status: 'planned', budget: '1500', hours: 0, due: '2026-12-01', ownerId: 'u_leo' };
  function U(store, id) { return store.currentUser(id); }

  t('seed: 3 users, 4 clients, 7 projects', function () { var s = fresh().store.state; eq(s.users.length, 3); eq(s.clients.length, 4); eq(s.projects.length, 7); });
  t('sign-in: right password works', function () { eq(fresh().store.signIn('ASHA@plotboard.example', 'demo1234').role, 'admin'); });
  t('sign-in: wrong password refused', function () { throwsCode(function () { fresh().store.signIn('asha@plotboard.example', 'nope'); }, 'AUTH'); });
  t('sign-in: unknown email refused', function () { throwsCode(function () { fresh().store.signIn('x@y.z', 'demo1234'); }, 'AUTH'); });
  t('roles: admin can delete, member cannot, viewer cannot edit', function () { eq(Core.can({ role: 'admin' }, 'project.delete'), true); eq(Core.can({ role: 'member' }, 'project.delete'), false); eq(Core.can({ role: 'viewer' }, 'project.edit'), false); });
  t('create: member creates a valid project', function () { var f = fresh(); var p = f.store.createProject(U(f.store, 'u_leo'), good); eq(f.store.state.projects.length, 8); eq(p.budget, 1500); });
  t('create: viewer is blocked in the core, not just the UI', function () { var f = fresh(); throwsCode(function () { f.store.createProject(U(f.store, 'u_mina'), good); }, 'FORBIDDEN'); eq(f.store.state.projects.length, 7); });
  t('create: empty name rejected', function () { var f = fresh(); throwsCode(function () { f.store.createProject(U(f.store, 'u_asha'), Object.assign({}, good, { name: '  ' })); }, 'INVALID'); });
  t('create: negative budget rejected', function () { var f = fresh(); throwsCode(function () { f.store.createProject(U(f.store, 'u_asha'), Object.assign({}, good, { budget: -5 })); }, 'INVALID'); });
  t('create: bad date rejected', function () { var f = fresh(); throwsCode(function () { f.store.createProject(U(f.store, 'u_asha'), Object.assign({}, good, { due: '31/12/2026' })); }, 'INVALID'); });
  t('create: unknown client rejected', function () { var f = fresh(); throwsCode(function () { f.store.createProject(U(f.store, 'u_asha'), Object.assign({}, good, { clientId: 'c_nope' })); }, 'INVALID'); });
  t('update: member edits status', function () { var f = fresh(); var p = f.store.state.projects[2]; f.store.updateProject(U(f.store, 'u_leo'), p.id, Object.assign({}, p, { status: 'active' })); eq(f.store.state.projects[2].status, 'active'); });
  t('delete: member blocked, admin allowed', function () { var f = fresh(); throwsCode(function () { f.store.deleteProject(U(f.store, 'u_leo'), 'p_1'); }, 'FORBIDDEN'); f.store.deleteProject(U(f.store, 'u_asha'), 'p_1'); eq(f.store.state.projects.length, 6); });
  t('persistence: data survives a reload from storage', function () { var f = fresh(); f.store.createProject(U(f.store, 'u_asha'), good); var again = Core.createStore(f.st); eq(again.state.projects.length, 8); });
  t('persistence: corrupt storage falls back to seed', function () { var s = mem(); s.setItem(Core.KEY, '{broken'); eq(Core.createStore(s).state.projects.length, 7); });
  t('search + filter: "orbit" finds 2, status active finds 3', function () { var st = fresh().store; eq(st.listProjects({ search: 'orbit' }).length, 2); eq(st.listProjects({ status: 'active' }).length, 3); });
  t('sort: by budget desc puts 5,200 first', function () { eq(fresh().store.listProjects({ sort: 'budget', dir: 'desc' })[0].budget, 5200); });
  t('stats: 2 overdue, 3 active on seed data', function () { var s = fresh().store.stats(); eq(s.overdue, 2); eq(s.active, 3); });
  t('clients: duplicate name rejected', function () { var f = fresh(); throwsCode(function () { f.store.createClient(U(f.store, 'u_leo'), { name: 'fernhill bakery' }); }, 'INVALID'); });
  t('clients: cannot delete a client that has projects', function () { var f = fresh(); throwsCode(function () { f.store.deleteClient(U(f.store, 'u_asha'), 'c_fern'); }, 'INVALID'); });
  t('team: Free plan seat limit (3) blocks a 4th invite', function () { var f = fresh(); throwsCode(function () { f.store.inviteUser(U(f.store, 'u_asha'), { name: 'Kai', email: 'kai@plotboard.example', role: 'member' }); }, 'INVALID'); });
  t('billing: admin upgrades to Pro (test mode), then invite works', function () { var f = fresh(); var a = U(f.store, 'u_asha'); f.store.setPlan(a, 'pro'); f.store.inviteUser(a, { name: 'Kai', email: 'kai@plotboard.example', role: 'member' }); eq(f.store.state.users.length, 4); });
  t('billing: member cannot change plan', function () { var f = fresh(); throwsCode(function () { f.store.setPlan(U(f.store, 'u_leo'), 'team'); }, 'FORBIDDEN'); });
  t('team: last admin cannot be demoted', function () { var f = fresh(); throwsCode(function () { f.store.setRole(U(f.store, 'u_asha'), 'u_asha', 'member'); }, 'INVALID'); });
  t('team: role change takes effect at once', function () { var f = fresh(); f.store.setRole(U(f.store, 'u_asha'), 'u_mina', 'member'); eq(Core.can(U(f.store, 'u_mina'), 'project.create'), true); });
  t('settings: viewer cannot rename workspace', function () { var f = fresh(); throwsCode(function () { f.store.updateSettings(U(f.store, 'u_mina'), { name: 'x', currency: 'USD' }); }, 'FORBIDDEN'); });
  t('activity: every write is logged', function () { var f = fresh(); var n = f.store.state.activity.length; f.store.createProject(U(f.store, 'u_leo'), good); eq(f.store.state.activity.length, n + 1); });
  t('reset: admin restores the seed data', function () { var f = fresh(); var a = U(f.store, 'u_asha'); f.store.deleteProject(a, 'p_1'); f.store.reset(a); eq(f.store.state.projects.length, 7); });

  function run() {
    var results = T.map(function (x) { try { x.fn(); return { name: x.name, pass: true }; } catch (e) { return { name: x.name, pass: false, err: e.message }; } });
    return { results: results, passed: results.filter(function (r) { return r.pass; }).length };
  }
  return { run: run, count: T.length };
});
