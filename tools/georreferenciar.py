# -*- coding: utf-8 -*-
"""
Georreferencia el mapa del PDF sobre coordenadas reales (WGS84).

Método:
  1. Siembra: los nombres de calle poco comunes que aparecen una sola vez en el
     PDF y una sola vez en OSM dan pares de puntos aproximados.
  2. RANSAC sobre tríos de esos pares -> transformación afín candidata.
  3. Refinamiento tipo ICP: para cada etiqueta de calle del PDF se busca el punto
     más cercano sobre la polilínea OSM del mismo nombre y se reajusta la afín
     por mínimos cuadrados. Se repite hasta converger.

La medida de error es la distancia en metros de cada etiqueta a su calle.
"""
import json, math, os, random, re, sys, unicodedata

sys.stdout.reconfigure(encoding="utf-8")
OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(7)

mapa = json.load(open(os.path.join(OUT, "mapa.json"), encoding="utf8"))
osm = json.load(open(os.path.join(OUT, "osm_calles.json"), encoding="utf8"))

# ------------------------------------------------------------ plano local (m)
LAT0, LON0 = 24.062, -104.585
MX = 111320.0 * math.cos(math.radians(LAT0))
MY = 110540.0
aMetros = lambda lat, lon: ((lon - LON0) * MX, (lat - LAT0) * MY)
aGrados = lambda x, y: (LAT0 + y / MY, LON0 + x / MX)

