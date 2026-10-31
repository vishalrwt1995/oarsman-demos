/* (c) Oarsman AI. Demo use only, not licensed for reuse.
   Voice layer for the AI Front Desk demo. Speech in: the browser's own speech recognition (Web Speech API).
   Speech out: the browser's own speech synthesis. The words you say are routed to a tool by simple keyword
   rules written for this demo (in the real kit an AI voice model on Vapi or Retell does this step).
   The tool calls still go through the real engine. Typing uses exactly the same route. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  // ---------- intent routing (demo rules, not AI) ----------
  function pickChoice(t) {
    const btns = [...document.querySelectorAll('#choices button')];
    if (!btns.length) return null;
    const time = t.match(/\b(\d{1,2})(?::|\.| )?(\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/);
    if (/^(yes|yeah|yep|sure|please do|ok|okay|book it|go ahead)\b/.test(t)) return btns.find((b) => /^Yes/.test(b.textContent));
    if (/^(no|nope|never ?mind)\b/.test(t)) return btns.find((b) => /^No\b|None of these/.test(b.textContent));
    if (/none|neither|different|another day/.test(t)) return btns.find((b) => /None of these/.test(b.textContent));
    const ord = ['first', 'second', 'third'].findIndex((w) => t.includes(w));
    const slotBtns = btns.filter((b) => /\d:\d\d/.test(b.textContent));
    if (ord >= 0 && slotBtns[ord]) return slotBtns[ord];
    if (time && slotBtns.length) {
      const hh = time[1], mm = time[2] || '00';
      const hit = slotBtns.find((b) => b.textContent.includes(' ' + Number(hh) + ':' + mm));
      if (hit) return hit;
    }
    return null;
  }
  function route(raw, how) {
    const text = String(raw).trim(); if (!text) return;
    const t = text.toLowerCase();
    log(how, text);
    const choice = pickChoice(t);
    if (choice) { choice.click(); return 'choice'; }
    document.querySelector('#choices').innerHTML = '';
    const FD = window.FD;
    if (/\bcancel\b/.test(t)) { FD.turn(text, 'cancel_appointment', { reason: 'caller asked to cancel' }); return 'cancel'; }
    if (/\b(owner|manager|human|real person|someone|somebody|urgent|emergency|speak to|talk to)\b/.test(t)) {
      FD.turn(text, 'escalate_to_human', { reason: text.slice(0, 160), urgency: /urgent|emergency|asap|reaction|hurt|pain/.test(t) ? 'urgent' : 'normal', name: 'Sam Demo' }, (res) => {
        if (/NO_HUMAN/.test(res)) FD.turn('Okay. Please ask them to call me.', 'take_message', { name: 'Sam Demo', message: text.slice(0, 300), urgency: /urgent|emergency|asap|reaction|hurt|pain/.test(t) ? 'urgent' : 'normal' }); else FD.menu();
      });
      return 'escalate';
    }
    if (/\b(message|call me back|callback|call back)\b/.test(t)) { FD.turn(text, 'take_message', { name: 'Sam Demo', message: text.slice(0, 300), urgency: 'normal' }); return 'message'; }
    const svc = /colou?r|dye|highlight/.test(t) ? 'color' : /beard|shave/.test(t) ? 'beard trim' : /hair ?cut|trim|\bcut\b/.test(t) ? 'haircut' : '';
    const wantsBooking = /\b(book|booking|appointment|schedule|reserve|availab|slot|free time|come in|get in)\b/.test(t) || (svc && /\b(today|tomorrow|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t));
    if (wantsBooking) {
      const day = /\btoday\b/.test(t) ? 'today' : /\btomorrow\b/.test(t) ? 'tomorrow' : (DAYS.find((d) => t.includes(d)) || '');
      const pref = /morning/.test(t) ? 'morning' : /afternoon/.test(t) ? 'afternoon' : /evening|after work/.test(t) ? 'evening' : '';
      FD.book(svc || 'haircut', day, pref, text);
      return 'book';
    }
    FD.turn(text, 'answer_faq', { question: text.slice(0, 200) });
    return 'faq';
  }
  window.FD_ROUTE = route;

  // ---------- speech out ----------
  const canSpeak = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  let speakTimer = null, lastDesk = '';
  document.addEventListener('fd:say', (e) => {
    if (e.detail.who !== 'desk') return;
    lastDesk = e.detail.text;
    if (!canSpeak || !$('#tts') || !$('#tts').checked) return;
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => {
      try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(lastDesk); u.lang = 'en-US'; u.rate = 1.02; speechSynthesis.speak(u); } catch (err) { /* speech is optional */ }
    }, 60);
  });

  // ---------- speech in ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  function status(t) { const el = $('#voice-status'); if (el) el.textContent = t; }
  function setupMic() {
    const mic = $('#mic');
    if (!SR) {
      mic.disabled = true; mic.textContent = 'Voice not available';
      $('#voicebar').classList.add('novoice');
      status('This browser has no speech recognition (Firefox, for example). Type what you would say instead: it takes exactly the same route.');
      return;
    }
    mic.onclick = () => {
      if (listening && rec) { rec.stop(); return; }
      if (canSpeak) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
      let finalText = '';
      rec.onstart = () => { listening = true; mic.classList.add('live'); mic.textContent = '■ Stop'; status('Listening… speak now.'); };
      rec.onresult = (ev) => {
        let interim = ''; finalText = '';
        for (let i = 0; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
        $('#free-q').value = finalText || interim;
      };
      rec.onerror = (ev) => {
        const why = { 'not-allowed': 'Microphone permission was blocked.', 'service-not-allowed': 'Speech recognition is turned off in this browser.', 'audio-capture': 'No microphone found.', network: 'Speech recognition needs a network connection in this browser.', 'no-speech': "Didn't catch anything." }[ev.error] || ('Voice error: ' + ev.error + '.');
        status(why + ' You can type instead.');
      };
      rec.onend = () => {
        listening = false; mic.classList.remove('live'); mic.textContent = '🎤 Talk';
        const said = (finalText || '').trim();
        if (said) { $('#free-q').value = ''; status('Heard: "' + said + '"'); route(said, 'spoken'); }
      };
      try { rec.start(); } catch (e) { status('Could not start the microphone. You can type instead.'); }
    };
  }

  // ---------- call record + hand-off note ----------
  let calls = [], cur = null, seq = 0;
  function newCall(caller) {
    if (cur && cur.events.length) calls.unshift(cur);
    seq += 1;
    cur = { id: 'CALL-' + String(seq).padStart(3, '0'), caller, started: new Date(), events: [], inputs: [] };
    renderRec();
  }
  function log(how, text) { if (cur) cur.inputs.push({ how, text }); }
  document.addEventListener('fd:start', (e) => { calls = []; cur = null; seq = 0; newCall(e.detail.caller); });
  document.addEventListener('fd:newcall', (e) => newCall(e.detail.caller));
  document.addEventListener('fd:tool', (e) => { if (!cur) newCall(e.detail.caller); cur.events.push(e.detail); renderRec(); });

  const OUTCOME = { BOOKED: 'Booked', ALREADY_BOOKED: 'Booked (repeat request)', CANCELLED: 'Cancelled a booking', TRANSFER_OK: 'Transferred to staff', NO_HUMAN: 'No staff free', MESSAGE_TAKEN: 'Message taken', ANSWER: 'Question answered', NO_MATCH: 'Question not in FAQ', NOT_FOUND: 'Cancel refused (no booking for this number)', NOT_BOOKED: 'Slot not available', AVAILABLE: 'Times offered' };
  function code(r) { const c = String(r || '').split(':')[0].trim(); return /^NOT_BOOKED/.test(c) ? 'NOT_BOOKED' : c; }
  function summarize(c) {
    const codes = c.events.map((e) => code(e.result));
    const pri = ['BOOKED', 'CANCELLED', 'TRANSFER_OK', 'MESSAGE_TAKEN', 'NOT_FOUND', 'NO_MATCH', 'ANSWER', 'NOT_BOOKED', 'AVAILABLE'];
    const main = pri.find((p) => codes.includes(p)) || codes[codes.length - 1] || '';
    const st = window.FD.getState();
    const contact = st.contacts.find((x) => String(x.phone).replace(/\D/g, '').endsWith(c.caller.replace(/\D/g, '').slice(-7)));
    const esc2 = c.events.find((e) => e.tool === 'escalate_to_human');
    const msg = c.events.filter((e) => e.tool === 'take_message').pop();
    const gap = c.events.filter((e) => code(e.result) === 'NO_MATCH').map((e) => e.args.question);
    const urgent = c.events.some((e) => e.args && e.args.urgency === 'urgent');
    const needsHuman = !!(msg || esc2 || gap.length || codes.includes('NOT_FOUND'));
    return { main, codes, contact, esc2, msg, gap, urgent, needsHuman };
  }
  function handoff(c, s) {
    if (!s.needsHuman) return '';
    const who = (s.contact && s.contact.name ? s.contact.name + ', ' : '') + window.FD.fmtPhone(c.caller);
    const lines = [];
    lines.push((s.urgent ? 'URGENT. ' : '') + 'Call back ' + who + '.');
    if (s.esc2) lines.push('Asked for a person: ' + s.esc2.args.reason + (code(s.esc2.result) === 'TRANSFER_OK' ? ' (transferred live).' : ' (no one was free, so the desk took a message).'));
    if (s.msg) { const ref = (String(s.msg.result).match(/MSG-[A-Z0-9-]+/) || [''])[0]; lines.push('Message' + (ref ? ' ' + ref : '') + ': ' + s.msg.args.message); }
    if (s.gap.length) lines.push('Asked something the FAQ does not cover: "' + s.gap.join('", "') + '". Add an answer so the desk can handle it next time.');
    if (s.codes.includes('NOT_FOUND')) lines.push('Tried to cancel, but no booking is on file for this number. Check whether they booked from another phone.');
    if (s.contact && s.contact.last_booking) lines.push('History: last booking ' + s.contact.last_booking + '.');
    return lines.join('\n');
  }
  function card(c, isCur) {
    const s = summarize(c);
    const tools = c.events.map((e) => e.tool + ' → ' + code(e.result)).join(', ') || 'none yet';
    const said = c.inputs.filter((i) => i.how !== 'button').map((i) => (i.how === 'spoken' ? '🎤 ' : '⌨ ') + i.text);
    const note = handoff(c, s);
    return '<div class="callrec' + (isCur ? ' cur' : '') + '"><div class="crhead"><b>' + esc(c.id) + '</b> · ' + esc(window.FD.fmtPhone(c.caller)) + (isCur ? ' <span class="tag real">in progress</span>' : '') + '</div>' +
      '<table class="kv"><tr><th>Outcome</th><td>' + esc(OUTCOME[s.main] || (s.main ? s.main : 'No tool calls yet')) + (s.urgent ? ' · <span class="bad">urgent</span>' : '') + '</td></tr>' +
      '<tr><th>Tools called</th><td class="wrap-ok">' + esc(tools) + '</td></tr>' +
      (said.length ? '<tr><th>Caller said</th><td class="wrap-ok">' + said.map(esc).join('<br>') + '</td></tr>' : '') +
      '<tr><th>Needs a human</th><td>' + (s.needsHuman ? 'Yes' : 'No') + '</td></tr></table>' +
      (note ? '<div class="handoff"><div class="small"><b>Hand-off note for staff</b></div><pre>' + esc(note) + '</pre></div>' : '') + '</div>';
  }
  function renderRec() {
    const box = $('#callrecs'); if (!box) return;
    const list = (cur ? [card(cur, true)] : []).concat(calls.map((c) => card(c, false)));
    box.innerHTML = list.join('') || '<p class="muted small">No calls yet.</p>';
  }
  // Mark button-driven turns so "Caller said" only lists free speech/typing.
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#choices button') && cur) cur.inputs.push({ how: 'button', text: e.target.textContent }); }, true);

  window.FD_VOICE = { route, calls: () => (cur ? [cur] : []).concat(calls), handoffFor: () => (cur ? handoff(cur, summarize(cur)) : '') };
  window.addEventListener('DOMContentLoaded', () => {
    setupMic();
    if (!canSpeak) { const l = $('#tts-wrap'); if (l) l.hidden = true; }
    renderRec();
  });
})();
