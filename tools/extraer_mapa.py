# -*- coding: utf-8 -*-
"""Extrae el mapa de territorios del PDF a un JSON consumible por la app."""
import fitz, json, math, collections, re, os, sys

sys.stdout.reconfigure(encoding="utf-8")
SRC = r"A:\Descargas\Mapaterritorio0426.pdf"
OUT = os.path.dirname(os.path.abspath(__file__))

doc = fitz.open(SRC)
page = doc[0]
W, H = page.rect.width, page.rect.height

hexc = lambda c: "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in c)


def ring_of(it):
    pts = []
    for i in it["items"]:
        if i[0] == "l":
            pts += [(i[1].x, i[1].y), (i[2].x, i[2].y)]
        elif i[0] == "c":
            pts += [(i[1].x, i[1].y), (i[2].x, i[2].y), (i[3].x, i[3].y), (i[4].x, i[4].y)]
        elif i[0] == "re":
            r = i[1]
            pts += [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
    ring = []
    for p in pts:
        q = (round(p[0], 2), round(p[1], 2))
        if not ring or abs(q[0] - ring[-1][0]) > 1e-9 or abs(q[1] - ring[-1][1]) > 1e-9:
            ring.append(q)
    return ring


def shoelace(ring):
    s = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def inside(pt, ring):
    x, y = pt
    n, c, j = len(ring), False, len(ring) - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            c = not c
        j = i
    return c


# ---------------------------------------------------------------- 1. geometría
filled, stroked = [], []
for idx, it in enumerate(page.get_drawings()):
    ring = ring_of(it)
    if len(ring) < 3:
        continue
    r = it["rect"]
    rec = {"i": idx, "ring": ring, "rect": [r.x0, r.y0, r.x1, r.y1], "area": shoelace(ring)}
    f = it.get("fill")
    if f and not all(c > 0.97 for c in f):
        rec["fill"] = tuple(round(c, 4) for c in f)
        filled.append(rec)
    elif it.get("color"):
        rec["stroke"] = tuple(round(c, 4) for c in it["color"])
        stroked.append(rec)

# ---------------------------------------------------------------- 2. texto
lines = []
for b in page.get_text("dict")["blocks"]:
    for l in b.get("lines", []):
        t = "".join(s["text"] for s in l["spans"]).strip()
        if not t:
            continue
        x0, y0, x1, y1 = l["bbox"]
        dx, dy = l.get("dir", (1, 0))
        lines.append({
            "t": t, "bbox": [x0, y0, x1, y1], "c": ((x0 + x1) / 2, (y0 + y1) / 2),
            "size": max((s["size"] for s in l["spans"]), default=0),
            "rot": round(math.degrees(math.atan2(dy, dx)), 1),
        })

badges = [l for l in lines if re.fullmatch(r"\d{1,2}", l["t"]) and 1 <= int(l["t"]) <= 39]
assert len(badges) == 39, len(badges)

letters = [l for l in lines if re.fullmatch(r"[A-Z]", l["t"])]

COLONIAS = ["SAN MARCOS", "LA LUZ", "JARDINES DEL REAL", "LAS VEGAS", "RENACIMIENTO",
            "LAS NUBES", "SAN LUIS", "VALLE ORIENTE", "NVO. PEDREGAL", "HNDA. PEDREGAL",
            "20 DE NOVIEMBRE", "SAN MATEO", "FIDEL VQZ. II", "COCOPO", "UNE"]
colonias = []
for l in lines:
    t = re.sub(r"\s+", " ", l["t"]).strip()
    if t in COLONIAS:
        colonias.append({"nombre": t, "x": round(l["c"][0], 1), "y": round(l["c"][1], 1)})
for tail, name in [("GUADIANA IV", "VILLAS DEL GUADIANA IV"), ("GUADIANA V", "VILLAS DEL GUADIANA V")]:
    m = [l for l in lines if l["t"].strip() == tail]
    if m:
        colonias.append({"nombre": name, "x": round(m[0]["c"][0], 1), "y": round(m[0]["c"][1], 1)})

colonia_boxes = {c["nombre"] for c in colonias} | {"VILLAS DEL", "GUADIANA IV", "GUADIANA V",
                                                  "MAPA DE TERRITORIOS"}

# ---------------------------------------------------------------- 3. letra -> polígono
# Algunas letras (p.ej. 18-C, 28-C) caen sobre un hueco blanco (jardín, lote) dentro
# de su cuadra: se adhieren al polígono coloreado más cercano. La 'N' de la rosa de
# los vientos queda fuera de rango y se descarta.
def polygon_at(pt, radio=15):
    cand = [p for p in filled if inside(pt, p["ring"])]
    if cand:
        return min(cand, key=lambda p: p["area"])
    best, bd = None, 1e9
    for p in filled:
        dx = max(p["rect"][0] - pt[0], 0, pt[0] - p["rect"][2])
        dy = max(p["rect"][1] - pt[1], 0, pt[1] - p["rect"][3])
        d = math.hypot(dx, dy)
        if d < bd:
            best, bd = p, d
    return best if bd < radio else None

for L in letters:
    L["poly"] = polygon_at(L["c"])
descartadas = [L["t"] for L in letters if L["poly"] is None]
letters = [L for L in letters if L["poly"]]

# ---------------------------------------------------------------- 4. agrupar por color + adyacencia
def gap(a, b):
    dx = max(0, max(a["rect"][0] - b["rect"][2], b["rect"][0] - a["rect"][2]))
    dy = max(0, max(a["rect"][1] - b["rect"][3], b["rect"][1] - a["rect"][3]))
    return math.hypot(dx, dy)

cuadra_polys = [L["poly"] for L in letters]
seen, groups = set(), []
for p in cuadra_polys:
    if p["i"] in seen:
        continue
    comp, stack = [], [p]
    seen.add(p["i"])
    while stack:
        cur = stack.pop()
        comp.append(cur)
        for q in cuadra_polys:
            if q["i"] not in seen and q["fill"] == cur["fill"] and gap(cur, q) < 18:
                seen.add(q["i"])
                stack.append(q)
    groups.append(comp)

grupo_de = {}
for g in groups:
    for p in g:
        grupo_de[p["i"]] = id(g)

# cada número de territorio hereda el color del polígono sobre el que está impreso
for B in badges:
    p = polygon_at(B["c"], radio=40)
    B["fill"] = p["fill"] if p else None
    B["grupo"] = grupo_de.get(p["i"]) if p else None

grp_badges = collections.defaultdict(list)
for B in badges:
    if B["grupo"] is not None:
        grp_badges[B["grupo"]].append(B)

# ---------------------------------------------------------------- 5. letra -> territorio
cerca = lambda b, L: math.hypot(b["c"][0] - L["c"][0], b["c"][1] - L["c"][1])

cuadras = []
for L in letters:
    g = grupo_de.get(L["poly"]["i"])
    pool = grp_badges.get(g, [])          # 1º: números dentro del mismo bloque de color
    if not pool:                           # 2º: números impresos sobre ese mismo color
        pool = [b for b in badges if b["fill"] == L["poly"]["fill"]]
    if not pool:                           # 3º: el más cercano, sin más
        pool = badges
    terr = int(min(pool, key=lambda b: cerca(b, L))["t"])
    cuadras.append({"terr": terr, "letra": L["t"], "poly": L["poly"], "c": L["c"]})

byterr = collections.defaultdict(list)
for c in cuadras:
    byterr[c["terr"]].append(c)

# desambiguar letras repetidas dentro de un territorio (error del mapa origen)
avisos = []
for t, cs in byterr.items():
    cnt = collections.Counter(c["letra"] for c in cs)
    for letra, n in list(cnt.items()):
        if n > 1:
            dups = sorted([c for c in cs if c["letra"] == letra], key=lambda c: -c["poly"]["area"])
            libres = [chr(65 + i) for i in range(26) if chr(65 + i) not in cnt]
            for extra in dups[1:]:
                nueva = libres.pop(0)
                avisos.append(f"T{t}: letra '{letra}' duplicada en el mapa original -> "
                              f"la segunda se renombró a '{nueva}' (revisar)")
                extra["letra"] = nueva
                cnt[nueva] = 1

# ---------------------------------------------------------------- 6. escala
escala = None
m = [l for l in lines if re.fullmatch(r"\d+\s*m", l["t"].strip())]
if m:
    lbl = m[0]
    metros = float(re.sub(r"[^\d]", "", lbl["t"]))
    cands = [p for p in stroked + filled
             if abs((p["rect"][1] + p["rect"][3]) / 2 - lbl["c"][1]) < 25
             and (p["rect"][2] - p["rect"][0]) > 20]
    if cands:
        ancho = max(p["rect"][2] - p["rect"][0] for p in cands)
        escala = {"metrosPorUnidad": round(metros / ancho, 4), "referencia": lbl["t"]}

# ---------------------------------------------------------------- 7. referencias y calles
LEYENDA = {}
for l in lines:
    if l["t"] in ("Estacion combustible", "Iglesia", "Lote baldio", "Escuela", "Jardin"):
        sw = [p for p in stroked
              if abs((p["rect"][1] + p["rect"][3]) / 2 - l["c"][1]) < 4
              and p["rect"][2] < l["bbox"][0] + 2 and (p["rect"][2] - p["rect"][0]) < 8]
        if sw:
            LEYENDA[sw[0]["stroke"]] = l["t"]

referencias = []
for p in stroked:
    if p["stroke"] in LEYENDA and p["area"] > 20:
        referencias.append({"tipo": LEYENDA[p["stroke"]], "ring": p["ring"]})

LEG_Y = min([l["c"][1] for l in lines if l["t"] == "Estacion combustible"], default=1e9) - 5

calles = []
for l in lines:
    t = re.sub(r"\s+", " ", l["t"]).strip()
    if t in colonia_boxes or re.fullmatch(r"[A-Z]", t) or re.fullmatch(r"\d{1,2}", t):
        continue
    if l["c"][1] >= LEG_Y and l["c"][0] < W / 2:   # bloque de leyenda, esquina inferior izq.
        continue
    if "Congregacion" in t or re.fullmatch(r"\d+/\d+", t) or re.fullmatch(r"\d+\s*m", t) or t == "N":
        continue
    calles.append({"t": t, "x": round(l["c"][0], 1), "y": round(l["c"][1], 1),
                   "rot": l["rot"], "s": round(l["size"], 1)})

# ---------------------------------------------------------------- 8. salida
def d_of(ring):
    return "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in ring) + "Z"

territorios = []
for t in sorted(byterr):
    cs = sorted(byterr[t], key=lambda c: c["letra"])
    cx = sum(c["c"][0] for c in cs) / len(cs)
    cy = sum(c["c"][1] for c in cs) / len(cs)
    col = min(colonias, key=lambda k: math.hypot(k["x"] - cx, k["y"] - cy))
    b = next(b for b in badges if int(b["t"]) == t)
    territorios.append({
        "id": t,
        "nombre": f"Territorio {t}",
        "zona": col["nombre"],
        "color": hexc(collections.Counter(c["poly"]["fill"] for c in cs).most_common(1)[0][0]),
        "etiqueta": {"x": round(b["c"][0], 1), "y": round(b["c"][1], 1)},
        "cuadras": [{
            "id": f"{t}-{c['letra']}",
            "letra": c["letra"],
            "d": d_of(c["poly"]["ring"]),
            "centro": {"x": round(c["c"][0], 1), "y": round(c["c"][1], 1)},
            "areaU": round(c["poly"]["area"], 1),
        } for c in cs],
    })

data = {
    "meta": {
        "origen": "Mapaterritorio0426.pdf",
        "congregacion": "Las Nubes, Dgo.",
        "revision": "04/26",
        "viewBox": [0, 0, round(W, 1), round(H, 1)],
        "escala": escala,
        "totalTerritorios": len(territorios),
        "totalCuadras": sum(len(t["cuadras"]) for t in territorios),
    },
    "territorios": territorios,
    "zonas": colonias,
    "referencias": [{"tipo": r["tipo"], "d": d_of(r["ring"])} for r in referencias],
    "calles": calles,
}
json.dump(data, open(os.path.join(OUT, "mapa.json"), "w", encoding="utf8"),
          ensure_ascii=False, separators=(",", ":"))

print(f"territorios={len(territorios)}  cuadras={data['meta']['totalCuadras']}  "
      f"referencias={len(referencias)}  calles={len(calles)}  escala={escala}")
for t in territorios:
    ls = [c["letra"] for c in t["cuadras"]]
    exp = [chr(65 + i) for i in range(len(ls))]
    print(f"T{t['id']:>2} {t['zona']:<24} {t['color']} n={len(ls):>2} {''.join(ls)}"
          + ("" if ls == exp else "  <-- REVISAR"))
print("\nAVISOS:")
for a in avisos:
    print(" -", a)
área_total = sum(c["areaU"] for t in territorios for c in t["cuadras"])
if escala:
    m2 = área_total * (escala["metrosPorUnidad"] ** 2)
    print(f"\nárea total ≈ {m2/1e6:.2f} km²")