# ------------------------------------------------------------ normalización
ABREV = {
    "fco": "francisco", "gral": "general", "ma": "maria", "jose": "jose",
    "and": "andador", "av": "avenida", "blvd": "boulevard", "vqz": "velazquez",
    "nvo": "nuevo", "hnda": "hacienda", "sn": "san", "v": "villa",
}
PREFIJOS = ("calle ", "avenida ", "av ", "andador ", "privada ", "priv ",
            "boulevard ", "blvd ", "calzada ", "cerrada ", "callejon ",
            "prolongacion ", "circuito ", "camino ")

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower().replace(".", " ").replace(",", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = " ".join(ABREV.get(p, p) for p in s.split())
    cambio = True
    while cambio:
        cambio = False
        for p in PREFIJOS:
            if s.startswith(p):
                s = s[len(p):]
                cambio = True
    return re.sub(r"\s+", " ", s).strip()

# ------------------------------------------------------- calles OSM por clave
osm_por_clave = {}
for nombre, lineas in osm.items():
    k = norm(nombre)
    if not k:
        continue
    dest = osm_por_clave.setdefault(k, [])
    for ln in lineas:
        dest.append([aMetros(p[0], p[1]) for p in ln])

# ------------------------------------------------- etiquetas de calle del PDF
etiquetas = []
for c in mapa["calles"]:
    k = norm(c["t"])
    if k and k in osm_por_clave:
        etiquetas.append({"k": k, "p": (c["x"], c["y"]), "t": c["t"]})

print(f"etiquetas del PDF: {len(mapa['calles'])} · con calle homónima en OSM: {len(etiquetas)}")

# ------------------------------------------------------------------ geometría
def largo(linea):
    return sum(math.dist(linea[i], linea[i + 1]) for i in range(len(linea) - 1))

def punto_mas_cercano(pt, lineas):
    mejor, dmin = None, float("inf")
    px, py = pt
    for ln in lineas:
        for i in range(len(ln) - 1):
            ax, ay = ln[i]
            bx, by = ln[i + 1]
            dx, dy = bx - ax, by - ay
            ll = dx * dx + dy * dy
            t = 0.0 if ll == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
            qx, qy = ax + t * dx, ay + t * dy
            d = math.hypot(px - qx, py - qy)
            if d < dmin:
                mejor, dmin = (qx, qy), d
    return mejor, dmin

def afin(origen, destino):
    """Mínimos cuadrados de [x y 1] -> (X, Y). Devuelve (a,b,c, d,e,f)."""
    n = len(origen)
    S = [[0.0] * 3 for _ in range(3)]
    tx = [0.0] * 3
    ty = [0.0] * 3
    for (x, y), (X, Y) in zip(origen, destino):
        v = (x, y, 1.0)
        for i in range(3):
            for j in range(3):
                S[i][j] += v[i] * v[j]
            tx[i] += v[i] * X
            ty[i] += v[i] * Y
    def resolver(t):
        M = [fila[:] + [t[i]] for i, fila in enumerate(S)]
        for i in range(3):
            piv = max(range(i, 3), key=lambda r: abs(M[r][i]))
            if abs(M[piv][i]) < 1e-12:
                return None
            M[i], M[piv] = M[piv], M[i]
            for r in range(3):
                if r == i:
                    continue
                f = M[r][i] / M[i][i]
                for cc in range(i, 4):
                    M[r][cc] -= f * M[i][cc]
        return [M[i][3] / M[i][i] for i in range(3)]
    a = resolver(tx)
    b = resolver(ty)
    if a is None or b is None:
        return None
    return (*a, *b)

aplicar = lambda T, p: (T[0] * p[0] + T[1] * p[1] + T[2], T[3] * p[0] + T[4] * p[1] + T[5])

# --------------------------------------------------------------- semillas
por_clave = {}
for e in etiquetas:
    por_clave.setdefault(e["k"], []).append(e)

semillas = []
for k, es in por_clave.items():
    lineas = osm_por_clave[k]
    if len(es) != 1 or len(lineas) > 3:
        continue
    total = sum(largo(l) for l in lineas)
    if total > 700:            # calles largas: su centro no dice mucho
        continue
    pts = [p for l in lineas for p in l]
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    semillas.append((es[0]["p"], (cx, cy), k))

print("semillas (nombre único y calle corta):", len(semillas))

def evaluar(T, umbral=45.0):
    res, inliers = [], []
    for e in etiquetas:
        q = aplicar(T, e["p"])
        _, d = punto_mas_cercano(q, osm_por_clave[e["k"]])
        res.append(d)
        if d <= umbral:
            inliers.append(e)
    res.sort()
    return inliers, (res[len(res) // 2] if res else 1e9)

mejor = None
for _ in range(4000):
    if len(semillas) < 3:
        break
    tri = random.sample(semillas, 3)
    T = afin([s[0] for s in tri], [s[1] for s in tri])
    if not T:
        continue
    esc = math.hypot(T[0], T[3])
    if not (3.0 < esc < 8.0):            # la escala del mapa ronda 5.13 m/unidad
        continue
    inliers, mediana = evaluar(T, 60.0)
    if mejor is None or len(inliers) > len(mejor[1]):
        mejor = (T, inliers, mediana)

if not mejor:
    raise SystemExit("RANSAC no encontró una transformación válida")

T, inliers, mediana = mejor
print(f"RANSAC: {len(inliers)}/{len(etiquetas)} inliers · mediana {mediana:.1f} m")

# ------------------------------------------------------------ refinamiento ICP
for paso in range(12):
    origen, destino = [], []
    for e in etiquetas:
        q = aplicar(T, e["p"])
        pt, d = punto_mas_cercano(q, osm_por_clave[e["k"]])
        if d <= 60.0:
            origen.append(e["p"])
            destino.append(pt)
    if len(origen) < 6:
        break
    nuevo = afin(origen, destino)
    if not nuevo:
        break
    T = nuevo
    inliers, mediana = evaluar(T)
    print(f"  ICP {paso + 1}: {len(origen)} pares · mediana {mediana:.1f} m")

# --------------------------------------------------------------- diagnóstico
distancias = []
for e in etiquetas:
    q = aplicar(T, e["p"])
    _, d = punto_mas_cercano(q, osm_por_clave[e["k"]])
    distancias.append((d, e["t"]))
distancias.sort()
n = len(distancias)
print("\n--- error de ajuste (distancia de cada etiqueta a su calle real) ---")
for etq, i in [("mediana", n // 2), ("p75", int(n * 0.75)), ("p90", int(n * 0.90))]:
    print(f"  {etq}: {distancias[i][0]:.1f} m")
print("  peores:", [(f"{d:.0f}m", t) for d, t in distancias[-5:]])

escala = math.hypot(T[0], T[3])
rot = math.degrees(math.atan2(T[3], T[0]))
sesgo = math.degrees(math.atan2(T[4], T[1])) - 90
print(f"\nescala {escala:.3f} m/unidad (el PDF declara 5.128) · giro {rot:.2f}° · sesgo {sesgo:.2f}°")

json.dump(
    {"afin": T, "lat0": LAT0, "lon0": LON0, "mx": MX, "my": MY,
     "medianaError": distancias[n // 2][0], "pares": n},
    open(os.path.join(OUT, "georef.json"), "w", encoding="utf8"),
)
print("\nguardado georef.json")
