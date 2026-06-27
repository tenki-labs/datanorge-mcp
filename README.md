# datanorge

**Finn og hent norske offentlige data fra [data.norge.no](https://data.norge.no) — rett fra Claude Code.**

Spør deg selv «hvor finner jeg data om dette?» — og la Claude lete for deg. Dette er en
liten Claude Code-**plugin** med to deler som spiller sammen:

- 🔎 en **`/finn-datakilde`-kommando/skill** som leter iterativt i Felles datakatalog og
  finner offentlige datasett og API-er for et tema;
- 🧰 en **MCP-server** med verktøy for å søke, hente metadata og laste ned selve dataene.

Den krever **ingen API-nøkkel** og nesten null oppsett, fordi API-ene bak data.norge.no er
helt åpne. Og den **henter alltid fram lisens og krediteringskrav**, slik at kilden blir
kreditert når den skal.

> **English:** A Claude Code plugin to find and fetch Norwegian open government data from
> data.norge.no. Ships a `/finn-datakilde` skill (iterative data-source discovery) plus an
> MCP server (search / metadata / download). No API key. Always surfaces the licence and
> required attribution. See the tools table and the *Kreditering* section below.

---

## Kom i gang

### Alternativ A — som plugin (anbefalt: kommando + MCP i ett)

I Claude Code:

```text
/plugin marketplace add tenki-labs/datanorge-mcp
/plugin install datanorge@datanorge-mcp
```

Det kobler opp både `/finn-datakilde`-skillen og MCP-verktøyene. Start Claude Code på nytt
hvis den ber om det. Eneste krav: **Node.js 18+**.

### Alternativ B — bare MCP-serveren (uten skillen)

Vil du bare ha verktøyene, rett fra GitHub, uten kloning eller npm-publisering:

```bash
claude mcp add datanorge -- npx -y github:tenki-labs/datanorge-mcp
```

### Alternativ C — fra kildekode (utvikling)

```bash
git clone https://github.com/tenki-labs/datanorge-mcp.git
cd datanorge-mcp
npm install        # bygger også via "prepare"
```

Åpne Claude Code i mappa (den bundlede [`.mcp.json`](.mcp.json) plukkes opp automatisk), eller
registrer eksplisitt: `claude mcp add datanorge -- node /absolutt/sti/dist/index.js`.

---

## Slik bruker du den

Bare spør på vanlig norsk — skillen trigger på spørsmål som dette:

- *«Hvor finner jeg data om luftkvalitet i Oslo?»*
- *«Finnes det åpne data på ladestasjoner for elbil?»*
- *«Er det noe offentlig statistikk på befolkning per kommune?»*

…eller bruk kommandoen direkte:

```text
/finn-datakilde befolkning per kommune
```

Claude søker iterativt, forfiner søket, henter detaljer, og presenterer en kort liste med
kilder — **inkludert hvordan du krediterer hver kilde**.

### Verktøyene (MCP)

| Verktøy | Funksjon |
|---|---|
| `search_datasets` | Søk i datasettkatalogen |
| `get_dataset` | Full metadata + nedlastingslenker + **lisens/kreditering** |
| `search_apis` | Søk i API-katalogen (SSB, Kartverket, MET m.fl.) |
| `get_api` | Endepunkt-URL-er for ett API |
| `fetch_data` | Henter de faktiske dataene (CSV/JSON/XML/GeoJSON) |

Typisk flyt: **søk → get_dataset → fetch_data**.

---

## Kreditering / attribution

Dette er viktig, og verktøyet hjelper deg med det automatisk.

Når du bruker data du finner her, følger plikten til å oppgi kilde av **datasettets egen
lisens** — ikke av data.norge.no. `get_dataset` og `get_api` viser derfor alltid en
**«Kreditering / attribution»-seksjon** med lisensen og en ferdig kildehenvisning:

- **NLOD** (Norsk lisens for offentlige data) — **krever kreditering**:
  > Inneholder data under Norsk lisens for offentlige data (NLOD) tilgjengeliggjort av *{utgiver}*.
- **CC BY 4.0** o.l. — **krever kreditering**:
  > «*{tittel}*» av *{utgiver}*, lisensiert under CC BY 4.0. Kilde: *{lenke}*.
- **CC0 / public domain** — kreditering er ikke et krav, men god skikk er å lenke til kilden.
- **Uavklart lisens** — sjekk vilkårene på kildens landingsside før bruk.

Tar du dataene videre i en rapport, et notat eller en app: **ta krediteringen med** — ikke
bare nevn at den finnes. Lenk gjerne også til datasettet på data.norge.no.

---

## Slik virker det

Serveren snakker med to åpne, uautentiserte FDK-endepunkter:

- **Søk** — `POST https://search.api.fellesdatakatalog.digdir.no/search/{type}`
- **Resource** — `GET https://resource.api.fellesdatakatalog.digdir.no/v1/{type}/{id}`

`fetch_data` laster så ned direkte fra distribusjons-/endepunkt-URL-en katalogen peker til
(disse ligger hos utgiverne selv, f.eks. SSB, Kartverket, Statens vegvesen).

### Begrensninger

- **Rate limit:** søke-API-et tillater ~10 forespørsler/minutt. Serveren prøver automatisk
  på nytt ved HTTP 429.
- **Nedlastingstak:** `fetch_data` leser maks 256 KB som standard (opp til 5 MB via
  `maxKilobytes`). Binært innhold returnerer kun metadata.
- **Språk:** norske søkeord treffer best; resultater inkluderer `nb`/`nn`/`en` der det finnes.

---

## Utvikling

```bash
npm install        # installer + bygg
npm run watch      # bygg på endring
npm run smoke      # ende-til-ende MCP-sjekk mot live-API
npm run inspector  # åpne MCP Inspector mot serveren
```

Struktur:
[`src/index.ts`](src/index.ts) registrerer MCP-verktøyene ·
[`src/fdk.ts`](src/fdk.ts) er FDK-klienten ·
[`src/format.ts`](src/format.ts) formaterer svar og klassifiserer lisens/kreditering ·
[`skills/finn-datakilde/SKILL.md`](skills/finn-datakilde/SKILL.md) er skillen ·
[`commands/finn-datakilde.md`](commands/finn-datakilde.md) er slash-kommandoen ·
[`.claude-plugin/`](.claude-plugin/) er plugin- og marketplace-manifestene.

## Publisering (vedlikeholdere)

Pakka publiseres til npm automatisk når en versjons-tag pushes:

```bash
npm version patch
git push --follow-tags
```

Dette trigger [`.github/workflows/publish.yml`](.github/workflows/publish.yml). Det krever en
`NPM_TOKEN`-hemmelighet med publiseringsrett til `@tenki-labs`-scopet. Plugin- og
MCP-installasjon fungerer uansett rett fra GitHub via `npx`, uten npm-publisering.

---

## Lisens

[MIT](LICENSE) © Tenki Labs.

Data leveres av [data.norge.no](https://data.norge.no), driftet av Digitaliseringsdirektoratet
(Digdir). Prosjektet er ikke tilknyttet eller godkjent av Digdir. Følg hvert datasetts egen
lisens — se *Kreditering* over.
