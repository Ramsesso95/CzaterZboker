import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store, must-revalidate');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { cacheControl: false, etag: false, lastModified: false }));

const INPUT_OUT_PATH = path.join(__dirname, 'input');
const INPUT_CHAT_PATH = path.join(__dirname, 'inputCHAT');

for (const p of [INPUT_OUT_PATH, INPUT_CHAT_PATH]) if (!fs.existsSync(p)) fs.writeFileSync(p, '', 'utf8');

function pad2(n){ return n.toString().padStart(2,'0'); }
function nowStamp(d=new Date()){
  const yy = pad2(d.getFullYear()%100);
  const MM = pad2(d.getMonth()+1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return {date:`${yy}.${MM}.${dd}`, time:`${hh}.${mm}.${ss}`};
}
function formatLine(text, who){
  const clean = (text??'').toString().replace(/\r?\n/g,' ').trim();
  const {date,time} = nowStamp();
  return `[${date}] [${time}] {${who}} -> {${clean}}`;
}
const LINE_RE = /^\[(\d{2}\.\d{2}\.\d{2})\]\s+\[(\d{2}\.\d{2}\.\d{2})\]\s*(?:\{(ME|THEM|me|them)\}\s*->\s*)?\{(.*)\}\s*$/;

app.post('/send', async (req,res)=>{
  try{
    const {message} = req.body||{};
    if (typeof message!=='string' || !message.trim()) return res.status(400).json({ok:false,error:'Empty message'});
    const line = formatLine(message,'ME');
    await fs.promises.appendFile(INPUT_OUT_PATH, line+'\n','utf8');
    const {date,time} = nowStamp();
    res.json({ok:true, line, stampDate:date, stampTime:time});
  }catch(e){ console.error(e); res.status(500).json({ok:false,error:'Server error'}); }
});

app.get('/history', async (_req,res)=>{
  try{
    const [meBuf, themBuf] = await Promise.all([
      fs.promises.readFile(INPUT_OUT_PATH,'utf8'),
      fs.promises.readFile(INPUT_CHAT_PATH,'utf8')
    ]);
    const parseFile = (buf, who) => buf.split(/\r?\n/).filter(Boolean).map(line=>{
      let ts=0, stamp='', text=line;
      const m=line.match(LINE_RE);
      if(m){
        const [_, d, t, whoIn, msg] = m;
        const [yy,MM,dd] = d.split('.').map(Number);
        const [hh,mm,ss] = t.split('.').map(Number);
        const fullYear = 2000+yy;
        ts = Date.UTC(fullYear,MM-1,dd,hh,mm,ss);
        stamp = `[${d}] [${t}]`;
        text = msg;
      }else{
        const {date,time}=nowStamp(); stamp=`[${date}] [${time}]`; ts=Date.now();
      }
      return {who, text, stamp, ts, raw: line};
    });
    const all = parseFile(meBuf,'me').concat(parseFile(themBuf,'them')).sort((a,b)=>a.ts-b.ts);
    res.json({ok:true, meSize: Buffer.byteLength(meBuf,'utf8'), themSize: Buffer.byteLength(themBuf,'utf8'), messages: all});
  }catch(e){ console.error(e); res.status(500).json({ok:false,error:'Server error'}); }
});

app.get('/poll', async (req,res)=>{
  try{
    const fromMe = Math.max(0, parseInt(req.query.fromMe??'0',10) || 0);
    const fromThem = Math.max(0, parseInt(req.query.fromThem??'0',10) || 0);
    const readChunk = async (filePath, from) => {
      let stat; try{ stat = await fs.promises.stat(filePath); }
      catch{ await fs.promises.writeFile(filePath,'','utf8'); stat = await fs.promises.stat(filePath); }
      const size = stat.size;
      let start = from, reset = false;
      if (from > size) { start = 0; reset = true; }
      if (start >= size) return { from: start, to: size, chunk: '', reset };
      const to = size;
      const chunk = await new Promise((resolve,reject)=>{
        const rs = fs.createReadStream(filePath,{ start, end: to-1, encoding:'utf8'});
        let data=''; rs.on('data',c=>data+=c); rs.on('end',()=>resolve(data)); rs.on('error',reject);
      });
      return { from: start, to, chunk, reset };
    };
    const [me, them] = await Promise.all([ readChunk(INPUT_OUT_PATH, fromMe), readChunk(INPUT_CHAT_PATH, fromThem) ]);
    res.json({ok:true, me, them});
  }catch(e){ console.error(e); res.status(500).json({ok:false,error:'Server error'}); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));