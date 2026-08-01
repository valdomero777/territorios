# -*- coding: utf-8 -*-
"""Descarga la red vial con nombre de la zona del territorio desde OpenStreetMap."""
import json, os, sys, urllib.request, urllib.parse

sys.stdout.reconfigure(encoding="utf-8")
OUT = os.path.dirname(os.path.abspath(__file__))

# Caja generosa alrededor de las colonias localizadas con Nominatim.
BBOX = (24.038, -104.605, 24.085, -104.565)  # sur, oeste, norte, este

CONSULTA = f"""
[out:json][timeout:90];
(
  way["highway"]["name"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out geom;
"""

ESPEJOS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

datos = None
for url in ESPEJOS:
    try:
        print("consultando", url)
        req = urllib.request.Request(
            url,
            data=urllib.parse.urlencode({"data": CONSULTA}).encode(),
            headers={"User-Agent": "territorios-congregacion/1.0"},
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            datos = json.loads(r.read().decode())
        break
    except Exception as e:
        print("  falló:", e)

if not datos:
    raise SystemExit("no se pudo descargar OSM")

vias = [e for e in datos["elements"] if e.get("type") == "way" and e.get("geometry")]
print("vías con nombre:", len(vias))

nombres = {}
for v in vias:
    n = v["tags"].get("name")
    if not n:
        continue
    nombres.setdefault(n, []).append([[p["lat"], p["lon"]] for p in v["geometry"]])

print("nombres distintos:", len(nombres))
json.dump(nombres, open(os.path.join(OUT, "osm_calles.json"), "w", encoding="utf8"), ensure_ascii=False)
for n in sorted(nombres)[:40]:
    print("  -", n)
