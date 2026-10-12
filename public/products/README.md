# Produktbilder

Små bilder av de faktiske produktene, vist i flishodet i stedet for Lucide-ikoner
(`src/components/DeviceImage.jsx`, oppslag i `src/services/product-images.js`).

Innholdet her er **gitignored** (unntatt denne fila og `sources.json`): bildene er
produsentenes og skal ikke i det offentlige repoet. Mappen følger med i `dist/` ved
bygging, så den deployes sammen med dashbordet. Mangler `manifest.json`, brukes Lucide.

## Bygg biblioteket

```
pip install pillow
python scripts/fetch_product_images.py --token <HA-langtidstoken>
```

Skriptet leser enhetslista fra Home Assistant og henter:

| Kilde | Mappe | Nøkkel |
|---|---|---|
| `sources.json` → `manual[]` (håndplukket) | `manual/` | `keys` (produsent\|modell) og/eller `match` (regex mot enhetsnavn) |
| Tesla compositor (`sources.json` → `tesla`) | `tesla/` | `tesla\|<modell>` |
| Zigbee2MQTT-bildebank (mqtt-enheter med `model_id`) | `z2m/` | `produsent\|model_id` |
| brands.home-assistant.io (per integrasjon) | `brands/` | `brand:<integrasjon>` (kind `logo`) |

Hvit bakgrunn gjøres gjennomsiktig, bildet beskjæres og skaleres til maks 256 px.
Filer som finnes fra før lastes ikke ned på nytt (`--force` overstyrer).

## Håndplukkede bilder

Oppføringer i `manual[]` uten `url` forventer at fila ligger i `manual/<id>.png` fra før
(lagre bildet fra produsentens nettsted der). Med `url` lastes den ned. `match` er en
regex som testes mot enhetsnavnet i HA, for enheter der produsent/modell bare er
wifi-dongelen (varmepumpene).

Tesla: `model` = `my`/`m3`/`ms`/`mx`, `options` = lakk/felger-koder fra Teslas konfigurator
(f.eks. `$PPSW` perlehvit, `$PBSB` sort, `$PN00` stealth grey, `$PR01` ultra red,
`$PPSB` deep blue; felger `$WY19B` 19″ Gemini, `$WY20P` 20″ Induction).

## Nøkler

`produsent|model_id`, `produsent|modell`, `model_id`, `modell` – alle små bokstaver.
Enheten får `device.product` fra device registry i `hub-mapper.jsx` (`productInfoOf`).
