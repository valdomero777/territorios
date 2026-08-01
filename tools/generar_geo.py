# -*- coding: utf-8 -*-
"""Convierte la geometría del PDF a coordenadas reales y calcula el contorno del territorio."""
import json, math, os, re, sys
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

sys.stdout.reconfigure(encoding="utf-8")
OUT = os.path.dirname(os.path.abspath(__file__))

mapa = json.load(open(os.path.join(OUT, "mapa.json"), encoding="utf8"))
g = json.load(open(os.path.join(OUT, "georef.json"), encoding="utf8"))
A = g["afin"]
LAT0, LON0, MX, MY = g["lat0"], g["lon0"], g["mx"], g["my"]

def a_metros(x, y):
    return (A[0] * x + A[1] * y + A[2], A[3] * x + A[4] * y + A[5])

def a_grados(xm, ym):
    return (round(LAT0 + ym / MY, 7), round(LON0 + xm / MX, 7))

def anillo(d: str):
    nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", d)]
    return [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]

def area_m2(pts_m):
    s = 0.0
    for i in range(len(pts_m)):
        x1, y1 = pts_m[i]
        x2, y2 = pts_m[(i + 1) % len(pts_m)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2

# ---------------------------------------------------------- cuadras -> WGS84
poligonos = []
total_area = 0.0
for t in mapa["territorios"]:
    for c in t["cuadras"]:
        pts = anillo(c["d"])
        pm = [a_metros(x, y) for x, y in pts]
        c["latlng"] = [list(a_grados(x, y)) for x, y in pm]
        c["areaM2"] = round(area_m2(pm), 1)
        total_area += c["areaM2"]

        p = Polygon(pm)
        if not p.is_valid:
            p = p.buffer(0)
        # Punto garantizado DENTRO de la cuadra: muchas manzanas son en "L" y su
        # centroide cae en la calle o en la manzana vecina. Este punto se usa para
        # medir distancias y para centrar el mapa, así que tiene que estar dentro.
        try:
            interior = p.representative_point()
            c["centroLatLng"] = list(a_grados(interior.x, interior.y))
        except Exception:
            cx = sum(q[0] for q in pm) / len(pm)
            cy = sum(q[1] for q in pm) / len(pm)
            c["centroLatLng"] = list(a_grados(cx, cy))
        if p.area > 0:
            poligonos.append(p)
    xm = [a_metros(*(t["etiqueta"]["x"], t["etiqueta"]["y"]))]
    t["etiquetaLatLng"] = list(a_grados(*xm[0]))

print(f"cuadras georreferenciadas: {len(poligonos)} · área total {total_area/1e6:.3f} km²")

# ------------------------------------------------------- contorno del conjunto
# Se ensanchan las cuadras para que crucen la calle que las separa, se unen y se
# vuelven a encoger: así el borde sigue el perímetro real y no cada manzana.
MARGEN = 26.0  # metros; ancho típico de calle en esta traza
union = unary_union([p.buffer(MARGEN, join_style=2) for p in poligonos])
union = union.buffer(-MARGEN, join_style=2)
piezas = list(union.geoms) if isinstance(union, MultiPolygon) else [union]
piezas.sort(key=lambda p: -p.area)

contorno = []
for p in piezas:
    if p.area < 5000:      # descarta esquirlas
        continue
    anillo_ext = [list(a_grados(x, y)) for x, y in p.exterior.simplify(4).coords]
    contorno.append(anillo_ext)

print(f"contorno: {len(contorno)} polígono(s), vértices {[len(c) for c in contorno]}")

# ------------------------------------------------------------------- límites
todas = [pt for t in mapa["territorios"] for c in t["cuadras"] for pt in c["latlng"]]
lats = [p[0] for p in todas]
lngs = [p[1] for p in todas]
limites = [[min(lats), min(lngs)], [max(lats), max(lngs)]]

# --------------------------------------------------------- referencias y zonas
for r in mapa["referencias"]:
    r["latlng"] = [list(a_grados(*a_metros(x, y))) for x, y in anillo(r["d"])]
for z in mapa["zonas"]:
    z["latlng"] = list(a_grados(*a_metros(z["x"], z["y"])))

mapa["meta"]["geo"] = {
    "metrosPorUnidad": round(math.hypot(A[0], A[3]), 4),
    "errorMedianoM": round(g["medianaError"], 1),
    "referenciasUsadas": g["pares"],
    "limites": limites,
    "centro": [round((limites[0][0] + limites[1][0]) / 2, 6),
               round((limites[0][1] + limites[1][1]) / 2, 6)],
    "areaTotalM2": round(total_area, 0),
    "contorno": contorno,
}
mapa["meta"]["escala"] = {"metrosPorUnidad": round(math.hypot(A[0], A[3]), 4),
                          "referencia": "ajuste sobre OpenStreetMap"}

json.dump(mapa, open(os.path.join(OUT, "mapa_geo.json"), "w", encoding="utf8"),
          ensure_ascii=False, separators=(",", ":"))
print("centro:", mapa["meta"]["geo"]["centro"], "límites:", limites)
print("guardado mapa_geo.json", os.path.getsize(os.path.join(OUT, "mapa_geo.json")) // 1024, "KB")
