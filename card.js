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
    document.getElementById('card-role').textContent = card.role || '';
    document.querySelector('.identity').hidden = !card.role;
    if (card.photo) {
      const url = new URL(card.photo, location.href);
      if (url.protocol === 'https:') { photo.src = url.href; photo.classList.add('portrait'); }
    }
    photo.alt = card.name || card.company || 'KEMS';
    const links = document.getElementById('card-links');
    links.replaceChildren();
    function addLink(label, href, protocols) {
      const url = new URL(href, location.href);
      if (!protocols.includes(url.protocol)) return;
      const link = document.createElement('a'); link.textContent = label; link.href = url.href;
      links.append(link);
    }
    if (card.email) addLink(card.email, `mailto:${card.email}`, ['mailto:']);
    if (card.phone) addLink(card.phone, `tel:${card.phone}`, ['tel:']);
    for (const link of card.links || []) addLink(link.label, link.url, ['https:']);
  }).catch(() => {});

  document.getElementById('save-contact').addEventListener('click', async () => {
    await ready;
    const escape = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
    const name = card.name || card.company || 'KEMS';
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escape(name)}`, `N:${escape(name)};;;;`];
    if (card.company) lines.push(`ORG:${escape(card.company)}`);
    if (card.role) lines.push(`TITLE:${escape(card.role)}`);
    if (card.email) lines.push(`EMAIL;TYPE=INTERNET:${escape(card.email)}`);
    if (card.phone) lines.push(`TEL:${escape(card.phone)}`);
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
    status.textContent = 'Open the downloaded contact card to save it to your contacts.';
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
