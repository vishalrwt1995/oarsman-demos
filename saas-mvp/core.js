/* Plotboard core: data model, roles and persistence for the Oarsman AI SaaS MVP demo.
   (c) Oarsman AI. Demo build, no client. Fictional product and data. Runs in the browser or Node (for tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlotCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KEY = 'oarsman_plotboard_v1';
  var ROLES = ['admin', 'member', 'viewer'];
  var STATUSES = ['planned', 'active', 'on_hold', 'done'];
  var PLANS = {
    free: { name: 'Free', price: 0, seats: 3, projects: 10 },
    pro: { name: 'Pro', price: 19, seats: 10, projects: 100 },
    team: { name: 'Team', price: 49, seats: 50, projects: 1000 }
  };
  // What each role may do. The UI hides buttons, but every write below is also checked here (like a server would).
  var PERMS = {
    admin: ['project.create', 'project.edit', 'project.delete', 'client.create', 'client.edit', 'client.delete', 'team.manage', 'billing.manage', 'settings.edit', 'data.reset'],
    member: ['project.create', 'project.edit', 'client.create', 'client.edit'],
    viewer: []
  };
  function can(user, action) { return !!user && (PERMS[user.role] || []).indexOf(action) !== -1; }
  function AuthError(action) { var e = new Error('Not allowed: your role cannot do "' + action + '".'); e.code = 'FORBIDDEN'; return e; }
  function ValidationError(msg) { var e = new Error(msg); e.code = 'INVALID'; return e; }
  function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(base, n) { var d = new Date(base.getTime()); d.setUTCDate(d.getUTCDate() + n); return iso(d); }

  function seed(today) {
    var t = today ? new Date(today + 'T00:00:00Z') : new Date(Date.UTC(2026, 9, 31));
    var users = [
      { id: 'u_asha', name: 'Asha Rao', email: 'asha@plotboard.example', role: 'admin', password: 'demo1234' },
      { id: 'u_leo', name: 'Leo Park', email: 'leo@plotboard.example', role: 'member', password: 'demo1234' },
      { id: 'u_mina', name: 'Mina Ortiz', email: 'mina@plotboard.example', role: 'viewer', password: 'demo1234' }
    ];
    var clients = [
      { id: 'c_fern', name: 'Fernhill Bakery', contact: 'ops@fernhill.example', industry: 'Food & drink' },
      { id: 'c_tide', name: 'Tidewater Dental', contact: 'frontdesk@tidewater.example', industry: 'Healthcare' },
      { id: 'c_orbit', name: 'Orbit Cycles', contact: 'hello@orbitcycles.example', industry: 'Retail' },
      { id: 'c_lumen', name: 'Lumen Studio', contact: 'team@lumen.example', industry: 'Design' }
    ];
    var P = function (id, name, client, status, owner, budget, hours, dueIn) { return { id: id, name: name, clientId: client, status: status, ownerId: owner, budget: budget, hours: hours, due: addDays(t, dueIn), createdAt: addDays(t, -30 + (id.length % 7)) }; };
    var projects = [
      P('p_1', 'Online ordering site', 'c_fern', 'active', 'u_leo', 4200, 64, 12),
      P('p_2', 'Booking reminders (SMS)', 'c_tide', 'active', 'u_asha', 1800, 22, 5),
      P('p_3', 'Spring catalogue shoot', 'c_orbit', 'planned', 'u_leo', 2600, 0, 40),
      P('p_4', 'Brand refresh', 'c_lumen', 'on_hold', 'u_asha', 3500, 18, -3),
      P('p_5', 'Inventory sync', 'c_orbit', 'active', 'u_leo', 5200, 41, -2),
      P('p_6', 'Patient intake form', 'c_tide', 'done', 'u_asha', 1200, 15, -20),
      P('p_7', 'Holiday menu landing page', 'c_fern', 'planned', 'u_leo', 900, 0, 25)
    ];
    return {
      version: 1, workspace: { name: 'Plotboard Demo Agency', currency: 'USD', plan: 'free' },
      users: users, clients: clients, projects: projects,
      activity: [{ at: t.toISOString(), by: 'system', text: 'Demo workspace created with fictional data' }],
      today: iso(t)
    };
  }

  function createStore(storage, opts) {
    opts = opts || {};
    var state;
    function load() {
      var raw = storage && storage.getItem(KEY);
      if (raw) { try { state = JSON.parse(raw); if (!state || state.version !== 1) state = null; } catch (e) { state = null; } }
      if (!state) { state = seed(opts.today); save(); }
      return state;
    }
    function save() { if (storage) storage.setItem(KEY, JSON.stringify(state)); }
    function log(user, text) { state.activity.unshift({ at: new Date().toISOString(), by: user ? user.name : 'system', text: text }); state.activity = state.activity.slice(0, 50); }
    function need(user, action) { if (!can(user, action)) throw AuthError(action); }
    function findUser(id) { return state.users.filter(function (u) { return u.id === id; })[0]; }
    function cleanStr(v, field, max) { v = String(v == null ? '' : v).trim(); if (!v) throw ValidationError(field + ' is required.'); if (v.length > (max || 80)) throw ValidationError(field + ' is too long (max ' + (max || 80) + ').'); return v; }
    function validateProject(input) {
      var out = {};
      out.name = cleanStr(input.name, 'Project name', 80);
      if (!state.clients.some(function (c) { return c.id === input.clientId; })) throw ValidationError('Pick a client.');
      out.clientId = input.clientId;
      if (STATUSES.indexOf(input.status) === -1) throw ValidationError('Unknown status.');
      out.status = input.status;
      var b = Number(input.budget); if (!isFinite(b) || b < 0 || b > 10000000) throw ValidationError('Budget must be a number between 0 and 10,000,000.');
      out.budget = Math.round(b * 100) / 100;
      var h = Number(input.hours || 0); if (!isFinite(h) || h < 0 || h > 100000) throw ValidationError('Hours must be 0 or more.');
      out.hours = Math.round(h * 10) / 10;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.due || '')) || isNaN(Date.parse(input.due))) throw ValidationError('Due date must be a valid date.');
      out.due = input.due;
      out.ownerId = findUser(input.ownerId) ? input.ownerId : null;
      if (!out.ownerId) throw ValidationError('Pick an owner.');
      return out;
    }
    load();
    var api = {
      get state() { return state; },
      reload: load,
      signIn: function (email, password) {
        var u = state.users.filter(function (x) { return x.email.toLowerCase() === String(email || '').trim().toLowerCase(); })[0];
        if (!u || u.password !== password) { var e = new Error('Email or password is wrong.'); e.code = 'AUTH'; throw e; }
        return { id: u.id, name: u.name, email: u.email, role: u.role };
      },
      currentUser: function (id) { var u = findUser(id); return u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null; },
      listProjects: function (q) {
        q = q || {}; var term = String(q.search || '').toLowerCase();
        var rows = state.projects.filter(function (p) {
          if (q.status && q.status !== 'all' && p.status !== q.status) return false;
          if (!term) return true;
          var c = api.client(p.clientId); return (p.name + ' ' + (c ? c.name : '')).toLowerCase().indexOf(term) !== -1;
        });
        var key = q.sort || 'due', dir = q.dir === 'desc' ? -1 : 1;
        rows.sort(function (a, b) { var x = a[key], y = b[key]; return (x > y ? 1 : x < y ? -1 : 0) * dir; });
        return rows;
      },
      client: function (id) { return state.clients.filter(function (c) { return c.id === id; })[0]; },
      createProject: function (user, input) {
        need(user, 'project.create');
        var plan = PLANS[state.workspace.plan];
        if (state.projects.length >= plan.projects) throw ValidationError('The ' + plan.name + ' plan allows ' + plan.projects + ' projects. Upgrade on the Billing page (test mode).');
        var p = validateProject(input); p.id = uid('p'); p.createdAt = state.today;
        state.projects.push(p); log(user, 'created project "' + p.name + '"'); save(); return p;
      },
      updateProject: function (user, id, input) {
        need(user, 'project.edit');
        var p = state.projects.filter(function (x) { return x.id === id; })[0]; if (!p) throw ValidationError('Project not found.');
        var v = validateProject(input); Object.keys(v).forEach(function (k) { p[k] = v[k]; });
        log(user, 'updated project "' + p.name + '"'); save(); return p;
      },
      deleteProject: function (user, id) {
        need(user, 'project.delete');
        var i = state.projects.findIndex(function (x) { return x.id === id; }); if (i < 0) throw ValidationError('Project not found.');
        var p = state.projects.splice(i, 1)[0]; log(user, 'deleted project "' + p.name + '"'); save(); return true;
      },
      createClient: function (user, input) {
        need(user, 'client.create');
        var c = { id: uid('c'), name: cleanStr(input.name, 'Client name', 60), contact: String(input.contact || '').trim(), industry: String(input.industry || '').trim() || 'Other' };
        if (c.contact && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.contact)) throw ValidationError('Contact must be an email address.');
        if (state.clients.some(function (x) { return x.name.toLowerCase() === c.name.toLowerCase(); })) throw ValidationError('A client with that name already exists.');
        state.clients.push(c); log(user, 'added client "' + c.name + '"'); save(); return c;
      },
      deleteClient: function (user, id) {
        need(user, 'client.delete');
        if (state.projects.some(function (p) { return p.clientId === id; })) throw ValidationError('This client still has projects. Move or delete them first.');
        var i = state.clients.findIndex(function (x) { return x.id === id; }); if (i < 0) throw ValidationError('Client not found.');
        var c = state.clients.splice(i, 1)[0]; log(user, 'removed client "' + c.name + '"'); save(); return true;
      },
      inviteUser: function (user, input) {
        need(user, 'team.manage');
        var plan = PLANS[state.workspace.plan];
        if (state.users.length >= plan.seats) throw ValidationError('The ' + plan.name + ' plan has ' + plan.seats + ' seats and they are all used. Upgrade on the Billing page (test mode).');
        var email = String(input.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw ValidationError('Enter a valid email.');
        if (state.users.some(function (u) { return u.email === email; })) throw ValidationError('That person is already on the team.');
        if (ROLES.indexOf(input.role) === -1) throw ValidationError('Unknown role.');
        var u = { id: uid('u'), name: cleanStr(input.name, 'Name', 60), email: email, role: input.role, password: 'demo1234' };
        state.users.push(u); log(user, 'invited ' + u.name + ' as ' + u.role); save(); return u;
      },
      setRole: function (user, id, role) {
        need(user, 'team.manage');
        if (ROLES.indexOf(role) === -1) throw ValidationError('Unknown role.');
        var u = findUser(id); if (!u) throw ValidationError('User not found.');
        if (u.role === 'admin' && role !== 'admin' && state.users.filter(function (x) { return x.role === 'admin'; }).length === 1) throw ValidationError('The workspace needs at least one admin.');
        u.role = role; log(user, 'changed ' + u.name + ' to ' + role); save(); return u;
      },
      setPlan: function (user, plan) {
        need(user, 'billing.manage');
        if (!PLANS[plan]) throw ValidationError('Unknown plan.');
        if (state.users.length > PLANS[plan].seats) throw ValidationError('You have ' + state.users.length + ' people; ' + PLANS[plan].name + ' allows ' + PLANS[plan].seats + '.');
        state.workspace.plan = plan; log(user, 'switched plan to ' + PLANS[plan].name + ' (test mode, no payment)'); save(); return state.workspace;
      },
      updateSettings: function (user, input) {
        need(user, 'settings.edit');
        state.workspace.name = cleanStr(input.name, 'Workspace name', 60);
        if (['USD', 'EUR', 'GBP', 'INR'].indexOf(input.currency) === -1) throw ValidationError('Unknown currency.');
        state.workspace.currency = input.currency; log(user, 'updated workspace settings'); save(); return state.workspace;
      },
      reset: function (user) { need(user, 'data.reset'); state = seed(opts.today); save(); return state; },
      stats: function () {
        var today = state.today, s = { total: state.projects.length, active: 0, overdue: 0, budget: 0, hours: 0, byStatus: {} };
        STATUSES.forEach(function (k) { s.byStatus[k] = 0; });
        state.projects.forEach(function (p) {
          s.byStatus[p.status]++; if (p.status === 'active') s.active++;
          if (p.status !== 'done' && p.due < today) s.overdue++;
          if (p.status !== 'done') s.budget += p.budget; s.hours += p.hours;
        });
        return s;
      }
    };
    return api;
  }
  return { createStore: createStore, can: can, seed: seed, ROLES: ROLES, STATUSES: STATUSES, PLANS: PLANS, PERMS: PERMS, KEY: KEY };
});
