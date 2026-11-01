/*! © 2026 Oarsman AI. Demo use only. Not licensed for reuse, copying or redistribution.
 *  The full AI Front Desk kit: https://oarsmanai.com/agents/front-desk/ */
// ===== AI Front Desk core library (pure functions; runs unchanged in n8n Code nodes and in Node tests) =====
// Needs Luxon's DateTime as a global (n8n provides it in every Code node).
const RC = (() => {
  const TOOL_NAMES = ['check_availability', 'book_appointment', 'cancel_appointment', 'answer_faq', 'take_message', 'escalate_to_human'];
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const str = (v) => (v === undefined || v === null ? '' : String(v)).trim();
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const bool = (v) => v === true || /^(true|yes|1|y)$/i.test(str(v));
  const clean = (rows) => (rows || []).map((r) => (r && r.json ? r.json : r)).filter((r) => r && typeof r === 'object' && !r.error && Object.keys(r).some((k) => str(r[k]) !== ''));
  const digits = (p) => str(p).replace(/[^\d]/g, '');
  const samePhone = (a, b) => { const x = digits(a), y = digits(b); if (x.length < 7 || y.length < 7) return false; return x.slice(-10) === y.slice(-10); };
  const normText = (s) => str(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const parseJSON = (v, d) => { if (v && typeof v === 'object') return v; try { return JSON.parse(str(v)); } catch (e) { return d; } };
  const id = (p) => p + '-' + Math.random().toString(36).slice(2, 7).toUpperCase() + Date.now().toString(36).slice(-3).toUpperCase();

  function settings(cfg) {
    return {
      tz: str(cfg.timezone) || 'America/New_York',
      hours: parseJSON(cfg.hours_json, {}),
      staffed: parseJSON(cfg.staffed_hours_json, null) || parseJSON(cfg.hours_json, {}),
      step: Math.max(5, num(cfg.slot_step_minutes, 15)),
      notice: Math.max(0, num(cfg.min_notice_minutes, 60)),
      ahead: Math.max(1, num(cfg.max_days_ahead, 30)),
      buffer: Math.max(0, num(cfg.buffer_minutes, 0)),
      parallel: Math.max(1, num(cfg.max_parallel, 1)),
      maxOffer: Math.max(1, num(cfg.max_slots_offered, 3)),
      transfer: str(cfg.transfer_number),
      business: str(cfg.business_name) || 'our office',
      currency: str(cfg.currency) || 'USD',
    };
  }
  function now(cfg) {
    const S = settings(cfg);
    const o = str(cfg.now_override);
    return (o ? DateTime.fromISO(o, { setZone: true }) : DateTime.now()).setZone(S.tz);
  }

  // ---------- request parsing (Vapi + Retell) ----------
  // Accepts the secret as x-receptionist-secret header, Bearer token, or ?key= on the URL
  // (Retell's agent webhook cannot send custom headers, so its events URL carries ?key=).
  function authorized(headers, cfg, query) {
    const secret = str(cfg.shared_secret);
    if (!secret || secret === 'CHANGE_ME') return false; // refuse to run with the default secret
    const h = {}; Object.keys(headers || {}).forEach((k) => { h[k.toLowerCase()] = str(headers[k]); });
    const bearer = (h['authorization'] || '').replace(/^Bearer\s+/i, '');
    const q = str((query || {}).key);
    return h['x-receptionist-secret'] === secret || bearer === secret || q === secret;
  }
  function parseToolRequest(body, headers, cfg, query) {
    body = body || {};
    const out = { platform: 'unknown', ok: authorized(headers, cfg, query), calls: [], caller: '', callId: '' };
    if (body.message && (body.message.toolCallList || body.message.toolCalls)) {
      const m = body.message; out.platform = 'vapi';
      out.caller = str(m.call && m.call.customer && m.call.customer.number) || str(m.customer && m.customer.number);
      out.callId = str(m.call && m.call.id);
      (m.toolCallList || m.toolCalls || []).forEach((tc) => {
        const f = tc.function || {};
        out.calls.push({ id: str(tc.id), name: str(f.name || tc.name), args: parseJSON(f.arguments !== undefined ? f.arguments : tc.arguments, {}) || {} });
      });
    } else if (body.name && (body.args || body.call)) {
      out.platform = 'retell';
      out.caller = str(body.call && (body.call.from_number || body.call.from));
      out.callId = str(body.call && body.call.call_id);
      out.calls.push({ id: 'retell', name: str(body.name), args: parseJSON(body.args, {}) || {} });
    }
    return out;
  }
  function formatResponse(platform, results) {
    if (platform === 'retell') {
      const r = results[0] || {}; return { result: r.error ? 'ERROR: ' + r.error : r.result };
    }
    return { results: results.map((r) => (r.error ? { toolCallId: r.toolCallId, error: r.error } : { toolCallId: r.toolCallId, result: r.result })) };
  }

  // ---------- services / hours ----------
  function services(rows) {
    return clean(rows).filter((s) => str(s.name) && !/^(no|false|0)$/i.test(str(s.active)))
      .map((s) => ({ name: str(s.name), duration: Math.max(5, num(s.duration_minutes, 30)), price: num(s.price, 0), description: str(s.description),
        aliases: str(s.aliases).split(/[,;|]/).map(normText).filter(Boolean) }));
  }
  function matchService(q, list) {
    const n = normText(q);
    if (!list.length) return null;
    if (!n) return list.length === 1 ? list[0] : null;
    let best = null, bestScore = 0;
    for (const s of list) {
      const names = [normText(s.name), ...s.aliases];
      for (const nm of names) {
        let sc = 0;
        if (nm === n) sc = 100; else if (nm.includes(n) || n.includes(nm)) sc = 60;
        else { const a = new Set(nm.split(' ')), b = n.split(' '); const hit = b.filter((w) => w.length > 2 && a.has(w)).length; sc = hit ? 20 + hit * 10 : 0; }
        if (sc > bestScore) { bestScore = sc; best = s; }
      }
    }
    return bestScore >= 30 ? best : null;
  }
  function windowsFor(day, hours, tz) { // day: DateTime (in tz) -> [[start,end],...] DateTimes
    const key = DAYS[day.weekday - 1];
    const dateKey = day.toISODate();
    const spec = hours[dateKey] !== undefined ? hours[dateKey] : hours[key]; // date overrides (holidays) win
    if (!Array.isArray(spec)) return [];
    return spec.map(([a, b]) => {
      const [ah, am] = str(a).split(':').map(Number), [bh, bm] = str(b).split(':').map(Number);
      return [day.set({ hour: ah, minute: am || 0, second: 0, millisecond: 0 }), day.set({ hour: bh, minute: bm || 0, second: 0, millisecond: 0 })];
    }).filter(([s, e]) => s.isValid && e.isValid && e > s);
  }
  function busy(appts, tz) {
    // start_utc/end_utc win; rows typed by hand may only have local start/end (business timezone)
    const at = (u, l) => (str(u) ? DateTime.fromISO(str(u), { zone: 'utc' }) : DateTime.fromISO(str(l), { zone: tz || 'utc' }).toUTC());
    return clean(appts).filter((a) => /^(booked|confirmed|blocked)$/i.test(str(a.status) || 'booked'))
      .map((a) => ({ s: at(a.start_utc, a.start), e: at(a.end_utc, a.end), row: a }))
      .filter((b) => b.s.isValid && b.e.isValid);
  }
  function overlaps(s, e, list, buffer) {
    const bs = s.minus({ minutes: buffer }), be = e.plus({ minutes: buffer });
    return list.filter((b) => b.s < be && b.e > bs).length;
  }
  function resolveDate(q, nowDt) {
    const t = normText(q);
    if (!t) return null;
    if (t === 'today') return nowDt.startOf('day');
    if (t === 'tomorrow') return nowDt.plus({ days: 1 }).startOf('day');
    const wd = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].findIndex((d) => t.includes(d));
    if (wd >= 0) { let d = nowDt.startOf('day'); for (let i = 0; i < 8; i++) { if (d.weekday === wd + 1 && (i > 0 || !t.includes('next'))) return d; d = d.plus({ days: 1 }); } }
    const d = DateTime.fromISO(str(q), { zone: nowDt.zoneName });
    return d.isValid ? d.startOf('day') : null;
  }
  function parseStart(q, tz) {
    const s = str(q);
    let d = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? DateTime.fromISO(s, { setZone: true }).setZone(tz) : DateTime.fromISO(s, { zone: tz });
    if (!d.isValid) d = DateTime.fromFormat(s, 'yyyy-MM-dd HH:mm', { zone: tz });
    return d.isValid ? d.set({ second: 0, millisecond: 0 }) : null;
  }
  const spoken = (d) => d.toFormat("cccc d LLLL 'at' h:mm a");
  const localISO = (d) => d.toFormat("yyyy-MM-dd'T'HH:mm");

  function slotCheck(start, svc, appts, cfg, nowDt) { // returns '' if bookable, otherwise a reason code
    const S = settings(cfg);
    const end = start.plus({ minutes: svc.duration });
    if (start < nowDt.plus({ minutes: S.notice })) return start < nowDt ? 'IN_PAST' : 'TOO_SOON';
    if (start > nowDt.plus({ days: S.ahead }).endOf('day')) return 'TOO_FAR';
    const fits = windowsFor(start.startOf('day'), S.hours, S.tz).some(([ws, we]) => start >= ws && end <= we);
    if (!fits) return 'CLOSED';
    if (overlaps(start.toUTC(), end.toUTC(), busy(appts, S.tz), S.buffer) >= S.parallel) return 'TAKEN';
    return '';
  }
  function findSlots(svc, fromDay, pref, appts, cfg, nowDt, limit) {
    const S = settings(cfg); const out = [];
    const last = nowDt.plus({ days: S.ahead }).endOf('day');
    let day = fromDay.startOf('day');
    const p = normText(pref);
    for (let i = 0; i < S.ahead + 1 && out.length < limit && day <= last; i++, day = day.plus({ days: 1 })) {
      for (const [ws, we] of windowsFor(day, S.hours, S.tz)) {
        for (let t = ws; t.plus({ minutes: svc.duration }) <= we && out.length < limit; t = t.plus({ minutes: S.step })) {
          if (p.includes('morning') && t.hour >= 12) continue;
          if (p.includes('afternoon') && (t.hour < 12 || t.hour >= 17)) continue;
          if (p.includes('evening') && t.hour < 17) continue;
          if (!slotCheck(t, svc, appts, cfg, nowDt)) out.push(t);
        }
      }
    }
    return out;
  }
  // Spread offered slots so the caller hears real choices, not 9:00, 9:15, 9:30.
  function spread(slots, n) {
    if (slots.length <= n) return slots;
    const out = [slots[0]];
    for (const s of slots) { if (out.length >= n) break; if (s.diff(out[out.length - 1], 'minutes').minutes >= 60 || s.toISODate() !== out[out.length - 1].toISODate()) out.push(s); }
    for (const s of slots) { if (out.length >= n) break; if (!out.includes(s)) out.push(s); }
    return out.sort((a, b) => a - b);
  }

  // Nearest alternatives on both sides of the requested time: later, earlier, later...
  function nearest(pool, start, n) {
    const after = pool.filter((d) => d > start).sort((a, b) => a - b), before = pool.filter((d) => d < start).sort((a, b) => b - a), out = [];
    while (out.length < n && (after.length || before.length)) { if (after.length) out.push(after.shift()); if (out.length < n && before.length) out.push(before.shift()); }
    return out.sort((a, b) => a - b);
  }
  // ---------- tools ----------
  function checkAvailability(args, ctx) {
    const S = settings(ctx.cfg); const nowDt = ctx.now;
    const svc = matchService(args.service, ctx.services);
    if (!svc) return { result: `UNKNOWN_SERVICE: we offer ${ctx.services.map((s) => s.name).join(', ') || 'no bookable services'}. Ask which one they want.` };
    let day = args.date ? resolveDate(args.date, nowDt) : null;
    if (args.date && !day) return { result: 'BAD_DATE: could not understand the date. Ask the caller for a specific day.' };
    if (day && day < nowDt.startOf('day')) return { result: 'IN_PAST: that date has passed. Ask for another day.' };
    const pool = findSlots(svc, day || nowDt, args.time_preference, ctx.appts, ctx.cfg, nowDt, 40);
    const sameDay = day ? pool.filter((s) => s.toISODate() === day.toISODate()) : [];
    const pick = spread(sameDay.length ? sameDay : pool, S.maxOffer);
    if (!pick.length) return { result: `NO_AVAILABILITY: nothing free for ${svc.name} in the next ${S.ahead} days. Offer to take a message for a callback.` };
    const note = day && !sameDay.length ? `Nothing free on ${day.toFormat('cccc d LLLL')}. ` : '';
    const list = pick.map((s, i) => `[${i + 1}] ${spoken(s)} (start=${localISO(s)})`).join('; ');
    return { result: `AVAILABLE: ${note}${svc.name} (${svc.duration} min${svc.price ? ', ' + svc.price + ' ' + S.currency : ''}). Options: ${list}. Offer these to the caller. To book, call book_appointment with start exactly as shown.`, slots: pick.map(localISO) };
  }
  function bookAppointment(args, ctx) {
    const S = settings(ctx.cfg); const nowDt = ctx.now;
    const svc = matchService(args.service, ctx.services);
    if (!svc) return { result: `UNKNOWN_SERVICE: we offer ${ctx.services.map((s) => s.name).join(', ')}. Confirm the service first.` };
    const name = str(args.name), phone = str(args.phone) || ctx.caller;
    if (!name) return { result: 'MISSING_NAME: ask for the caller\'s name, then try again.' };
    if (digits(phone).length < 7) return { result: 'MISSING_PHONE: ask for a callback number, then try again.' };
    const start = parseStart(args.start, S.tz);
    if (!start) return { result: 'BAD_TIME: start must look like 2026-10-28T15:00. Re-check availability.' };
    // Idempotency: the platform may retry a tool call. Same call + same slot + same phone = same booking.
    const dup = clean(ctx.appts).find((a) => /^booked$/i.test(str(a.status)) && samePhone(a.phone, phone) && str(a.start) === localISO(start) && normText(a.service) === normText(svc.name));
    if (dup) return { result: `BOOKED: ${svc.name} on ${spoken(start)} for ${dup.name}. Booking reference ${dup.booking_id}. (already saved)` };
    const why = slotCheck(start, svc, ctx.appts, ctx.cfg, nowDt);
    if (why) {
      const alt = nearest(findSlots(svc, start, '', ctx.appts, ctx.cfg, nowDt, 60), start, S.maxOffer).map((s) => `${spoken(s)} (start=${localISO(s)})`).join('; ');
      const msg = { IN_PAST: 'that time has passed', TOO_SOON: `we need at least ${S.notice} minutes notice`, TOO_FAR: `we only book ${S.ahead} days ahead`, CLOSED: 'we are closed at that time', TAKEN: 'that slot was just taken' }[why];
      return { result: `NOT_BOOKED (${why}): ${msg}. ${alt ? 'Nearest options: ' + alt + '.' : 'Offer to take a message.'} Nothing was saved.` };
    }
    const end = start.plus({ minutes: svc.duration });
    const row = { booking_id: id('BK'), status: 'booked', service: svc.name, start: localISO(start), end: localISO(end), start_utc: start.toUTC().toISO(), end_utc: end.toUTC().toISO(),
      name, phone, email: str(args.email), notes: str(args.notes).slice(0, 500), price: svc.price || '', source: ctx.platform, call_id: ctx.callId,
      created_at: nowDt.toUTC().toISO(), updated_at: nowDt.toUTC().toISO(), calendar_event_id: '' };
    ctx.appts.push(row); // so a second booking in the same request sees this one
    ctx.writes.appointments.push(row);
    ctx.writes.contacts.push({ phone, name, email: str(args.email), last_booking: `${svc.name} ${localISO(start)}`, updated_at: row.created_at });
    return { result: `BOOKED: ${svc.name} on ${spoken(start)} for ${name}. Booking reference ${row.booking_id}. Read the day and time back to the caller.`, booking: row };
  }
  function cancelAppointment(args, ctx) {
    const nowDt = ctx.now; const phone = ctx.caller || str(args.phone);
    // Security: only bookings made from the caller's own number can be cancelled by phone.
    const mine = clean(ctx.appts).filter((a) => /^booked$/i.test(str(a.status)) && samePhone(a.phone, phone) && DateTime.fromISO(str(a.start_utc), { zone: 'utc' }) > nowDt.toUTC());
    if (!mine.length) return { result: 'NOT_FOUND: no upcoming booking for the number you are calling from. Offer to take a message for the team.' };
    let target = null;
    const ref = str(args.booking_id).toUpperCase();
    if (ref) target = mine.find((a) => str(a.booking_id).toUpperCase() === ref);
    if (!target && args.start) { const s = parseStart(args.start, settings(ctx.cfg).tz); if (s) target = mine.find((a) => str(a.start) === localISO(s)); }
    if (!target && mine.length === 1) target = mine[0];
    if (!target) return { result: `WHICH_ONE: this number has ${mine.length} upcoming bookings: ${mine.map((a) => `${a.service} ${spoken(DateTime.fromISO(a.start_utc).setZone(settings(ctx.cfg).tz))} (ref ${a.booking_id})`).join('; ')}. Ask which one, then call again with booking_id.` };
    const upd = Object.assign({}, target, { status: 'cancelled', updated_at: nowDt.toUTC().toISO(), cancel_reason: str(args.reason).slice(0, 300) });
    Object.assign(target, upd);
    ctx.writes.appointments.push(upd);
    return { result: `CANCELLED: ${upd.service} on ${spoken(DateTime.fromISO(upd.start_utc).setZone(settings(ctx.cfg).tz))} (ref ${upd.booking_id}). Offer to book a new time.` };
  }
  const STOP = new Set('a an the is are do does did you your we our i me my can could would to of for on in at and or with what when where how much many any have has it this that there be open please tell about'.split(' '));
  const toks = (s) => normText(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, ''));
  // FAQ matching. Words found in the question or keywords columns count fully; words found only in the
  // answer text count half (so "Do you take Apple Pay?" finds "Cards, Apple Pay and cash."). An answer-only
  // match (no question/keyword word at all) needs 2+ distinct answer words and a higher score, so a single
  // shared word like "building" or "street" never pulls in an unrelated answer.
  function faqScore(qt, f) {
    const head = new Set([...toks(f.question), ...toks(f.keywords)]);
    const body = new Set(toks(f.answer));
    const uq = [...new Set(qt)];
    const p = uq.filter((w) => head.has(w)).length;
    const a = uq.filter((w) => !head.has(w) && body.has(w)).length;
    if (!p && !a) return { score: 0, p, a };
    const size = new Set([...head, ...body]).size;
    const score = (p + 0.5 * a) / Math.min(uq.length, Math.max(size, 1));
    const ok = p ? score >= 0.34 : (a >= 2 && score >= 0.5);
    return { score: ok ? score : 0, p, a };
  }
  function answerFaq(args, ctx) {
    const q = str(args.question);
    const faqs = clean(ctx.faq).filter((f) => str(f.question) && str(f.answer));
    const qt = toks(q);
    let best = null, bs = { score: 0, p: 0 };
    for (const f of faqs) {
      const sc = faqScore(qt, f);
      if (sc.score > bs.score || (sc.score && sc.score === bs.score && sc.p > bs.p)) { bs = sc; best = f; }
    }
    if (best && bs.score > 0) return { result: `ANSWER: ${str(best.answer)} (Answer in your own words; do not add facts that are not here.)` };
    ctx.writes.faq_gaps.push({ asked_at: ctx.now.toUTC().toISO(), question: q.slice(0, 300), caller: ctx.caller, call_id: ctx.callId });
    return { result: 'NO_MATCH: there is no approved answer. Do not guess. Say you will have the team follow up and offer take_message.' };
  }
  function takeMessage(args, ctx) {
    const urg = /^(high|urgent|emergency)$/i.test(str(args.urgency)) ? 'high' : (/^low$/i.test(str(args.urgency)) ? 'low' : 'normal');
    const phone = str(args.phone) || ctx.caller;
    if (!str(args.message)) return { result: 'MISSING_MESSAGE: ask what the message is.' };
    const row = { message_id: id('MSG'), created_at: ctx.now.toUTC().toISO(), type: 'message', urgency: urg, name: str(args.name), phone, message: str(args.message).slice(0, 1000), call_id: ctx.callId, status: 'open' };
    ctx.writes.messages.push(row);
    if (phone) ctx.writes.contacts.push({ phone, name: str(args.name), updated_at: row.created_at });
    if (urg === 'high') ctx.writes.alerts.push({ kind: 'urgent_message', text: `Urgent message from ${row.name || 'caller'} (${phone}): ${row.message}` });
    return { result: `MESSAGE_TAKEN: reference ${row.message_id}. Tell the caller the team will call back${urg === 'high' ? ' as soon as possible' : ' within one business day'}.` };
  }
  function inHours(spec, d) {
    const S = { tz: d.zoneName };
    return windowsFor(d.startOf('day'), spec || {}, S.tz).some(([s, e]) => d >= s && d < e);
  }
  function escalate(args, ctx) {
    const S = settings(ctx.cfg); const open = !!S.transfer && inHours(S.staffed, ctx.now);
    const row = { message_id: id('ESC'), created_at: ctx.now.toUTC().toISO(), type: 'escalation', urgency: /^(high|urgent|emergency)$/i.test(str(args.urgency)) ? 'high' : 'normal',
      name: str(args.name), phone: ctx.caller || str(args.phone), message: str(args.reason).slice(0, 1000), call_id: ctx.callId, status: open ? 'transferring' : 'open' };
    ctx.writes.messages.push(row);
    ctx.writes.alerts.push({ kind: 'escalation', text: `Caller ${row.phone || ''} asked for a person (${open ? 'transferring now' : 'outside staffed hours, callback needed'}): ${row.message}` });
    return { result: open ? 'TRANSFER_OK: a team member is available. Tell the caller you are connecting them, then use the transferCall tool.' : 'NO_HUMAN: nobody is available right now. Apologise, take their details with take_message (urgency high if it is urgent), and promise a callback.' };
  }
  function handleTools(req, data, cfg) {
    const ctx = { cfg, now: now(cfg), caller: req.caller, callId: req.callId, platform: req.platform, services: services(data.services), faq: data.faq, appts: clean(data.appts).map((a) => Object.assign({}, a)),
      writes: { appointments: [], messages: [], faq_gaps: [], contacts: [], alerts: [] } };
    const fns = { check_availability: checkAvailability, book_appointment: bookAppointment, cancel_appointment: cancelAppointment, answer_faq: answerFaq, take_message: takeMessage, escalate_to_human: escalate };
    const results = req.calls.map((c) => {
      const fn = fns[c.name];
      if (!fn) return { toolCallId: c.id, error: `Unknown tool ${c.name}` };
      try { const r = fn(c.args || {}, ctx); return { toolCallId: c.id, result: r.result }; }
      catch (e) { return { toolCallId: c.id, error: 'SYSTEM_ERROR: ' + (e && e.message ? e.message : e) + '. Apologise and take a message.' }; }
    });
    return { results, writes: ctx.writes };
  }

  // ---------- call events ----------
  // Outcomes come ONLY from our own tool results (role tool_call_result / tool), never from the system prompt,
  // the assistant's words or the analysis text. A real Vapi end-of-call-report includes the system message in
  // artifact.messages, and our prompt mentions TRANSFER_OK / NO_HUMAN / BOOKED, so scanning the whole message list
  // marked greeting-only hang-ups as "transferred, escalated" (fixed in 1.0.3).
  const MARKERS = [['BOOKED:', 'booked'], ['CANCELLED:', 'cancelled'], ['TRANSFER_OK', 'transferred'], ['NO_HUMAN', 'escalated'], ['MESSAGE_TAKEN:', 'message'], ['ANSWER:', 'faq']];
  const TOOL_RESULT_ROLES = ['tool_call_result', 'tool', 'tool_result', 'function_result'];
  function toolResultTexts(list) {
    const out = [];
    const add = (v, depth) => {
      if (v === undefined || v === null || depth > 4) return;
      if (Array.isArray(v)) { v.forEach((x) => add(x, depth + 1)); return; }
      if (typeof v === 'object') {
        if (Array.isArray(v.results)) v.results.forEach((r) => add(r && (r.result !== undefined ? r.result : r.error), depth + 1));
        else if (v.result !== undefined) add(v.result, depth + 1);
        return;
      }
      const s = str(v); if (!s) return;
      if (/^[[{]/.test(s)) { const j = parseJSON(s, null); if (j && typeof j === 'object') { add(j, depth + 1); return; } }
      out.push(s);
    };
    for (const m of (Array.isArray(list) ? list : [])) {
      if (!m || typeof m !== 'object') continue;
      const role = str(m.role).toLowerCase();
      if (TOOL_RESULT_ROLES.includes(role)) add(m.result !== undefined ? m.result : (m.content !== undefined ? m.content : m.message), 0);
      else if (!role && m.result !== undefined) add(m.result, 0); // role-less tool result (older payloads)
    }
    return out;
  }
  function outcomesFromToolResults(texts) {
    return MARKERS.filter(([k]) => texts.some((t) => t.replace(/^\W+/, '').startsWith(k))).map(([, v]) => v);
  }
  function callerSpoke(list, transcript) {
    if (Array.isArray(list) && list.some((m) => m && /^(user|customer|caller)$/i.test(str(m.role)) && str(m.message !== undefined ? m.message : (m.content !== undefined ? m.content : m.words)) !== '')) return true;
    return /^\s*(user|customer|caller)\s*:\s*\S/im.test(str(transcript));
  }
  const transferEnd = (r) => /forward|transfer/i.test(r) && !/fail|error|cancel|reject|no-?answer|busy/i.test(r);
  function parseEvent(body, headers, cfg, query) {
    body = body || {}; const m = body.message || {};
    const ev = { ok: authorized(headers, cfg, query), kind: 'other', platform: 'unknown' };
    if (m.type) { ev.platform = 'vapi'; ev.type = m.type; }
    else if (body.event) { ev.platform = 'retell'; ev.type = body.event; }
    if (ev.type === 'transfer-destination-request') ev.kind = 'transfer';
    if (ev.type === 'end-of-call-report' || ev.type === 'call_analyzed') ev.kind = 'end';
    return ev;
  }
  function transferDestination(cfg) {
    const S = settings(cfg); const n = now(cfg);
    if (S.transfer && inHours(S.staffed, n)) return { destination: { type: 'number', number: S.transfer, message: 'Connecting you to a team member now.' } };
    return { error: 'No team member is available right now. Take a message instead.' };
  }
  function callRecord(body, cfg) {
    const S = settings(cfg); const n = now(cfg);
    const m = body.message || {}; const call = m.call || body.call || {};
    const vapi = !!body.message;
    const artifact = m.artifact || {};
    const caller = vapi ? str(call.customer && call.customer.number) || str(m.customer && m.customer.number) : str(call.from_number);
    const started = vapi ? (m.startedAt || call.startedAt) : (call.start_timestamp ? new Date(call.start_timestamp).toISOString() : '');
    const ended = vapi ? (m.endedAt || call.endedAt) : (call.end_timestamp ? new Date(call.end_timestamp).toISOString() : '');
    let dur = num(m.durationSeconds, NaN);
    if (!Number.isFinite(dur) && started && ended) dur = Math.round((Date.parse(ended) - Date.parse(started)) / 1000);
    if (!Number.isFinite(dur)) dur = 0;
    const transcript = str(vapi ? (artifact.transcript || m.transcript) : call.transcript);
    const list = vapi ? [].concat(artifact.messages || m.messages || [], artifact.messagesOpenAIFormatted || [])
      : [].concat(call.transcript_with_tool_calls || call.transcript_object || []);
    const outcomes = outcomesFromToolResults(toolResultTexts(list));
    const endedReason = str(vapi ? (m.endedReason || call.endedReason) : call.disconnection_reason);
    if (transferEnd(endedReason) && !outcomes.includes('transferred')) outcomes.push('transferred');
    const spoke = callerSpoke(list, transcript);
    const primary = ['booked', 'cancelled', 'transferred', 'escalated', 'message', 'faq'].find((o) => outcomes.includes(o)) || (spoke ? 'none' : 'no_conversation');
    const analysis = m.analysis || call.analysis || {};
    const so = artifact.structuredOutputs || {};
    const soSummary = Object.values(so).map((v) => (v && (v.result || v)) ).find((v) => typeof v === 'string');
    const summary = str(analysis.summary) || str(call.call_analysis && call.call_analysis.call_summary) || str(soSummary) ||
      (primary === 'no_conversation' ? 'Hang-up: the caller did not speak (only the greeting was played).'
        : primary === 'none' ? (dur < 10 ? 'Very short call, no request captured.' : 'Caller did not book, leave a message or get an answer.') : `Outcome: ${outcomes.join(', ')}.`);
    const needsCallback = primary === 'none' && dur >= 10 && digits(caller).length >= 7;
    const rec = { call_id: str(call.id || call.call_id), started_at: started ? DateTime.fromISO(String(started)).toUTC().toISO() : n.toUTC().toISO(), ended_at: ended || '', caller, duration_seconds: dur,
      outcome: primary, outcomes: outcomes.join(','), ended_reason: endedReason, summary: summary.slice(0, 1500), needs_callback: needsCallback ? 'yes' : 'no',
      recording_url: str((artifact.recording && (artifact.recording.stereoUrl || artifact.recording.url || (artifact.recording.mono && artifact.recording.mono.combinedUrl))) || m.recordingUrl || call.recording_url),
      transcript: transcript.slice(0, 20000), logged_at: n.toUTC().toISO() };
    const alerts = [];
    if (needsCallback) alerts.push({ kind: 'callback', text: `Missed opportunity: ${caller} called for ${dur}s and nothing was booked or noted. Call them back. Summary: ${rec.summary}` });
    if (primary === 'escalated') alerts.push({ kind: 'escalation', text: `Caller ${caller} needs a human callback. Summary: ${rec.summary}` });
    const contact = digits(caller).length >= 7 ? { phone: caller, last_call_at: rec.started_at, last_outcome: primary, last_summary: rec.summary.slice(0, 300), updated_at: rec.logged_at } : null;
    return { rec, alerts, contact };
  }
  function slackPayload(text, cfg) { return { text: `:telephone_receiver: ${settings(cfg).business}: ${text}` }; }

  // ---------- daily report ----------
  function dailyReport(data, cfg) {
    const S = settings(cfg); const n = now(cfg); const from = n.minus({ hours: 24 }).toUTC();
    const inWin = (iso) => { const d = DateTime.fromISO(str(iso), { zone: 'utc' }); return d.isValid && d >= from && d <= n.toUTC(); };
    const calls = clean(data.calls).filter((c) => inWin(c.started_at || c.logged_at));
    const booked = clean(data.appts).filter((a) => /^booked$/i.test(str(a.status)) && inWin(a.created_at));
    const cancelled = clean(data.appts).filter((a) => /^cancelled$/i.test(str(a.status)) && inWin(a.updated_at));
    const msgs = clean(data.messages).filter((x) => inWin(x.created_at));
    const gaps = clean(data.gaps).filter((g) => inWin(g.asked_at));
    const cb = calls.filter((c) => str(c.needs_callback) === 'yes');
    const value = booked.reduce((s, a) => s + num(a.price, 0), 0);
    const mins = Math.round(calls.reduce((s, c) => s + num(c.duration_seconds, 0), 0) / 60);
    const upcoming = clean(data.appts).filter((a) => /^booked$/i.test(str(a.status))).map((a) => ({ a, d: DateTime.fromISO(str(a.start_utc), { zone: 'utc' }) }))
      .filter((x) => x.d.isValid && x.d > n.toUTC() && x.d < n.toUTC().plus({ hours: 36 })).sort((x, y) => x.d - y.d);
    const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const stats = { calls: calls.length, minutes: mins, booked: booked.length, cancelled: cancelled.length, messages: msgs.filter((x) => x.type !== 'escalation').length, escalations: msgs.filter((x) => x.type === 'escalation').length, callbacks: cb.length, booked_value: value, faq_gaps: gaps.length };
    const subject = `${S.business} front desk, last 24h: ${stats.calls} calls, ${stats.booked} booked, ${stats.callbacks} to call back`;
    const li = (arr) => arr.length ? '<ul>' + arr.join('') + '</ul>' : '<p>None.</p>';
    const html = `<h2>${esc(S.business)}: AI front desk report</h2><p>${esc(n.minus({ hours: 24 }).toFormat('ccc d LLL HH:mm'))} to ${esc(n.toFormat('ccc d LLL HH:mm'))} (${esc(S.tz)})</p>` +
      `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><td>Calls</td><td>${stats.calls} (${stats.minutes} min)</td></tr><tr><td>New bookings</td><td>${stats.booked} (value ${value} ${esc(S.currency)})</td></tr><tr><td>Cancellations</td><td>${stats.cancelled}</td></tr><tr><td>Messages</td><td>${stats.messages}</td></tr><tr><td>Asked for a person</td><td>${stats.escalations}</td></tr><tr><td>Need a callback</td><td>${stats.callbacks}</td></tr></table>` +
      `<h3>Call these people back</h3>${li(cb.map((c) => `<li>${esc(c.caller)}: ${esc(c.summary)}</li>`).concat(msgs.filter((x) => x.status !== 'done').map((x) => `<li>${esc(x.name || '')} ${esc(x.phone)} [${esc(x.urgency)}]: ${esc(x.message)}</li>`)))}` +
      `<h3>Next 36 hours</h3>${li(upcoming.map((x) => `<li>${esc(x.d.setZone(S.tz).toFormat('ccc d LLL h:mm a'))}: ${esc(x.a.service)} with ${esc(x.a.name)} (${esc(x.a.phone)})</li>`))}` +
      `<h3>Questions the assistant could not answer (add them to the FAQ tab)</h3>${li(gaps.map((g) => `<li>${esc(g.question)}</li>`))}`;
    const text = `${subject}. Minutes: ${stats.minutes}. Messages: ${stats.messages}. Escalations: ${stats.escalations}. Unanswered questions: ${stats.faq_gaps}.`;
    return { stats, subject, html, slack_payload: slackPayload(text, cfg) };
  }

  // ---------- calendar mirror ----------
  function calendarPlan(appts, cfg) {
    const S = settings(cfg); const n = now(cfg);
    const rows = clean(appts);
    const create = rows.filter((a) => /^booked$/i.test(str(a.status)) && !str(a.calendar_event_id) && DateTime.fromISO(str(a.end_utc), { zone: 'utc' }) > n.toUTC());
    const remove = rows.filter((a) => /^cancelled$/i.test(str(a.status)) && str(a.calendar_event_id) && str(a.calendar_event_id) !== 'deleted');
    const when = (a) => { const d = DateTime.fromISO(str(a.start_utc), { zone: 'utc' }); return d.isValid ? d.setZone(S.tz).toFormat('ccc d LLL h:mm a') : str(a.start); };
    return { create: create.map((a) => ({ booking_id: a.booking_id, start: a.start_utc, end: a.end_utc, summary: `${a.service}: ${a.name}`, description: `Phone: ${a.phone}\nEmail: ${a.email || ''}\nNotes: ${a.notes || ''}\nRef: ${a.booking_id} (booked by AI front desk)`, when: when(a), prev_error: str(a.calendar_sync_error) })),
      remove: remove.map((a) => ({ booking_id: a.booking_id, event_id: a.calendar_event_id, summary: `${a.service}: ${a.name}`, when: when(a), prev_error: str(a.calendar_sync_error) })) };
  }
  // Turns the Google Calendar node's per-item output (1 item per input; {error} when it failed and onError=continue)
  // into Appointments row updates + owner alerts. A failure is never silent: the row gets calendar_sync_error and the
  // owner is alerted once per new error (the same error repeating every 5 minutes is not re-alerted).
  function calendarResults(op, planned, outputs) {
    const rows = [], alerts = [], failed = [];
    const errText = (e) => (e && typeof e === 'object' ? str(e.message || e.description || JSON.stringify(e)) : str(e));
    (planned || []).forEach((p, i) => {
      p = (p && p.json) || p || {}; const o = ((outputs || [])[i] && (outputs[i].json || outputs[i])) || null;
      let err = !o ? 'no result from the Google Calendar node' : (o.error ? errText(o.error) || 'unknown error' : '');
      if (op === 'create') {
        if (!err && !str(o.id)) err = 'Google Calendar returned no event id';
        if (!err) { rows.push({ booking_id: p.booking_id, calendar_event_id: str(o.id), calendar_sync_error: '' }); return; }
      } else {
        if (err && /\b(404|410)\b|not ?found|has been deleted|resource has been deleted/i.test(err)) err = ''; // already gone from the calendar = done
        if (!err) { rows.push({ booking_id: p.booking_id, calendar_event_id: 'deleted', calendar_sync_error: '' }); return; }
      }
      const msg = `${op} failed: ${err}`.slice(0, 400);
      rows.push({ booking_id: p.booking_id, calendar_sync_error: msg }); failed.push(p.booking_id);
      if (str(p.prev_error) !== msg) alerts.push({ kind: 'calendar_sync', text: op === 'create'
        ? `Could not add booking ${p.booking_id} (${p.summary || ''}, ${p.when || p.start || ''}) to Google Calendar: ${err}. The booking is safe in the Appointments sheet and will be retried every 5 minutes. Check Config calendar_id (use "primary" or the calendar's email-style ID) and the Google Calendar credential.`
        : `Could not remove cancelled booking ${p.booking_id} (${p.summary || ''}, ${p.when || ''}) from Google Calendar (event ${p.event_id}): ${err}. It will be retried every 5 minutes; delete the event by hand if it persists.` });
    });
    return { rows, alerts, failed };
  }

  return { TOOL_NAMES, settings, now, authorized, parseToolRequest, formatResponse, services, matchService, resolveDate, parseStart, findSlots, slotCheck, checkAvailability, bookAppointment, cancelAppointment, faqScore, answerFaq, takeMessage, escalate, handleTools, inHours, parseEvent, transferDestination, callRecord, toolResultTexts, slackPayload, dailyReport, calendarPlan, calendarResults, clean, samePhone };
})();
