# Plikowy czat — v2.1

- Stabilny polling co 1 s z obsługą truncation/rotacji plików.
- Twarde `Cache-Control: no-store` po stronie serwera i klienta.
- Historia z obu plików na starcie, sortowana po znaczniku czasu.
- Format: `[rr.mm.dd] [hh.mm.ss] {ME|THEM} -> {treść}`.

Start:
```bash
npm install
npm start
# http://localhost:3000
```
