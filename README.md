# Plikowy czat — v2

Wymagania spełnione:
- Format linii w plikach `input` i `inputCHAT`:  
  **`[rr.mm.dd] [hh.mm.ss] {ME|THEM} -> {treść}`**
- Zapisywanie własnych wiadomości do `input` w tym formacie.
- Odczyt obu plików co 1 s, wykrywanie dopisków, dopisywanie do UI bez duplikatów.
- Po restarcie klienta/serwera: pełna historia z obu plików jest wczytywana do okna czatu (sortowanie po znaczniku czasu).
- `input` również jest czytany na żywo, dzięki czemu zewnętrzne dopiski do `input` również pokażą się w UI.

## Start
```bash
npm install
npm start
# przeglądarka: http://localhost:3000
```

## Notatki
- Wysyłane z przeglądarki wiadomości trafiają do `input` w formacie z datą i `{ME}`.
- Zewnętrzny skrypt powinien dopisywać do `inputCHAT` w tym samym formacie, najlepiej z `{THEM}`.
- Gdy linia w pliku nie pasuje do wzorca, aplikacja pokaże ją jako surowy tekst ze stemplem `[..] [..]`.
- Dedup działa przez klucz: `who|[data][czas]|tekst`.
