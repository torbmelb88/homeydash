#!/usr/bin/env python3
"""Bygger produktbilde-biblioteket i public/products/ for dashbordet.

Kilder (i denne rekkefølgen, alle lagres lokalt så nettbrettet aldri henter fra internett):
  1. Håndplukkede bilder fra public/products/sources.json  (manual/<id>.png)
  2. Tesla sin «compositor» (bilen i riktig farge/felger)   (tesla/<model>.png)
  3. Zigbee2MQTT sin bildebank per modell-ID                (z2m/<model_id>.png)
  4. Merkelogo per integrasjon fra brands.home-assistant.io (brands/<domain>.png, kind=logo)

Enhetslista hentes fra Home Assistant (device registry via template-API-et). Bildene får
hvit bakgrunn gjort gjennomsiktig, beskjæres og skaleres til maks 256 px, og manifest.json
skrives. Krever Python 3 + Pillow (`pip install pillow`).

Bruk:
  python scripts/fetch_product_images.py --url http://192.168.50.68:8123 --token <HA-token>
  (eller miljøvariablene HASS_URL / HASS_TOKEN). --force laster ned alt på nytt.
"""
import argparse
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    print("Mangler Pillow: pip install pillow", file=sys.stderr)
    sys.exit(1)

# Windows-konsollen er cp1252 – skriv UTF-8 så norske tegn og piler ikke krasjer skriptet
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_PX = 256
UA = "homeydash-product-images/1.0"

# Integrasjoner der merkelogoen ikke sier noe om produktet (transport/plattform/interne)
BRAND_SKIP = {
    "mqtt", "zwave_js", "esphome", "sun", "holiday", "backup", "systemmonitor", "energikostnad",
    "stromstyring", "mobile_app", "template", "group", "hassio", "homeassistant", "shopping_list",
    "google_translate",
}

TEMPLATE = (
    "{% set ns = namespace(out=[]) %}"
    "{% for d in states | map(attribute='entity_id') | map('device_id') | reject('none') | unique %}"
    "{% set ns.out = ns.out + [ {'id': d, 'name': device_attr(d,'name_by_user') or device_attr(d,'name'),"
    " 'manufacturer': device_attr(d,'manufacturer'), 'model': device_attr(d,'model'),"
    " 'model_id': device_attr(d,'model_id'), 'ids': device_attr(d,'identifiers') | list } ] %}"
    "{% endfor %}{{ ns.out | tojson }}"
)


