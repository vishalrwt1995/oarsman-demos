(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = (iso) => (iso ? String(iso).slice(0, 10) : '');
  const link = (u, t) => (u ? '<a href="' + esc(u) + '" rel="nofollow noopener" target="_blank">' + esc(t || 'open') + '</a>' : '');
  function table(el, cols, rows) {
    document.getElementById(el).innerHTML = '<table><thead><tr>' + cols.map((c) => '<th>' + esc(c[0]) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + cols.map((c) => '<td' + (c[2] ? ' class="wrap-ok"' : '') + '>' + c[1](r) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  fetch('../assets/data/actor-samples.json').then((r) => r.json()).then((d) => {
    let atsFilter = 'all';
    const atsCols = [['ATS', (j) => esc(j.ats)], ['Company', (j) => esc(j.company)], ['Title', (j) => esc(j.title), 1], ['Location', (j) => esc(j.location), 1], ['Remote', (j) => (j.isRemote ? 'yes' : '')], ['Salary (from the posting)', (j) => esc(j.salary)], ['Posted', (j) => day(j.postedAt)], ['Link', (j) => link(j.url, 'posting')]];
    const drawAts = () => table('ats-table', atsCols, d.ats.filter((j) => atsFilter === 'all' || j.ats === atsFilter));
    const kinds = ['all', ...new Set(d.ats.map((j) => j.ats))];
    document.getElementById('ats-filter').innerHTML = kinds.map((k) => '<button data-k="' + k + '"' + (k === 'all' ? ' class="on"' : '') + '>' + k + '</button>').join('');
    document.querySelectorAll('#ats-filter button').forEach((b) => { b.onclick = () => { atsFilter = b.dataset.k; document.querySelectorAll('#ats-filter button').forEach((x) => x.classList.toggle('on', x === b)); drawAts(); }; });
    drawAts();
    table('ats-runs', [['Board', (s) => esc(s.input)], ['Open jobs read', (s) => esc(s.fetched)], ['Saved in this sample', (s) => esc(s.pushed)]], d.meta.atsSources);
    document.getElementById('ats-total').textContent = d.meta.atsTotals.totalFetched.toLocaleString('en-US');
    table('india-table', [['Company', (j) => esc(j.company)], ['Title', (j) => esc(j.title), 1], ['City', (j) => esc(j.city)], ['Seniority', (j) => esc(j.seniority)], ['Experience (yrs)', (j) => (j.experienceYears ? esc(j.experienceYears.min) + '–' + esc(j.experienceYears.max) : '')], ['Salary (LPA)', (j) => esc(j.salaryLpa)], ['Source ATS', (j) => esc(j.ats)], ['Link', (j) => link(j.url, 'posting')]], d.india);
    table('contacts-table', [['Website', (c) => esc(c.domain)], ['Company name found', (c) => esc(c.companyName), 1], ['Role emails found', (c) => esc(c.roleEmails.join(', ')) || '<span class="muted">none</span>', 1], ['Phones found', (c) => esc(c.phonesFound)], ['Social profiles', (c) => esc(c.socialNetworks.join(', ')), 1], ['Contact page', (c) => link(c.contactPageUrl, 'page')], ['Pages read', (c) => esc(c.pagesCrawled)]], d.contacts);
    const sc = Object.keys(d.sheets[0] || {});
    table('sheets-table', sc.map((k) => [k, (r) => esc(r[k])]), d.sheets);
    document.getElementById('raw-n').textContent = d.ats.length + d.india.length + d.contacts.length + d.sheets.length;
  }).catch((e) => { document.getElementById('load-error').textContent = 'Could not load the sample data file (' + e.message + '). Open ../assets/data/actor-samples.json directly.'; });
  document.querySelectorAll('#wf-tabs button').forEach(function (b) { b.onclick = function () { document.getElementById('wf-img').src = b.dataset.src; document.getElementById('wf-cap').textContent = b.dataset.cap; document.querySelectorAll('#wf-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
})();
