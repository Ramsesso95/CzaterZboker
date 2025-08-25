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
  const seen = new Set(); // dedup key: `${who}|${stamp}|${text}`

  function setStatus(text, active) {
    statusEl.textContent = text;
    dotEl.style.background = active ? '#3ddc97' : '#9aa3b2';
  }

  function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
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

  // Parse a single log line into {text, stamp}, fallback when not matching
  const LINE_RE = /^\[(\d{2}\.\d{2}\.\d{2})\]\s+\[(\d{2}\.\d{2}\.\d{2})\]\s*(?:\{(ME|THEM|me|them)\}\s*->\s*)?\{(.*)\}\s*$/;
  function parseLine(line) {
    const m = line.match(LINE_RE);
    if (m) {
      const stamp = `[${m[1]}] [${m[2]}]`;
      const text = m[4];
      return { stamp, text };
    }
    // fallback: show raw
    const stamp = '[..] [..]';
    return { stamp, text: line.trim() };
  }

  async function loadHistory() {
    const res = await fetch('/history', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    messagesEl.innerHTML = '';
    for (const m of data.messages) {
      addMessage(m.text, m.who, m.stamp);
    }
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
        body: JSON.stringify({ message: val })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { stampDate, stampTime } = await res.json();
      const stamp = `[${stampDate}] [${stampTime}]`;
      addMessage(val, 'me', stamp);
    } catch (err) {
      addMessage('[błąd wysyłki] ' + err.message, 'them', '[..] [..]');
    } finally {
      form.querySelector('button').disabled = false;
      input.focus();
    }
  }

  async function pollOnce() {
    try {
      const res = await fetch(`/poll?fromMe=${meOffset}&fromThem=${themOffset}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { me, them } = await res.json();

      // process ME chunk
      if (me && typeof me.to === 'number' && typeof me.chunk === 'string') {
        meOffset = me.to;
        meBuffer += me.chunk;
        const parts = meBuffer.split('\n');
        meBuffer = parts.pop() ?? '';
        for (const line of parts) {
          const { stamp, text } = parseLine(line);
          if (!text) continue;
          addMessage(text, 'me', stamp);
        }
      }
      // process THEM chunk
      if (them && typeof them.to === 'number' && typeof them.chunk === 'string') {
        themOffset = them.to;
        themBuffer += them.chunk;
        const parts = themBuffer.split('\n');
        themBuffer = parts.pop() ?? '';
        for (const line of parts) {
          const { stamp, text } = parseLine(line);
          if (!text) continue;
          addMessage(text, 'them', stamp);
        }
      }

      setStatus('online', true);
    } catch (err) {
      setStatus('brak połączenia', false);
    }
  }

  form.addEventListener('submit', sendMessage);
  setStatus('czekam…', false);
  input.focus();

  // init
  loadHistory().then(()=>{
    pollOnce();
    setInterval(pollOnce, 1000);
  }).catch(err => {
    addMessage('[błąd historii] ' + err.message, 'them', '[..] [..]');
  });
})();
