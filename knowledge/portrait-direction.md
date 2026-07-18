# Portretrichting — Team

Hoe de portretten van het AI-team eruitzien. Dit document legt de drie verkende
stijlrichtingen vast en de gedeelde art-direction, zodat een volledige
portrettenset later consistent kan worden afgewerkt.

De portretten verschijnen op de Team-pagina (roster + profiel) en als ronde
node-portretten op de Kaart. Ze volgen de redactionele "Newsroom"-identiteit van
de app (crème papier, inkt-zwart, indigo accent; Playfair Display + Inter +
Space Mono).

## Gedeelde art-direction

Geldt voor élke stijlrichting, zodat de set als één redactie aanvoelt:

- **Compositie:** kop-en-schouders, vierkant (1:1), gecentreerd, onderwerp kijkt
  naar de camera. Één persoon per portret.
- **Toon:** waardig en redactioneel — een krantenredactie, geen stockfoto.
- **Identiteit:** elke persona heeft een eigen, herkenbaar gezicht dat over de
  drie richtingen heen consistent blijft (zelfde leeftijd, kapsel, kenmerken).
- **Achtergrond:** rustig en effen; geen rommel, geen tekst, geen logo's.
- **Palet-anker:** crème, diep inkt-houtskool en indigo blauw als accent.

Negatieve richting (overal vermijden): tekst/letters, watermerk, logo, meerdere
personen, misvormingen, wazigheid, drukke achtergrond.

## De drie richtingen

### 1. Redactioneel (`editorial`)
Hoog-contrast zwarte inkt op warm crème papier, met fijne halftone- en
stippel-/graveertextuur en dramatisch zijlicht. Leest als een verfijnde
broadsheet-illustratie — tijdloos en serieus. Sluit het sterkst aan bij de
identiteit van de app.

### 2. Fotografisch (`photographic`)
Professionele studio-headshot: zacht natuurlijk vensterlicht, ondiepe
scherptediepte, neutrale warmgrijze achtergrond, realistische huidtextuur.
Corporate maar warm en toegankelijk. Het meest letterlijk herkenbaar.

### 3. Avatar (`avatar`)
Vlakke geometrische vector-illustratie in een beperkt palet (crème, houtskool,
indigo). Schone, krachtige vormen, modern-minimaal, met subtiele papiergrein.
Vriendelijk en gestileerd; schaalt goed naar kleine ronde nodes.

## Voorbeelden (gegenereerd)

Drie koppen × drie richtingen, naast elkaar ter vergelijking op de Team-pagina:

- **Lotte** — Orchestrator (operations lead)
- **Marie** — Copywriter
- **Ruben** — Analytics & Tracking Specialist

## Opslag & koppeling

Portretten staan in object storage onder het publieke zoekpad:

- `portraits/<slug>.png` — het gekozen portret van een teamlid (toont op Kaart +
  Team). Eén bestand neerzetten volstaat om een portret te laten verschijnen.
- `portrait-styles/<slug>-<style>.png` — de gegenereerde stijlvoorbeelden, waarbij
  `<style>` één van `editorial`, `photographic`, `avatar` is.

`<slug>` is de bestandsnaam van de agent zonder `.md` (bv. `copywriter`). De API
serveert ze via `/api/storage/public-objects/<pad>` en rapporteert ze per
teamlid in `GET /api/team`.

## Gekozen richting & volledige set

De gekozen richting is **Fotografisch (`photographic`)**: professionele
studio-headshots met zacht natuurlijk vensterlicht, ondiepe scherptediepte en
een neutrale warmgrijze achtergrond. De volledige set van 18 portretten is in
deze stijl afgewerkt, met behoud van de gedeelde art-direction hierboven
(kop-en-schouders, vierkant, gecentreerd, donkere top, één persoon per portret),
en elk teamlid heeft een eigen herkenbaar gezicht passend bij zijn persona.

Elk portret staat als `portraits/<slug>.png` in object storage en verschijnt
automatisch op de Team-pagina (roster + profiel) en als rond node-portret op de
Kaart. De drie eerder gegenereerde fotografische voorbeelden (Lotte, Marie,
Ruben) zijn hergebruikt als hun definitieve portret.
