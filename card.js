(() => {
  const status = document.getElementById('card-status');
  const photo = document.getElementById('card-photo');
  const brand = document.getElementById('card-brand');
  let theme;
  try { theme = localStorage.getItem('site-theme'); } catch (_) {}
  const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark', dark);
  if (brand) brand.src = dark ? '/kems-logo1.png' : '/kems-logo2.png';
  let card = { company: 'KEMS', email: 'hello@getkems.com', website: 'https://getkems.com' };
  const ready = fetch('card.json', { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Card unavailable');
    return response.json();
  }).then(value => {
    card = value;
    const name = document.getElementById('card-name');
    name.textContent = card.name || '';
    name.hidden = !card.name;
    const role = document.getElementById('card-role');
    role.textContent = card.role || '';
    role.hidden = !card.role;
    const intro = document.getElementById('card-intro');
    intro.textContent = card.intro || '';
    intro.hidden = !card.intro;
    updatePhoto();
    const links = document.getElementById('card-links');
    links.replaceChildren();
    function addLink(label, href, protocols) {
      const url = new URL(href, location.href);
      if (!protocols.includes(url.protocol)) return;
      const link = document.createElement('a'); link.textContent = label; link.href = url.href;
      links.append(link);
      return link;
    }
    if (card.instagram) {
      const handle = card.instagram.replace(/^@/, '');
      if (/^[A-Za-z0-9._]+$/.test(handle)) {
        const link = addLink(`@${handle}`, `https://www.instagram.com/${handle}/`, ['https:']);
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor');
        icon.setAttribute('stroke-width', '1.8'); icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>';
        link.prepend(icon);
      }
    }
    for (const link of card.links || []) addLink(link.label, link.url, ['https:']);
  }).catch(() => {});

  function updatePhoto() {
    const expanded = document.getElementById('toggle-profile').getAttribute('aria-expanded') === 'true';
    let portrait;
    try { const url = new URL(card.photo); if (url.protocol === 'https:') portrait = url.href; } catch (_) {}
    photo.src = expanded && portrait ? portrait : '/mirror-icon-512.png';
    photo.classList.toggle('portrait', Boolean(expanded && portrait));
    photo.alt = expanded && portrait ? card.name || 'Profile photo' : 'Mirror';
  }

  document.getElementById('toggle-profile').addEventListener('click', event => {
    const section = document.getElementById('personal-info');
    const expanded = event.currentTarget.getAttribute('aria-expanded') !== 'true';
    event.currentTarget.setAttribute('aria-expanded', String(expanded));
    event.currentTarget.setAttribute('aria-label', expanded ? 'Hide personal information' : 'Show personal information');
    section.classList.toggle('expanded', expanded);
    section.setAttribute('aria-hidden', String(!expanded));
    section.inert = !expanded;
    updatePhoto();
  });

  document.getElementById('save-contact').addEventListener('click', async () => {
    await ready;
    const escape = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
    const name = card.name || card.company || 'KEMS';
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escape(name)}`, `N:${escape(name)};;;;`];
    if (card.company) lines.push(`ORG:${escape(card.company)}`);
    if (card.role) lines.push(`TITLE:${escape(card.role)}`);
    if (card.email) lines.push(`EMAIL;TYPE=INTERNET:${escape(card.email)}`);
    if (card.phone) lines.push(`TEL;TYPE=CELL:${escape(card.phone)}`);
    if (card.website) lines.push(`URL:${escape(card.website)}`);
    lines.push('END:VCARD');
    const content = lines.map(line => {
      let folded = ''; let width = 0;
      for (const character of line) {
        const bytes = new TextEncoder().encode(character).length;
        if (width + bytes > 75) { folded += '\r\n '; width = 1; }
        folded += character; width += bytes;
      }
      return folded;
    }).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([content], { type: 'text/vcard;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'KEMS.vcf';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

  });

  document.getElementById('show-contact-form').addEventListener('click', event => {
    const form = document.getElementById('contact-form'); form.hidden = !form.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  });
  let submissionId;
  document.getElementById('contact-form').addEventListener('input', () => { submissionId = undefined; });
  document.getElementById('contact-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('button[type="submit"]');
    const message = document.getElementById('contact-status');
    if (button.disabled || !form.reportValidity()) return;
    submissionId ||= crypto.randomUUID();
    const payload = Object.fromEntries(new FormData(form));
    payload.join_waitlist = form.elements.join_waitlist.checked;
    payload.kind = 'contact'; payload.submission_id = submissionId;
    button.disabled = true; button.textContent = 'Sharing…'; message.textContent = '';
    try {
      const publicKey = 'sb_publishable_qXLe8UMrN62miUoIxZJoiQ_7tQfoapm';
      const response = await fetch('https://qnrdrtlsitedelrzkdvd.supabase.co/functions/v1/kems-waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: publicKey, Authorization: `Bearer ${publicKey}` },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Please try again shortly.');
      message.textContent = result.message; form.reset(); submissionId = undefined;
    } catch (error) {
      message.textContent = error.name === 'TypeError' || error.name === 'TimeoutError' ? 'We couldn’t connect. Please try again shortly.' : error.message;
    } finally { button.disabled = false; button.textContent = 'Share details'; }
  });
})();
