---
description: Finn en datakilde på data.norge.no og visualiser dataene som en interaktiv widget i chatten
argument-hint: [tema, f.eks. "luftkvalitet i hver kommune"]
---

Finn en offentlig datakilde for **$ARGUMENTS** og **visualiser dataene som en interaktiv widget i chatten**.

Følg dette:

1. **Finn kilden** (følg `finn-datakilde`-arbeidsflyten): søk i BEGGE katalogene med `search_datasets` og `search_apis`, forfin ved 0/svake treff, og finn helst både et datasett og et API. Hold dimensjonsord (kommune/per/hver/år) ute av selve søkestrengen.
2. **Hent dataene** med `fetch_data` — en distribusjon (CSV/JSON) eller et API-endepunkt. Øk `maxKilobytes` ved behov så du får nok rader til å visualisere.
3. **Velg visualisering etter dataform:**
   - geografisk / per kommune/fylke → stolpediagram (eller kart) per enhet
   - tidsserie → linjediagram
   - kategorisk / tabellarisk → sort- og filtrerbar tabell eller dashboard
4. **Render en interaktiv widget i chatten:** kall `mcp__visualize__read_me` (modulene `interactive` + `chart`) FØRST, og deretter `mcp__visualize__show_widget` med de ekte dataene embedded. Gjør den interaktiv: nedtrekk/filter (f.eks. velg komponent eller år), hover/klikk for detaljer, og fargekoding som bærer mening (med en liten forklaring/legende).
5. **Krediter kilden i widgeten:** vis lisensen og en kildehenvisning (NLOD/CC BY) i bunnteksten, og lenk til datasettet på data.norge.no. Følg krediteringsreglene i `finn-datakilde`.
6. **Tekst under widgeten:** kort hva dataene viser + lenker til datasett og API (begge når de finnes).

Svar på brukerens språk (norsk hvis spørsmålet er på norsk). Trenger du å finne kilden først, kjør `finn-datakilde` før du visualiserer.
