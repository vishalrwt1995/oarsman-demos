/* Plotboard UI. (c) Oarsman AI, demo build, no client. */
(function () {
  'use strict';
  var Core = window.PlotCore, store = Core.createStore(window.localStorage);
  var SKEY = 'oarsman_plotboard_session';
  var root = document.getElementById('root'), dlg = document.getElementById('dlg'), dform = document.getElementById('dlg-form');
  var ui = { search: '', status: 'all', sort: 'due', dir: 'asc', flash: null };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function me() { var id = localStorage.getItem(SKEY); return id ? store.currentUser(id) : null; }
  function money(n) { var c = store.state.workspace.currency; try { return new Intl.NumberFormat('en', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n); } catch (e) { return c + ' ' + n; } }
  function route() { var h = location.hash; return h.indexOf('#/') === 0 ? h.slice(2) : 'dashboard'; }
  function go(r) { if (location.hash === '#/' + r) render(); else location.hash = '#/' + r; }
  function flash(kind, text) { ui.flash = { kind: kind, text: text }; }
  function attempt(fn, okText) { try { fn(); if (okText) flash('ok', okText); return true; } catch (e) { flash('err', e.message); return false; } finally { render(); } }
  function statusLabel(s) { return { planned: 'Planned', active: 'Active', on_hold: 'On hold', done: 'Done' }[s]; }
  var NAV = [['dashboard', 'Dashboard'], ['projects', 'Projects'], ['clients', 'Clients'], ['team', 'Team'], ['billing', 'Billing'], ['settings', 'Settings'], ['tests', 'Self-tests']];

  function signInView() {
    var accts = store.state.users.slice(0, 3).map(function (u) {
      return '<button class="btn acct" data-email="' + esc(u.email) + '"><span><b>' + esc(u.name) + '</b><br><span class="muted small">' + esc(u.email) + '</span></span><span class="role ' + u.role + '">' + u.role + '</span></button>';
    }).join('');
    return '<div class="card signin"><h2>Sign in to Plotboard</h2><p class="muted small">Mock sign-in for the demo. Every account uses the password <code>demo1234</code>.</p>' +
      (ui.flash ? '<div class="notice ' + ui.flash.kind + '">' + esc(ui.flash.text) + '</div>' : '') +
      '<form id="signin"><label class="lbl" for="em">Email</label><input class="field" style="width:100%" id="em" type="email" autocomplete="username" required>' +
      '<label class="lbl" for="pw">Password</label><input class="field" style="width:100%" id="pw" type="password" autocomplete="current-password" required>' +
      '<p><button class="btn primary" type="submit">Sign in</button></p></form><p class="muted small">Or pick a demo person:</p>' + accts + '</div>';
  }

  function shell(user, body) {
    var r = route().split('/')[0];
    var nav = NAV.map(function (n) { return '<a href="#/' + n[0] + '" class="' + (r === n[0] ? 'on' : '') + '">' + n[1] + '</a>'; }).join('');
    return '<div class="app"><aside class="side"><div class="ws">' + esc(store.state.workspace.name) + ' <span class="role">' + Core.PLANS[store.state.workspace.plan].name + '</span></div>' + nav +
      '<div class="me">' + esc(user.name) + ' <span class="role ' + user.role + '">' + user.role + '</span><br><button class="btn" id="signout">Sign out</button></div></aside>' +
      '<div class="main">' + (ui.flash ? '<div class="notice ' + ui.flash.kind + '" role="status">' + esc(ui.flash.text) + '</div>' : '') + body + '</div></div>';
  }

  function dashboard(user) {
    var s = store.stats();
    var max = Math.max.apply(null, Core.STATUSES.map(function (k) { return s.byStatus[k]; }).concat([1]));
    var bars = Core.STATUSES.map(function (k) { return '<div class="bar"><span>' + statusLabel(k) + '</span><span><i style="width:' + Math.round(100 * s.byStatus[k] / max) + '%"></i></span><b>' + s.byStatus[k] + '</b></div>'; }).join('');
    var act = store.state.activity.slice(0, 6).map(function (a) { return '<li><b>' + esc(a.by) + '</b> ' + esc(a.text) + '</li>'; }).join('');
    return '<h2>Dashboard</h2><p class="muted small">Demo date: ' + store.state.today + '. Signed in as ' + esc(user.name) + ' (' + user.role + ').</p>' +
      '<div class="kpis"><div class="kpi"><b id="k-active">' + s.active + '</b><span>Active projects</span></div><div class="kpi"><b id="k-overdue" class="' + (s.overdue ? 'overdue' : '') + '">' + s.overdue + '</b><span>Overdue</span></div><div class="kpi"><b>' + money(s.budget) + '</b><span>Open budget</span></div><div class="kpi"><b>' + s.hours + '</b><span>Hours logged</span></div></div>' +
      '<div class="grid g2"><div class="card"><h3>Projects by status</h3><div class="bars">' + bars + '</div></div><div class="card"><h3>Recent activity</h3><ul class="clean act">' + act + '</ul></div></div>';
  }

  function projects(user) {
    var rows = store.listProjects(ui);
    var canC = Core.can(user, 'project.create'), canE = Core.can(user, 'project.edit'), canD = Core.can(user, 'project.delete');
    var opts = ['all'].concat(Core.STATUSES).map(function (k) { return '<option value="' + k + '"' + (ui.status === k ? ' selected' : '') + '>' + (k === 'all' ? 'All statuses' : statusLabel(k)) + '</option>'; }).join('');
    var th = function (k, l) { return '<th><a href="#" data-sort="' + k + '" style="color:inherit">' + l + (ui.sort === k ? (ui.dir === 'asc' ? ' ▲' : ' ▼') : '') + '</a></th>'; };
    var body = rows.map(function (p) {
      var c = store.client(p.clientId), o = store.currentUser(p.ownerId), od = p.status !== 'done' && p.due < store.state.today;
      return '<tr data-id="' + p.id + '"><td class="wrap-ok"><b>' + esc(p.name) + '</b></td><td>' + esc(c ? c.name : '—') + '</td><td><span class="st ' + p.status + '">' + statusLabel(p.status) + '</span></td><td>' + esc(o ? o.name : '—') + '</td><td>' + money(p.budget) + '</td><td class="' + (od ? 'overdue' : '') + '">' + p.due + (od ? ' (overdue)' : '') + '</td><td>' +
        (canE ? '<button class="btn" data-edit="' + p.id + '">Edit</button>' : '') + (canD ? '<button class="btn" data-del="' + p.id + '">Delete</button>' : '') + (!canE && !canD ? '<span class="muted small">read-only</span>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="muted">No projects match.</td></tr>';
    return '<h2>Projects <span class="muted small">' + rows.length + ' shown</span></h2>' +
      (user.role === 'viewer' ? '<p class="notice err">You are a viewer, so this page is read-only. Sign in as Asha (admin) or Leo (member) to make changes.</p>' : '') +
      '<div class="toolbar"><input class="field" id="q" placeholder="Search projects or clients" value="' + esc(ui.search) + '" aria-label="Search"><select class="field" id="fs" aria-label="Status filter">' + opts + '</select>' + (canC ? '<button class="btn primary" id="newp">New project</button>' : '') + '</div>' +
      '<div class="table-wrap"><table id="ptable"><thead><tr>' + th('name', 'Project') + '<th>Client</th>' + th('status', 'Status') + '<th>Owner</th>' + th('budget', 'Budget') + th('due', 'Due') + '<th></th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function clients(user) {
    var canC = Core.can(user, 'client.create'), canD = Core.can(user, 'client.delete');
    var rows = store.state.clients.map(function (c) {
      var n = store.state.projects.filter(function (p) { return p.clientId === c.id; }).length;
      return '<tr><td><b>' + esc(c.name) + '</b></td><td>' + esc(c.contact) + '</td><td>' + esc(c.industry) + '</td><td>' + n + '</td><td>' + (canD ? '<button class="btn" data-delc="' + c.id + '">Remove</button>' : '') + '</td></tr>';
    }).join('');
    return '<h2>Clients</h2>' + (canC ? '<form class="toolbar" id="newc"><input class="field" name="name" placeholder="Client name" required aria-label="Client name"><input class="field" name="contact" placeholder="contact@company.example" aria-label="Contact email"><input class="field" name="industry" placeholder="Industry" aria-label="Industry"><button class="btn primary">Add client</button></form>' : '<p class="muted small">Read-only for your role.</p>') +
      '<div class="table-wrap"><table id="ctable"><thead><tr><th>Name</th><th>Contact</th><th>Industry</th><th>Projects</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function team(user) {
    var canM = Core.can(user, 'team.manage'), plan = Core.PLANS[store.state.workspace.plan];
    var rows = store.state.users.map(function (u) {
      var sel = canM ? '<select class="field" data-role="' + u.id + '" aria-label="Role for ' + esc(u.name) + '">' + Core.ROLES.map(function (r) { return '<option' + (r === u.role ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select>' : '<span class="role ' + u.role + '">' + u.role + '</span>';
      return '<tr><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.email) + '</td><td>' + sel + '</td></tr>';
    }).join('');
    var matrix = '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Permission</th><th>admin</th><th>member</th><th>viewer</th></tr></thead><tbody>' + Core.PERMS.admin.map(function (p) { return '<tr><td>' + p + '</td>' + Core.ROLES.map(function (r) { return '<td>' + (Core.PERMS[r].indexOf(p) !== -1 ? '✓' : '—') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    return '<h2>Team <span class="muted small">' + store.state.users.length + ' of ' + plan.seats + ' seats (' + plan.name + ')</span></h2>' +
      (canM ? '<form class="toolbar" id="invite"><input class="field" name="name" placeholder="Name" required aria-label="Name"><input class="field" name="email" type="email" placeholder="name@company.example" required aria-label="Email"><select class="field" name="role" aria-label="Role"><option>member</option><option>viewer</option><option>admin</option></select><button class="btn primary">Invite</button></form>' : '<p class="muted small">Only admins can invite people or change roles.</p>') +
      '<div class="table-wrap"><table id="ttable"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>' + rows + '</tbody></table></div><h3 style="margin-top:16px">Who can do what</h3>' + matrix;
  }

  function billing(user) {
    var cur = store.state.workspace.plan, canB = Core.can(user, 'billing.manage');
    var cards = Object.keys(Core.PLANS).map(function (k) {
      var p = Core.PLANS[k];
      return '<div class="card plan' + (k === cur ? ' cur' : '') + '"><h3>' + p.name + '</h3><div class="stat">$' + p.price + '<small>per month (test mode)</small></div><ul class="clean small"><li>' + p.seats + ' seats</li><li>' + p.projects + ' projects</li></ul>' +
        (k === cur ? '<span class="tag real">Current plan</span>' : canB ? '<button class="btn primary" data-plan="' + k + '">Switch to ' + p.name + '</button>' : '<span class="muted small">Admins manage billing</span>') + '</div>';
    }).join('');
    return '<h2>Billing <span class="tag sim">test mode</span></h2><p class="muted small">No card form, no payment provider and no charges. Switching plans changes the limits straight away so you can see seat and project limits work. A client build would connect Stripe Checkout and webhooks here.</p><div class="plans">' + cards + '</div>';
  }

  function settings(user) {
    var ws = store.state.workspace, canS = Core.can(user, 'settings.edit');
    var dis = canS ? '' : ' disabled';
    return '<h2>Settings</h2><form id="settings" class="card" style="max-width:520px"><label class="lbl" for="wsn">Workspace name</label><input class="field" style="width:100%" id="wsn" name="name" value="' + esc(ws.name) + '"' + dis + '>' +
      '<label class="lbl" for="cur">Currency</label><select class="field" id="cur" name="currency"' + dis + '>' + ['USD', 'EUR', 'GBP', 'INR'].map(function (c) { return '<option' + (c === ws.currency ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>' +
      '<p>' + (canS ? '<button class="btn primary">Save</button>' : '<span class="muted small">Only admins can change settings.</span>') + '</p></form>' +
      '<div class="card" style="max-width:520px;margin-top:12px"><h3>Your data</h3><p class="muted small">Everything is in this browser\'s localStorage under <code>' + Core.KEY + '</code>.</p><button class="btn" id="export">Download JSON</button>' + (Core.can(user, 'data.reset') ? '<button class="btn" id="reset">Reset demo data</button>' : '') + '</div>';
  }

  function tests() {
    var r = window.PlotTests.run();
    var rows = r.results.map(function (x) { return '<div class="testrow"><b class="' + (x.pass ? 'p' : 'f') + '">' + (x.pass ? 'PASS' : 'FAIL') + '</b><span>' + esc(x.name) + (x.err ? ' :: ' + esc(x.err) : '') + '</span></div>'; }).join('');
    return '<h2>Self-tests <span class="tag ' + (r.passed === r.results.length ? 'real' : 'sample') + '" id="test-score">' + r.passed + '/' + r.results.length + ' passed</span></h2><p class="muted small">These unit tests just ran in your browser against a fresh in-memory copy of the app, so your own data wasn\'t touched. The same file runs in Node (<code>node tests.js</code>).</p><button class="btn" id="rerun">Run again</button><div id="tests">' + rows + '</div>';
  }

  function projectDialog(user, p) {
    var isNew = !p; p = p || { name: '', clientId: store.state.clients[0] && store.state.clients[0].id, status: 'planned', budget: '', hours: 0, due: store.state.today, ownerId: user.id };
    var sel = function (name, list, cur) { return '<select class="field" name="' + name + '" id="f-' + name + '">' + list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; };
    dform.innerHTML = '<h3>' + (isNew ? 'New project' : 'Edit project') + '</h3><div id="dlg-err"></div><div class="form2">' +
      '<div class="full"><label class="lbl" for="f-name">Name</label><input class="field" name="name" id="f-name" value="' + esc(p.name) + '"></div>' +
      '<div><label class="lbl" for="f-clientId">Client</label>' + sel('clientId', store.state.clients.map(function (c) { return [c.id, c.name]; }), p.clientId) + '</div>' +
      '<div><label class="lbl" for="f-status">Status</label>' + sel('status', Core.STATUSES.map(function (s) { return [s, statusLabel(s)]; }), p.status) + '</div>' +
      '<div><label class="lbl" for="f-budget">Budget</label><input class="field" name="budget" id="f-budget" inputmode="decimal" value="' + esc(p.budget) + '"></div>' +
      '<div><label class="lbl" for="f-hours">Hours</label><input class="field" name="hours" id="f-hours" inputmode="decimal" value="' + esc(p.hours) + '"></div>' +
      '<div><label class="lbl" for="f-due">Due</label><input class="field" type="date" name="due" id="f-due" value="' + esc(p.due) + '"></div>' +
      '<div><label class="lbl" for="f-ownerId">Owner</label>' + sel('ownerId', store.state.users.map(function (u) { return [u.id, u.name]; }), p.ownerId) + '</div></div>' +
      '<p style="margin-top:14px"><button class="btn primary" value="save" id="dlg-save">Save</button><button class="btn" value="cancel" formnovalidate>Cancel</button></p>';
    dform.onsubmit = function (ev) {
      if (ev.submitter && ev.submitter.value === 'cancel') return;
      ev.preventDefault();
      var data = {}; new FormData(dform).forEach(function (v, k) { data[k] = v; });
      try { if (isNew) store.createProject(user, data); else store.updateProject(user, p.id, data); flash('ok', isNew ? 'Project created.' : 'Project saved.'); dlg.close(); render(); }
      catch (e) { document.getElementById('dlg-err').innerHTML = '<div class="notice err">' + esc(e.message) + '</div>'; }
    };
    dlg.showModal();
  }

  function render() {
    var user = me();
    if (!user) { root.innerHTML = signInView(); ui.flash = null; return bindSignIn(); }
    var r = route().split('/')[0];
    var views = { dashboard: dashboard, projects: projects, clients: clients, team: team, billing: billing, settings: settings, tests: tests };
    root.innerHTML = shell(user, (views[r] || dashboard)(user)); ui.flash = null;
    bind(user);
  }
  function bindSignIn() {
    var signIn = function (email, pw) { try { var u = store.signIn(email, pw); localStorage.setItem(SKEY, u.id); flash('ok', 'Signed in as ' + u.name + ' (' + u.role + ').'); } catch (e) { flash('err', e.message); } render(); };
    document.getElementById('signin').onsubmit = function (e) { e.preventDefault(); signIn(document.getElementById('em').value, document.getElementById('pw').value); };
    root.querySelectorAll('[data-email]').forEach(function (b) { b.onclick = function () { signIn(b.dataset.email, 'demo1234'); }; });
  }
  function bind(user) {
    var $ = function (s) { return root.querySelector(s); }, $$ = function (s) { return root.querySelectorAll(s); };
    $('#signout').onclick = function () { localStorage.removeItem(SKEY); flash('ok', 'Signed out.'); render(); };
    if ($('#q')) { $('#q').oninput = function (e) { ui.search = e.target.value; var pos = e.target.selectionStart; render(); var q = root.querySelector('#q'); q.focus(); q.setSelectionRange(pos, pos); }; $('#fs').onchange = function (e) { ui.status = e.target.value; render(); }; }
    $$('[data-sort]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); var k = a.dataset.sort; ui.dir = ui.sort === k && ui.dir === 'asc' ? 'desc' : 'asc'; ui.sort = k; render(); }; });
    if ($('#newp')) $('#newp').onclick = function () { projectDialog(user); };
    $$('[data-edit]').forEach(function (b) { b.onclick = function () { projectDialog(user, store.state.projects.filter(function (p) { return p.id === b.dataset.edit; })[0]); }; });
    $$('[data-del]').forEach(function (b) { b.onclick = function () { var p = store.state.projects.filter(function (x) { return x.id === b.dataset.del; })[0]; if (confirm('Delete "' + p.name + '"? This cannot be undone.')) attempt(function () { store.deleteProject(user, p.id); }, 'Project deleted.'); }; });
    if ($('#newc')) $('#newc').onsubmit = function (e) { e.preventDefault(); var f = new FormData(e.target); attempt(function () { store.createClient(user, { name: f.get('name'), contact: f.get('contact'), industry: f.get('industry') }); }, 'Client added.'); };
    $$('[data-delc]').forEach(function (b) { b.onclick = function () { attempt(function () { store.deleteClient(user, b.dataset.delc); }, 'Client removed.'); }; });
    if ($('#invite')) $('#invite').onsubmit = function (e) { e.preventDefault(); var f = new FormData(e.target); attempt(function () { store.inviteUser(user, { name: f.get('name'), email: f.get('email'), role: f.get('role') }); }, 'Invite added (demo: no email is sent).'); };
    $$('[data-role]').forEach(function (s) { s.onchange = function () { attempt(function () { store.setRole(user, s.dataset.role, s.value); }, 'Role updated.'); }; });
    $$('[data-plan]').forEach(function (b) { b.onclick = function () { attempt(function () { store.setPlan(user, b.dataset.plan); }, 'Plan switched (test mode, no payment).'); }; });
    if ($('#settings')) $('#settings').onsubmit = function (e) { e.preventDefault(); var f = new FormData(e.target); attempt(function () { store.updateSettings(user, { name: f.get('name'), currency: f.get('currency') }); }, 'Settings saved.'); };
    if ($('#export')) $('#export').onclick = function () { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' })); a.download = 'plotboard-demo-data.json'; a.click(); };
    if ($('#reset')) $('#reset').onclick = function () { if (confirm('Reset all demo data?')) attempt(function () { store.reset(user); }, 'Demo data reset.'); };
    if ($('#rerun')) $('#rerun').onclick = render;
  }
  window.addEventListener('hashchange', function () { render(); var a = document.getElementById('app'); if (a && route() !== 'dashboard' || location.hash.indexOf('#/') === 0) a.scrollIntoView({ block: 'start' }); });
  window.addEventListener('storage', function (e) { if (e.key === Core.KEY || e.key === SKEY) { store.reload(); render(); } });
  render();
})();