def log(msg):
    print(msg, flush=True)


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def ha_devices(url, token):
    req = urllib.request.Request(
        url.rstrip("/") + "/api/template",
        data=json.dumps({"template": TEMPLATE}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": UA},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")
    return s or "x"


def norm(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def process(data):
    """Hvit bakgrunn → gjennomsiktig (flomfyll fra hjørnene), beskjær, skaler til maks 256 px."""
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    alpha_min = im.getchannel("A").getextrema()[0]
    if alpha_min == 255:  # ingen gjennomsiktighet fra før → fjern hvit bakgrunn
        rgb = im.convert("RGB")
        w, h = rgb.size
        sentinel = (255, 0, 255)
        for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
            if min(rgb.getpixel(xy)) > 225:
                ImageDraw.floodfill(rgb, xy, sentinel, thresh=28)
        px = rgb.load()
        out = im.load()
        for y in range(h):
            for x in range(w):
                if px[x, y] == sentinel:
                    out[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)
    return im


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "PNG", optimize=True)


def ensure_image(out_dir, rel, url, force, label):
    """Last ned (om nødvendig), prosesser og lagre. Returnerer (w, h) eller None."""
    path = os.path.join(out_dir, rel)
    if os.path.exists(path) and not force:
        with Image.open(path) as im:
            return im.size
    if not url:
        return None
    try:
        data = fetch(url)
    except Exception as e:  # noqa: BLE001
        log(f"  ✗ {label}: {url} ({e})")
        return None
    try:
        im = process(data)
    except Exception as e:  # noqa: BLE001
        log(f"  ✗ {label}: kunne ikke lese bildet ({e})")
        return None
    save(im, path)
    log(f"  ✓ {label} → {rel} ({im.size[0]}×{im.size[1]})")
    return im.size


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=os.environ.get("HASS_URL", "http://192.168.50.68:8123"))
    ap.add_argument("--token", default=os.environ.get("HASS_TOKEN"))
    ap.add_argument("--out", default=os.path.join(ROOT, "public", "products"))
    ap.add_argument("--force", action="store_true", help="last ned alt på nytt")
    args = ap.parse_args()
    if not args.token:
        ap.error("mangler --token (eller HASS_TOKEN)")

    out_dir = args.out
    os.makedirs(out_dir, exist_ok=True)
    sources_path = os.path.join(out_dir, "sources.json")
    sources = {}
    if os.path.exists(sources_path):
        with open(sources_path, encoding="utf-8") as f:
            sources = json.load(f)

    log(f"Henter enhetsliste fra {args.url} …")
    devices = ha_devices(args.url, args.token)
    log(f"{len(devices)} enheter i device registry")

    entries = []
    seen_ids = set()

    def add(entry, size):
        if entry["id"] in seen_ids or size is None:
            return
        if size[0] / max(size[1], 1) > 1.6:
            entry["wide"] = True
        seen_ids.add(entry["id"])
        entries.append(entry)

    # 1. Håndplukkede bilder
    log("\n[1/4] Håndplukkede bilder (sources.json → manual/)")
    for m in sources.get("manual", []):
        mid = m.get("id") or slug(m.get("label") or "|".join(m.get("keys", [])))
        rel = m.get("file") or f"manual/{mid}.png"
        size = ensure_image(out_dir, rel, m.get("url"), args.force, m.get("label") or mid)
        if size is None:
            log(f"  … mangler {rel} ({m.get('label') or mid}) – legg filen i public/products/ eller oppgi url")
            continue
        entry = {"id": f"manual:{mid}", "file": rel, "label": m.get("label") or mid, "kind": m.get("kind", "product"),
                 "keys": [norm(k) for k in m.get("keys", [])]}
        if m.get("match"):
            entry["match"] = m["match"]
        if m.get("wide"):
            entry["wide"] = True
        add(entry, size)

    # 2. Tesla compositor
    log("\n[2/4] Tesla compositor")
    tesla_cfg = sources.get("tesla") or {}
    tesla_devices = [d for d in devices if norm(d.get("manufacturer")) == "tesla"]
    if tesla_devices and tesla_cfg.get("model"):
        model_code = tesla_cfg["model"]  # my / m3 / ms / mx
        options = tesla_cfg.get("options", "")
        url = ("https://static-assets.tesla.com/configurator/compositor?model=%s&options=%s&view=%s&size=600&bkba_opt=1"
               % (model_code, urllib.parse.quote(options, safe="$,"), tesla_cfg.get("view", "STUD_3QTR")))
        rel = f"tesla/{model_code}.png"
        size = ensure_image(out_dir, rel, url, args.force, "Tesla")
        keys = set()
        for d in tesla_devices:
            for k in (f"tesla|{d.get('model_id')}", f"tesla|{d.get('model')}", d.get("model")):
                if k and not k.endswith("|None"):
                    keys.add(norm(k))
        label = "Tesla " + (tesla_devices[0].get("model") or model_code.upper())
        add({"id": f"tesla:{model_code}", "file": rel, "label": label, "kind": "product", "keys": sorted(keys)}, size)
    elif tesla_devices:
        log("  … Tesla finnes i HA, men sources.json mangler «tesla» (model/options)")

    # 3. Zigbee2MQTT-bilder
    log("\n[3/4] Zigbee2MQTT-bilder (mqtt-enheter med model_id)")
    for d in devices:
        domain = (d.get("ids") or [[None]])[0][0]
        model_id = d.get("model_id")
        if domain != "mqtt" or not model_id:
            continue
        rel = f"z2m/{slug(model_id)}.png"
        url = "https://www.zigbee2mqtt.io/images/devices/%s.png" % urllib.parse.quote(str(model_id), safe="")
        label = " ".join(x for x in [d.get("manufacturer"), d.get("model")] if x) or model_id
        size = ensure_image(out_dir, rel, url, args.force, f"{label} [{model_id}]")
        keys = [norm(f"{d.get('manufacturer')}|{model_id}"), norm(f"{d.get('manufacturer')}|{d.get('model')}"), norm(model_id)]
        add({"id": f"z2m:{slug(model_id)}", "file": rel, "label": label, "kind": "product",
             "keys": [k for k in keys if k and "|none" not in k and k != "none"]}, size)

    # 4. Merkelogoer
    log("\n[4/4] Merkelogoer (brands.home-assistant.io)")
    domains = sorted({(d.get("ids") or [[None]])[0][0] for d in devices if (d.get("ids") or [[None]])[0][0]})
    for domain in domains:
        if domain in BRAND_SKIP:
            continue
        rel = f"brands/{slug(domain)}.png"
        # NB: stien med «/_/» svarer 200 med en «icon not available»-plassholder for ukjente
        # integrasjoner; uten «/_/» gir manglende logo 404 og hoppes over.
        url = f"https://brands.home-assistant.io/{urllib.parse.quote(domain)}/icon.png"
        size = ensure_image(out_dir, rel, url, args.force, domain)
        add({"id": f"brand:{domain}", "file": rel, "label": f"{domain} (logo)", "kind": "logo",
             "keys": [f"brand:{norm(domain)}"]}, size)

    manifest = {"version": 1, "generated": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
                "entries": entries}
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    log(f"\nmanifest.json: {len(entries)} oppføringer "
        f"({sum(1 for e in entries if e['kind'] == 'product')} produktbilder, "
        f"{sum(1 for e in entries if e['kind'] == 'logo')} logoer)")

    # Dekningsrapport: enheter uten produktbilde (kun logo eller ingenting)
    by_key = {}
    for e in entries:
        for k in e["keys"]:
            by_key.setdefault(k, e)
    rules = [(re.compile(e["match"], re.I), e) for e in entries if e.get("match")]
    missing = {}
    for d in devices:
        if norm(d.get("manufacturer")) in ("", "none") and norm(d.get("model")) in ("", "none"):
            continue
        keys = []
        m, model, mid = norm(d.get("manufacturer")), norm(d.get("model")), norm(d.get("model_id"))
        if m and mid and mid != "none":
            keys.append(f"{m}|{mid}")
        if m and model and model != "none":
            keys.append(f"{m}|{model}")
        keys += [k for k in (mid, model) if k and k != "none"]
        hit = next((by_key[k] for k in keys if k in by_key and by_key[k]["kind"] == "product"), None)
        if not hit:
            hit = next((e for rx, e in rules if rx.search(str(d.get("name") or ""))), None)
        if not hit:
            label = f"{d.get('manufacturer')} | {d.get('model')} | {d.get('model_id') or ''}".strip(" |")
            missing.setdefault(label, []).append(d.get("name"))
    if missing:
        log("\nUten produktbilde (bruker logo eller Lucide):")
        for label, names in sorted(missing.items()):
            log(f"  - {label}  ←  {', '.join(sorted(set(str(n) for n in names)))}")


if __name__ == "__main__":
    main()
