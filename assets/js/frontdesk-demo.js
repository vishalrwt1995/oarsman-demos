/* AI Front Desk browser demo.
   The tool logic is the real engine (frontdesk-core.js, copied unchanged from the
   "Handle tool calls" Code node of workflow 01-tool-router.json, AI Front Desk v1.0.4).
   The caller lines and the receptionist's wording are scripted here: in production an
   AI voice model (Vapi or Retell) chooses the tool calls and speaks the replies. */
(function () {
  'use strict';
  const DT = luxon.DateTime;
  const TZ = 'America/New_York';
  const HOURS = { mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '19:00']], fri: [['09:00', '17:00']], sat: [['10:00', '14:00']] };
  // A placeholder, not a real key: the engine refuses to run without a shared secret, so the demo sends this one.
  const DEMO_SECRET = 'demo-only-placeholder';
  const CFG = {
    business_name: 'Maple Street Salon', timezone: TZ, hours_json: JSON.stringify(HOURS),
    staffed_hours_json: JSON.stringify({ mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']] }),
    slot_step_minutes: 15, min_notice_minutes: 60, max_days_ahead: 30, buffer_minutes: 10, max_parallel: 1, max_slots_offered: 3,
    transfer_number: '+15550100', shared_secret: DEMO_SECRET, currency: 'USD'
  };
  const SERVICES = [
    { name: 'Haircut', duration_minutes: 30, price: 35, aliases: 'trim, cut', active: 'yes' },
    { name: 'Colour', duration_minutes: 90, price: 120, aliases: 'color, dye, highlights', active: 'yes' },
    { name: 'Beard trim', duration_minutes: 20, price: 18, aliases: 'beard, shave', active: 'yes' }
  ];
  const FAQ = [
    { question: 'Do you have parking?', answer: 'Yes, free parking behind the building on Maple Street.', keywords: 'parking car park' },
    { question: 'What forms of payment do you accept?', answer: 'Cards, Apple Pay and cash.', keywords: 'pay payment card cash' },
    { question: 'Where are you located?', answer: '12 Maple Street, Springfield.', keywords: 'address location located where' },
    { question: 'What is your cancellation policy?', answer: 'Please give us at least 12 hours notice to cancel or move a booking.', keywords: 'cancel cancellation policy late fee' },
    { question: 'Do you do kids haircuts?', answer: 'Yes, kids under 12 are 25 USD, same 30 minute slot.', keywords: 'kids children child' }
  ];
  const ME = '+15550142', OTHER = '+15550199';
  let caller = ME, callN = 0, state;

  function nextOpenDay(from) { let d = from.plus({ days: 1 }); while (!HOURS[d.toFormat('ccc').toLowerCase()]) d = d.plus({ days: 1 }); return d; }
  function seed() {
    const now = DT.now().setZone(TZ);
    const d1 = nextOpenDay(now), d2 = nextOpenDay(d1);
    const mk = (id, status, service, day, hh, mins, name, phone) => {
      const s = day.set({ hour: hh, minute: 0, second: 0, millisecond: 0 }), e = s.plus({ minutes: mins });
      return { booking_id: id, status, service, start: s.toFormat("yyyy-MM-dd'T'HH:mm"), end: e.toFormat("yyyy-MM-dd'T'HH:mm"), start_utc: s.toUTC().toISO(), end_utc: e.toUTC().toISO(), name: name || '', phone: phone || '', price: service === 'Haircut' ? 35 : '' };
    };
    return {
      appts: [mk('BK-EXIST1', 'booked', 'Haircut', d1, 14, 30, 'Ann Lee', '+1 (555) 777-1111'), mk('BLOCK1', 'blocked', 'Staff training', d2, 9, 180)],
      contacts: [{ phone: '+1 (555) 777-1111', name: 'Ann Lee', last_booking: 'Haircut ' + d1.toFormat("yyyy-MM-dd'T'14:00") }],
      messages: [], faq_gaps: [], alerts: [], d1, d2
    };
  }

  // ---- one webhook round trip through the real engine ----
  function callTool(name, args) {
    callN += 1;
    const body = { message: { type: 'tool-calls', call: { id: 'demo-call-' + callN, customer: { number: caller } }, toolCallList: [{ id: 'tc' + callN, type: 'function', function: { name, arguments: args } }] } };
    const req = RC.parseToolRequest(body, { 'x-receptionist-secret': DEMO_SECRET }, CFG, {});
    const r = RC.handleTools(req, { services: SERVICES, faq: FAQ, appts: state.appts }, CFG);
    const response = RC.formatResponse(req.platform, r.results);
    applyWrites(r.writes);
    showWire(body, response, r.writes);
    const first = r.results[0] || {};
    document.dispatchEvent(new CustomEvent('fd:tool', { detail: { tool: name, args, caller, result: first.error ? 'ERROR: ' + first.error : first.result } }));
    return first.error ? 'ERROR: ' + first.error : first.result;
  }
  function applyWrites(w) {
    w.appointments.forEach((row) => { const i = state.appts.findIndex((a) => a.booking_id === row.booking_id); if (i >= 0) state.appts[i] = Object.assign({}, state.appts[i], row); else state.appts.push(row); });
    w.contacts.forEach((c) => { const i = state.contacts.findIndex((x) => RC.samePhone(x.phone, c.phone)); if (i >= 0) state.contacts[i] = Object.assign({}, state.contacts[i], Object.fromEntries(Object.entries(c).filter(([, v]) => v !== ''))); else state.contacts.push(c); });
    state.messages.push(...w.messages); state.faq_gaps.push(...w.faq_gaps); state.alerts.push(...w.alerts);
    renderSheet();
  }

  // ---- UI ----
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function say(who, text) {
    const el = document.createElement('div'); el.className = 'msg ' + who;
    el.innerHTML = (who === 'sys' ? '' : '<span class="who">' + (who === 'caller' ? 'Caller (you, ' + fmtPhone(caller) + ')' : 'Front desk (scripted wording)') + '</span>') + esc(text);
    $('#chat').appendChild(el); $('#chat').scrollTop = $('#chat').scrollHeight;
    document.dispatchEvent(new CustomEvent('fd:say', { detail: { who, text } }));
  }
  function fmtPhone(p) { return p === ME ? '+1 555 0142' : '+1 555 0199'; }
  function choices(list) {
    const box = $('#choices'); box.innerHTML = '';
    list.forEach(([label, fn]) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.onclick = () => { box.innerHTML = ''; fn(); }; box.appendChild(b); });
  }
  function showWire(req, res, writes) {
    $('#wire-req').textContent = JSON.stringify(req, null, 2);
    $('#wire-res').textContent = JSON.stringify(res, null, 2);
    const w = Object.entries(writes).filter(([, v]) => v.length).map(([k, v]) => k + ': ' + v.length + ' row(s)').join(', ');
    $('#wire-writes').textContent = w ? 'Sheet writes from this call: ' + w : 'No sheet writes from this call.';
  }
  const COLS = {
    Appointments: ['booking_id', 'status', 'service', 'start', 'name', 'phone', 'price'],
    Contacts: ['phone', 'name', 'last_booking'], Messages: ['message_id', 'type', 'urgency', 'name', 'phone', 'message', 'status'],
    FAQ_Gaps: ['asked_at', 'question', 'caller'], Alerts: ['kind', 'text']
  };
  let tab = 'Appointments';
  function renderSheet() {
    const rows = { Appointments: state.appts, Contacts: state.contacts, Messages: state.messages, FAQ_Gaps: state.faq_gaps, Alerts: state.alerts }[tab];
    const cols = COLS[tab];
    $('#sheet').innerHTML = '<table><thead><tr>' + cols.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
      (rows.length ? rows.map((r) => '<tr>' + cols.map((c) => '<td' + (c === 'message' || c === 'text' || c === 'question' ? ' class="wrap-ok"' : '') + '>' + esc(r[c]) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + cols.length + '" class="muted">No rows yet</td></tr>') + '</tbody></table>';
    document.querySelectorAll('#sheet-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('#sheet-tabs button').forEach((b) => { const n = { Appointments: state.appts, Contacts: state.contacts, Messages: state.messages, FAQ_Gaps: state.faq_gaps, Alerts: state.alerts }[b.dataset.tab].length; b.textContent = b.dataset.tab + ' (' + n + ')'; });
  }

  // Turns an engine result into what a receptionist would say. Wording is scripted; the facts come from the result.
  function speak(result) {
    const code = result.split(':')[0];
    const body = result.slice(code.length + 1).trim();
    if (code === 'ANSWER') return body.replace(/\s*\(Answer in your own words.*$/, '');
    if (code === 'NO_MATCH') return "I don't have an approved answer for that, and I won't guess. I've noted the question for the team. Would you like me to take a message so someone calls you back?";
    if (code === 'BOOKED') return "You're booked: " + body.replace(/ Read the day and time back.*$/, '').replace(/\. Booking reference/, '. Your reference is') + ' See you then!';
    if (code === 'CANCELLED') return 'Done, I have cancelled your ' + body.replace(/\.? Offer to book a new time\.$/, '') + '. Would you like a new time?';
    if (code === 'NOT_FOUND') return "I can't find an upcoming booking for the number you're calling from, so I can't cancel anything by phone. I can take a message for the team.";
    if (code.startsWith('NOT_BOOKED')) {
      const why = (body.match(/^[^.]*/) || [''])[0];
      const alts = (body.match(/Nearest options: (.*?)\. Nothing was saved/) || [, ''])[1].replace(/\s*\(start=[^)]*\)/g, '').split('; ').filter(Boolean);
      return 'Sorry, ' + why + '. ' + (alts.length ? 'The nearest free times are ' + alts.join(', ') + '. Nothing has been booked yet.' : 'Can I take a message instead?');
    }
    if (code === 'TRANSFER_OK') return 'Of course, one moment while I connect you to the team.';
    if (code === 'NO_HUMAN') return "Nobody from the team is available right now. I'll take your details and mark it urgent so they call you back as soon as possible.";
    if (code === 'MESSAGE_TAKEN') return 'Got it, ' + body.replace(/^reference /, 'your reference is ').replace(/ Tell the caller the team will call back/, ' The team will call you back') ;
    return result;
  }
  function turn(callerText, tool, args, after) {
    say('caller', callerText);
    const res = callTool(tool, args);
    say('sys', 'Tool call → ' + tool + ' → ' + res.split(':')[0]);
    say('desk', speak(res));
    if (after) after(res); else menu();
  }

  function book(service, dayWord, pref, label) {
    turn(label, 'check_availability', { service, date: dayWord, time_preference: pref }, (res) => {
      const m = /AVAILABLE/.test(res) ? res : null;
      if (!m) return menu();
      const starts = [...res.matchAll(/\[(\d)\] ([^(]+) \(start=([^)]+)\)/g)];
      $('#chat').lastChild.textContent = '';
      $('#chat').lastChild.innerHTML = '<span class="who">Front desk (scripted wording)</span>' + esc(((res.match(/Nothing free on [^.]*\./) || [''])[0] ? (res.match(/Nothing free on [^.]*\./)[0].replace('Nothing free on', "We're fully booked or closed on") + ' ') : '') + 'I have ' + starts.map((s) => s[2].trim()).join(', or ') + '. Which works for you?');
      document.dispatchEvent(new CustomEvent('fd:say', { detail: { who: 'desk', text: $('#chat').lastChild.textContent.replace(/^Front desk \(scripted wording\)/, '') } }));
      choices(starts.map((s) => [s[2].trim(), () => {
        say('caller', 'The ' + s[2].trim().replace(/^\w+ /, '') + ' one, please.');
        say('desk', 'Great. Can I have your name?');
        say('caller', 'Sam Demo.');
        say('desk', 'Thanks Sam. That is ' + service + ' on ' + s[2].trim() + ', calling from ' + fmtPhone(caller) + '. Shall I book it?');
        choices([['Yes, book it', () => turn('Yes, please.', 'book_appointment', { service, start: s[3], name: 'Sam Demo', phone: caller })], ['No, never mind', () => { say('caller', 'Actually, no thanks.'); say('desk', 'No problem, nothing has been booked.'); menu(); }]]);
      }]).concat([['None of these', () => { say('caller', 'None of those work.'); say('desk', 'No problem. Nothing is booked. I can check another day or take a message.'); menu(); }]]));
    });
  }
  function menu() {
    const ann = state.appts.find((a) => a.booking_id === 'BK-EXIST1');
    choices([
      ['Book a haircut tomorrow morning', () => book('haircut', 'tomorrow', 'morning', "Hi, I'd like a haircut tomorrow morning.")],
      ['Book colour on ' + state.d2.toFormat('cccc') + ' morning (blocked)', () => book('color', state.d2.toFormat('cccc').toLowerCase(), 'morning', 'Can I get my hair coloured on ' + state.d2.toFormat('cccc') + ' morning?')],
      ['Ask for a slot that is already taken', () => turn('Can you book me a haircut at ' + DT.fromISO(ann.start_utc).setZone(TZ).toFormat("cccc 'at' h:mm a") + '? Name is Sam Demo.', 'book_appointment', { service: 'haircut', start: ann.start, name: 'Sam Demo', phone: caller })],
      ['Do you have parking?', () => turn('Do you have parking?', 'answer_faq', { question: 'Do you have parking?' })],
      ['Do you sell gift cards?', () => turn('Do you sell gift cards?', 'answer_faq', { question: 'Do you sell gift cards?' }, () => choices([['Yes, take a message', () => turn("Yes please, I'd like to buy a gift card for my sister.", 'take_message', { name: 'Sam Demo', message: 'Wants to buy a gift card. Asked if we sell them.', urgency: 'normal' })], ['No thanks', () => { say('caller', 'No thanks.'); menu(); }]]))],
      ['Cancel my booking', () => turn("Please cancel my booking. It's Sam.", 'cancel_appointment', { reason: 'caller asked to cancel' })],
      ["I need the owner, it's urgent", () => turn("Can I speak to the owner? It's urgent, I had a reaction to a product.", 'escalate_to_human', { reason: 'Possible reaction to a product used at the salon', urgency: 'urgent', name: 'Sam Demo' }, (res) => { if (/NO_HUMAN/.test(res)) turn('Okay. Please ask them to call me.', 'take_message', { name: 'Sam Demo', message: 'Possible reaction to a product used at the salon. Please call back.', urgency: 'urgent' }); else menu(); })]
    ]);
  }
  function setCaller(p) {
    caller = p;
    document.dispatchEvent(new CustomEvent('fd:newcall', { detail: { caller: p } }));
    document.querySelectorAll('#caller-pick button').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
    say('sys', 'New call from ' + fmtPhone(p) + (p === OTHER ? ' (a different person: try "Cancel my booking" to see the safety check)' : ''));
  }
  function start() {
    state = seed(); callN = 0; caller = ME; $('#chat').innerHTML = '';
    document.dispatchEvent(new CustomEvent('fd:start', { detail: { caller: ME } }));
    const now = DT.now().setZone(TZ);
    $('#clock').textContent = now.toFormat("cccc d LLLL, h:mm a") + ' in New York (the demo salon\'s time zone)';
    say('sys', 'Call connected from +1 555 0142. Engine is running in your browser.');
    say('desk', 'Thanks for calling Maple Street Salon, this is the virtual front desk. How can I help?');
    document.querySelectorAll('#caller-pick button').forEach((b) => b.classList.toggle('on', b.dataset.p === ME));
    $('#wire-req').textContent = '(make a choice to see the request)'; $('#wire-res').textContent = ''; $('#wire-writes').textContent = '';
    renderSheet(); menu();
  }
  // Hooks for the voice layer (front-desk/voice.js): same engine, same turns, just another way in.
  window.FD = { turn, book, menu, say, choices, ME, OTHER, fmtPhone, TZ, getState: () => state, getCaller: () => caller };
  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#sheet-tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; renderSheet(); }; });
    document.querySelectorAll('#caller-pick button').forEach((b) => { b.onclick = () => setCaller(b.dataset.p); });
    $('#reset').onclick = start;
    $('#free-form').onsubmit = (e) => { e.preventDefault(); const q = $('#free-q').value.trim(); if (!q) return; $('#free-q').value = ''; if (window.FD_ROUTE) window.FD_ROUTE(q, 'typed'); else turn(q, 'answer_faq', { question: q }); };
    start();
  });
})();
