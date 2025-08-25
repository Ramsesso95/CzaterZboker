(() => {
  const form = document.getElementById('form');
  const input = document.getElementById('text');
  const messagesEl = document.getElementById('messages');
  const statusEl = document.getElementById('status');
  const dotEl = document.getElementById('dot');

  let meOffset = 0;
  let themOffset = 0;
  let meBuffer = '';
  let themBuffer = '';
  const seen = new Set();

  function setStatus(text, active) {
    statusEl.textContent = text;
    dotEl.style.background = active ? '#3ddc97' : '#9aa3b2';
  }

  function addMessage(text, who, stamp) {
    const key = `${who}|${stamp}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    const tpl = document.getElementById('msg-template');
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.classList.add(who);
    node.querySelector('.msg__bubble').textContent = text;
    node.querySelector('.msg__meta').textContent = stamp;
    messagesEl.appendChild(node);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  const LINE_RE = /^\[(\d{2}\.\d{2}\.\d{2})\]\s+\[(\d{2}\.\d{2}\.\d{2})\]\s*(?:\{(ME|THEM|me|them)\}\s*->\s*)?\{(.*)\}\s*$/;
  function parseLine(line) {
    const m = line.match(LINE_RE);
    if (m) return { stamp: `[${m[1]}] [${m[2]}]`, text: m[4] };
    return { stamp: '[..] [..]', text: line.trim() };
  }
  function flushBuffer(buf, who) {
  if (!buf) return '';
  const lines = buf.split(/\r?\n/);
  // emituj WSZYSTKO, łącznie z końcówką bez \n
  for (const line of lines) {
    const { stamp, text } = parseLine(line);
    if (text) addMessage(text, who, stamp);
  }
  return ''; // po emisji bufor czyścimy
}

  async function loadHistory() {
    const res = await fetch('/history', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    messagesEl.innerHTML = '';
    seen.clear();
    for (const m of data.messages) addMessage(m.text, m.who, m.stamp);
    meOffset = data.meSize || 0;
    themOffset = data.themSize || 0;
  }

  async function sendMessage(e) {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    input.value = '';
    form.querySelector('button').disabled = true;
    try {
      const res = await fetch('/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ message: val })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { stampDate, stampTime } = await res.json();
      addMessage(val, 'me', `[${stampDate}] [${stampTime}]`);
    } catch (err) {
      addMessage('[błąd wysyłki] ' + err.message, 'them', '[..] [..]');
    } finally {
      form.querySelector('button').disabled = false;
      input.focus();
    }
  }

  async function pollOnce() {
    try {
      const res = await fetch(`/poll?fromMe=${meOffset}&fromThem=${themOffset}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const payload = await res.json();
      const { me, them } = payload;

      // handle truncation reset flags
      if (me && me.reset) { meOffset = 0; meBuffer = ''; }
      if (them && them.reset) { themOffset = 0; themBuffer = ''; }

      if (me && typeof me.to === 'number' && typeof me.chunk === 'string') {
        meOffset = me.to;
        meBuffer += me.chunk;
		meBuffer = flushBuffer(meBuffer, 'me');
      }
      if (them && typeof them.to === 'number' && typeof them.chunk === 'string') {
        themOffset = them.to;
        themBuffer += them.chunk;
		themBuffer = flushBuffer(themBuffer, 'them');
      }
      setStatus('online', true);
    } catch {
      setStatus('brak połączenia', false);
    }
  }

  form.addEventListener('submit', sendMessage);
  setStatus('czekam…', false);
  input.focus();

  loadHistory().then(() => {
    pollOnce();
    setInterval(pollOnce, 1000);
  }).catch(err => addMessage('[błąd historii] ' + err.message, 'them', '[..] [..]'));
})();
