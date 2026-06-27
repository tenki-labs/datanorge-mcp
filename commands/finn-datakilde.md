---
description: Finn en offentlig datakilde på data.norge.no for et tema (med kreditering)
argument-hint: [tema, f.eks. "luftkvalitet i Oslo"]
---

Følg `finn-datakilde`-arbeidsflyten og finn offentlige datakilder på data.norge.no for: **$ARGUMENTS**

Gjør dette:

1. Søk iterativt med `datanorge`-verktøyene (`search_datasets`, og `search_apis` hvis et live-API passer). Forfin søket med synonymer / bredere begreper til du har 2–3 sterke treff.
2. Hent detaljer for toppkandidatene med `get_dataset` / `get_api`.
3. Presenter en kort, rangert liste: hva det er, utgiver, tilgangs-/nedlastings-URL, format.
4. **Vis alltid lisens.** Krever lisensen navngivelse (NLOD, CC BY m.fl.), ta med en ferdig kildehenvisning for kreditering. Bruk «Kreditering / attribution»-seksjonen fra `get_dataset`/`get_api`.

Svar på brukerens språk (norsk hvis spørsmålet er på norsk).
