import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const INPUT_OUT_PATH = path.join(__dirname, 'input');       // messages you send
const INPUT_CHAT_PATH = path.join(__dirname, 'inputCHAT');  // messages from the other side

for (const p of [INPUT_OUT_PATH, INPUT_CHAT_PATH]) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, '', 'utf8');
}

// Helpers
function pad2(n) { return n.toString().padStart(2, '0'); }
function nowStamp(d=new Date()) {
  const yy = pad2(d.getFullYear() % 100);
  const MM = pad2(d.getMonth()+1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return { date:`${yy}.${MM}.${dd}`, time:`${hh}.${mm}.${ss}` };
}

function formatLine(text, who /* 'ME'|'THEM' */) {
  // Sanitize text to single line; keep braces but escape newlines
  const clean = (text ?? '').toString().replace(/\r?\n/g, ' ').trim();
  const {date, time} = nowStamp();
  return `[${date}] [${time}] {${who}} -> {${clean}}`;
}

// Regex for parsing lines back
const LINE_RE = /^\[(\d{2}\.\d{2}\.\d{2})\]\s+\[(\d{2}\.\d{2}\.\d{2})\]\s*(?:\{(ME|THEM|me|them)\}\s*->\s*)?\{(.*)\}\s*$/;

// Append outgoing message to "input" with a formatted log line
app.post('/send', async (req, res) => {
  try {
    const { message } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ ok: false, error: 'Empty message' });
    }
    const line = formatLine(message, 'ME');
    await fs.promises.appendFile(INPUT_OUT_PATH, line + '\n', 'utf8');
    const {date, time} = nowStamp();
    return res.json({ ok: true, line, stampDate: date, stampTime: time });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Read entire history from both files, parse, and return sorted by timestamp
app.get('/history', async (_req, res) => {
  try {
    const [meBuf, themBuf] = await Promise.all([
      fs.promises.readFile(INPUT_OUT_PATH, 'utf8'),
      fs.promises.readFile(INPUT_CHAT_PATH, 'utf8')
    ]);
    const parseFile = (buf, who) => buf.split(/\r?\n/).filter(Boolean).map((line) => {
      let ts = 0, stamp = '', text = line;
      const m = line.match(LINE_RE);
      if (m) {
        const [_, d, t, whoIn, msg] = m;
        const [yy, MM, dd] = d.split('.').map(Number);
        const [hh, mm, ss] = t.split('.').map(Number);
        // year 20xx assumption
        const fullYear = 2000 + yy;
        ts = Date.UTC(fullYear, MM-1, dd, hh, mm, ss);
        stamp = `[${d}] [${t}]`;
        text = msg;
      } else {
        // fallback: use file mtime is not per-line; so use "now" for unknown
        const {date, time} = nowStamp();
        stamp = `[${date}] [${time}]`;
        ts = Date.now();
      }
      return { who, text, stamp, ts, raw: line };
    });
    const me = parseFile(meBuf, 'me');
    const them = parseFile(themBuf, 'them');
    const all = me.concat(them).sort((a,b)=> a.ts - b.ts);
    const meSize = Buffer.byteLength(meBuf, 'utf8');
    const themSize = Buffer.byteLength(themBuf, 'utf8');
    return res.json({ ok: true, meSize, themSize, messages: all });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Poll for new bytes from both files starting offsets provided by client
// Query: fromMe=<byteOffset>&fromThem=<byteOffset>
app.get('/poll', async (req, res) => {
  try {
    const fromMe = Math.max(0, parseInt(req.query.fromMe ?? '0', 10) || 0);
    const fromThem = Math.max(0, parseInt(req.query.fromThem ?? '0', 10) || 0);

    const readChunk = async (filePath, from) => {
      let stat;
      try { stat = await fs.promises.stat(filePath); }
      catch { await fs.promises.writeFile(filePath, '', 'utf8'); stat = await fs.promises.stat(filePath); }
      const size = stat.size;
      if (from >= size) return { from, to: size, chunk: '' };
      const to = size;
      const chunk = await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(filePath, { start: from, end: to - 1, encoding: 'utf8' });
        let data = '';
        rs.on('data', c => data += c);
        rs.on('end', () => resolve(data));
        rs.on('error', reject);
      });
      return { from, to, chunk };
    };

    const [me, them] = await Promise.all([
      readChunk(INPUT_OUT_PATH, fromMe),
      readChunk(INPUT_CHAT_PATH, fromThem),
    ]);
    res.json({ ok: true, me, them });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
