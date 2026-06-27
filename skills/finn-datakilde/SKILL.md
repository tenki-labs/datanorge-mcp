---
name: finn-datakilde
description: >-
  Finn offentlige datakilder på data.norge.no (Felles datakatalog), og finn BÅDE et
  datasett og et API når begge finnes — så brukeren kan velge fil-nedlasting eller
  live-oppslag. Bruk denne når brukeren lurer på hvor de finner data om et tema, om det
  finnes åpne/offentlige data på noe, ber om et datasett eller en API-kilde, eller skriver
  /finn-datakilde. Skillen søker iterativt, vurderer treffene, og henter ALLTID fram lisens
  og krediteringskrav. Trigger-fraser: "hvor finner jeg data om", "finnes det data på",
  "er det offentlig data om", "finn datakilde", "finn en kilde for", "leter etter datasett",
  "har vi åpne data på", "where can I find data about".
---

# Finn datakilde

Svar på **«Hvor finner jeg data om dette?»** ved å lete i data.norge.no — og lever, når mulig,
**både et datasett (fil/nedlasting) og et API (live/oppslag)** så brukeren kan velge. Krediter
alltid kilden.

## Verktøy (datanorge MCP)

- `search_datasets` / `search_apis` — søk etter datasett og API-er
- `get_dataset` / `get_api` — full metadata, lenker og lisens
- `fetch_data` — hent de faktiske dataene fra en URL

> Mangler verktøyene, er MCP-serveren ikke koblet til. Be brukeren installere `datanorge`-
> pluginen (eller `claude mcp add datanorge -- npx -y github:tenki-labs/datanorge-mcp`).

## Arbeidsflyt

1. **Forstå spørsmålet.** Trekk ut temaet. **Ikke putt dimensjonsord i søkestrengen**
   (kommune, per, hver, fylke, år, måned) — søk på selve temaet; dimensjonen bruker du når du
   *leser/henter* dataene. Lag 2–4 norske søkevarianter (presist begrep, synonym, bredere term).

2. **Søk i BEGGE katalogene.** Kjør `search_datasets` **og** `search_apis` for temaet (gjerne
   parallelt). Målet er å gi brukeren **både et datasett og et API** der begge finnes.

3. **Vurder treffene.** Relevans, troverdig utgiver (SSB, Kartverket, Miljødirektoratet,
   Meteorologisk institutt, kommuner …), åpne data, og ferskhet.

4. **Forfin — påkrevd ved 0/svake treff.** Gir et søk 0 eller svake treff, **må** du kjøre minst
   én ny runde (synonym, bredere begrep, engelsk) før du konkluderer — ikke stol på at ett
   tilfeldig søk traff. Loop opptil ~5 runder; stopp når du har gode kandidater i begge kategorier.

5. **Hent detaljer, og par datasett med API.** Kjør `get_dataset` og `get_api` for toppkandidatene.
   Har et datasett **0 distribusjoner** (dataene ligger bak et API), kjør `search_apis` på samme
   tittel for å finne companion-API-et — datasett og API kommer ofte i par («X» + «X – API»).

6. **Lever data ved oppdeling.** Ber brukeren om en oppdeling (per/hver kommune, over tid, per
   fylke …), ikke stopp ved katalogoppføringen: hent et lite utdrag med `fetch_data` som faktisk
   viser oppdelingen, eller si tydelig hvorfor det ikke lar seg gjøre.

## Svar — presenter alternativene

Svar på brukerens språk (norsk hvis de skriver norsk). Gi, når mulig, **begge**:

- 📦 **Datasett (fil/nedlasting):** tittel · utgiver · nedlastings-URL + format · lisens/kreditering · `https://data.norge.no/datasets/{id}`
- 🔌 **API (live/oppslag):** tittel · utgiver · endepunkt-URL + dok/spec · lisens/kreditering · data.norge.no-lenke

Si kort hva som passer til hva: **datasett** = engangsnedlasting / analyse av en fil; **API** =
sanntid, filtrering og oppslag per enhet. Finner du bare én av delene, si det — og hvorfor
(f.eks. «ingen åpen API-oppføring for dette i katalogen»).

Finner du ingenting etter å ha forfinet søket, si det ærlig og foreslå å lete direkte hos
f.eks. SSB, Geonorge/Kartverket eller den aktuelle etaten.

## Kreditering — viktig

Plikten til å oppgi kilde følger **datasettets/API-ets lisens**, ikke data.norge.no:

- **Vis alltid lisensen** til data du anbefaler eller bruker. `get_dataset`/`get_api` gir en ferdig
  «Kreditering / attribution»-seksjon — bruk den.
- **Krever lisensen navngivelse** (NLOD, CC BY, CC BY-SA, CC BY-NC, CC BY-ND, og i praksis alt som
  ikke er CC0 / public domain), så **må kilden krediteres**. Gi en ferdig kildehenvisning:
  - **NLOD:** «Inneholder data under Norsk lisens for offentlige data (NLOD) tilgjengeliggjort av {utgiver}.»
  - **CC BY:** «{tittel}» av {utgiver}, lisensiert under CC BY 4.0. Kilde: {lenke}.
- **CC0 / public domain:** ikke påkrevd, men god skikk er å lenke til kilden.
- **Uavklart/ukjent lisens:** be brukeren sjekke vilkårene på kildens landingsside før bruk.
- Oppgir kilden sin egen krediteringstekst, bruk den **ordrett**.

Når du leverer data videre (rapport, notat, app), ta krediteringen med — ikke bare nevn at den finnes.
