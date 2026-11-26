// Shared-family helpers: the last-edited line on antenna pages and the
// recent-changes list, both from site-meta.json (built from git history by
// .github/scripts/generate-site-meta.js).
(function () {
  'use strict';
  const REPO = 'https://github.com/danryan06/antenna-comparison';
  let metaPromise = null;
  function meta() {
    if (!metaPromise) {
      metaPromise = fetch('site-meta.json', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    return metaPromise;
  }
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Appends "Entry last edited <date> (history)." to the given note.
  async function addEditedDate(note, slug) {
    const m = await meta();
    const date = m && m.entries && m.entries[slug];
    if (!date || !note) return;
    const line = el('span', 'prov-date');
    line.appendChild(document.createTextNode(' Entry last edited ' + fmtDate(date) + ' '));
    const h = el('a', null, '(history)');
    h.href = REPO + '/commits/main/antenna_data.json';
    h.target = '_blank'; h.rel = 'noopener noreferrer';
    line.appendChild(h);
    line.appendChild(document.createTextNode('.'));
    note.appendChild(line);
  }

  async function renderChanges(target) {
    const m = await meta();
    if (!m || !m.changes || !m.changes.length) {
      target.appendChild(el('p', 'changes-empty', 'No changes listed yet.'));
      return;
    }
    const list = el('ol', 'changes-list');
    m.changes.forEach(c => {
      const li = el('li');
      li.appendChild(el('time', null, fmtDate(c.date)));
      const a = el('a', null, c.title);
      a.href = c.pr ? REPO + '/pull/' + c.pr : REPO + '/commit/' + c.sha;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.appendChild(a);
      list.appendChild(li);
    });
    target.appendChild(list);
  }

  window.Fresh = { addEditedDate, renderChanges };
})();
