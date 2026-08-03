# Territorios del servicio — Congregación Las Nubes, Dgo.

Aplicación web para asignar, registrar y medir el trabajo diario sobre el territorio.

El mapa **no es una imagen**: cada una de las 240 cuadras es un polígono independiente,
extraído del PDF original y **georreferenciado sobre el mapa real de Durango**. Se ve sobre
calles o satélite, el territorio completo va delimitado con una línea roja, y el estado se
cambia tocando la cuadra directamente en el mapa.

## Cómo se georreferenció

El PDF no trae coordenadas. Se obtuvieron así (los scripts están en `tools/`):

1. Se extrae la geometría vectorial del PDF y las 211 etiquetas de calle.
2. Se descarga la red vial real de la zona desde OpenStreetMap (684 calles con nombre).
3. Se emparejan los nombres, se busca una transformación afín por RANSAC y se refina con ICP
   contra las polilíneas reales.

**Resultado: error mediano de 3.9 m** (p90 = 11 m) sobre 150 calles de control, con escala
idéntica en ambos ejes (4.419 m/unidad) y giro de 0.4°. Es decir, las cuadras caen sobre las
manzanas reales. Ese ajuste corrigió además la superficie total: **0.99 km²**, no los 1.33 km²
que sugería la barra de escala impresa en el PDF.

### Por qué OpenStreetMap y no Google Maps

Google Maps exige una clave de API asociada a una **cuenta con facturación**, aunque haya cuota
gratuita: es un trámite y un riesgo de cobro para algo que se publica en hosting gratuito. Con
Leaflet + OpenStreetMap no hace falta clave ni cuenta, y la capa **Satélite** (Esri World Imagery)
da la vista aérea. Si algún día prefieres Google, solo hay que cambiar la capa base en
[`src/components/MapaReal.tsx`](src/components/MapaReal.tsx); todo lo demás queda igual.

## Cómo está pensada

La regla que ordena todo lo demás: **la unidad de trabajo es la cuadra, no el territorio.**
Los territorios de este mapa van de 1 a 15 cuadras; contarlos por territorio haría que
`T24` (1 cuadra) pesara lo mismo que `T3` (15) y las decisiones saldrían torcidas.

De ahí salen el resto de las reglas:

| Regla | Qué significa en la práctica |
|---|---|
| **Bitácora inmutable** | No hay una casilla "trabajado" que se sobreescribe. Se guardan registros con fecha y capitán; el estado del mapa se *calcula*. El historial no se pierde ni se corrompe aunque dos personas capturen a la vez. |
| **Ciclo (vuelta)** | Un recorrido completo del territorio. Al cerrarlo todo vuelve a "pendiente" y el historial se conserva. La política es configurable en Ajustes: ciclo estricto, con reasignación libre, o sin ciclos (solo antigüedad). |
| **Prioridad por antigüedad** | El mapa se puede pintar por días sin trabajarse, para ver de un vistazo qué urge aunque el ciclo vaya a medias. |
| **Dos capas que conviven** | El **S-13** registra la tenencia: un territorio completo se entrega a un hermano, que lo trabaja días o semanas y lo devuelve. El **Rol** solo fija quién capitanea cada modalidad cada día. Ambas alimentan el mismo mapa. |
| **No se planifica la salida del día, se anuncia y se registra** | Así se coordina en la calle: no hay punto de reunión fijo ni cuadras decididas con antelación — el capitán del rol anuncia esa misma mañana lo que toca (según lo que quedó pendiente) y, al volver, se registra lo que de verdad se cubrió. La pantalla *Hoy* tiene un botón **Anunciar** (arma el texto para compartir) y **Marcar trabajadas hoy** (asienta el registro), sin objeto intermedio que crear ni cerrar. |
| **La asignación de hoy sale de lo de ayer** | La pantalla *Hoy* propone las cuadras pendientes **más cercanas a donde terminaron** la última vez, con la distancia en metros. Se camina: la cercanía real manda sobre el número de territorio, y por eso la propuesta cruza de territorio cuando la manzana de al lado pertenece a otro. |
| **Cierre con avance parcial** | Al cerrar, el capitán marca solo lo que de verdad se cubrió. Lo demás regresa a pendientes con su prioridad intacta. Sin esto el registro se vuelve mentira en dos semanas. |
| **El rol lo arma la persona, no la app** | La app guarda, acota y imprime; los nombres los elige el responsable. Al abrir un día, la lista muestra primero a quienes están disponibles *ese día en esa modalidad*, pero se puede elegir a cualquiera. |

## Pantallas

- **Hoy** — la pantalla de operación diaria: el capitán del rol de hoy, dónde se quedaron la
  última vez y la continuación sugerida con distancias reales, lista para anunciar o para
  registrar directo.
- **Mapa** — sobre calles reales o satélite, con el territorio delimitado en rojo. Cuatro modos de
  toque:
  - **Marcar** (predeterminado): un toque marca la cuadra como trabajada hoy, otro lo deshace.
  - **Consultar**: abre historial, notas, "Cómo llegar" y "Marcar todo el territorio".
  - **Seleccionar**: varias cuadras a la vez para marcarlas o anunciarlas juntas.
  - **Editar forma**: corrige a mano los vértices de una cuadra cuando el límite dibujado no
    coincide con la calle real (ver "Corregir la forma de una cuadra a mano" más abajo).

  Además: coloreado por estado / antigüedad / territorio, filtro por zona, puntos de reunión
  marcados y botón **Dónde estoy** (GPS) para ubicarse en la calle.
- **Rol mensual** — el *rol de encargado de grupo de predicación* (ver abajo).
- **Métricas** — avance del ciclo, ritmo semanal, cierre proyectado, cobertura por zona,
  antigüedad, participación de capitanes y territorios rezagados.
- **Territorios** — el registro formal, en dos partes:
  - *Asignaciones*: a quién se le entregó cada territorio y desde hace cuántos días, y cuáles
    están disponibles **ordenados por el que lleva más tiempo sin completarse**. Al registrar el
    completado, ofrece marcar de una vez sus cuadras en el mapa, para que las dos capas nunca se
    contradigan.
  - *Registro S-13*: réplica imprimible del formato oficial (ver abajo).
- **Catálogos** — territorios y cuadras (renombrar, mover de zona, dar de baja, mover una cuadra
  de territorio *con su historial*), hermanos y puntos de reunión.
- **Ajustes** — política de ciclo, umbrales del semáforo, cierre de ciclo y respaldo.

## El rol de encargados

*Rol mensual* reproduce el calendario que hoy se lleva en hoja de cálculo: semanas de lunes a
domingo y, en cada día, una línea por modalidad con su encargado, más los días señalados
(asamblea, día de campo, conmemoración…). Se imprime con la nota al pie.

Dos cosas que el archivo original dejó claras y que el modelo respeta:

- **Las modalidades son cinco, no dos turnos**: Cartas, Calles, Mañana, Tarde y Zoom, y varias
  conviven el mismo día con encargados distintos. Se configuran en Ajustes, incluyendo cuáles
  llevan cuadras del territorio (Mañana y Tarde) y cuáles no.
- **La disponibilidad es por día × modalidad**, no por día: es la matriz de la hoja «CAPITANES».
  Alan González está el jueves por la tarde y el sábado por la mañana, no «los jueves y sábados».
  Se captura en Catálogos → Hermanos.

**Copiar de \<mes anterior\>** repite el patrón respetando el día de la semana (el enésimo martes
del mes destino, etc.) sin copiar cuadras; los nombres quedan para ajustarlos a mano.

Se validó cargando el rol real de marzo de 2026 y la matriz de disponibilidad completa: el
calendario sale idéntico, incluidas las líneas de tres modalidades (viernes), el día de campo y el
discurso especial.

## El registro S-13

*Territorios → Registro S-13* reproduce el formato oficial **S-13-S** que hoy se llena a mano:
A4 vertical, año de servicio, columna de acarreo («última fecha en que se completó») y cuatro
bloques de *asignado a / fecha en que se asignó / fecha en que se completó* por territorio. Las
hojas van por rango (1-20 y 21-39, como se usan actualmente) y se imprimen o se guardan como PDF
desde el diálogo de impresión.

Se validó cargando los dos S-13 de marzo de 2026 y comparando renglón por renglón, incluidos los
casos con dos asignaciones en el año (T22, T30, T31, T37, T38) y los territorios sin acarreo.

Detalles que respeta:

- El **año de servicio** va de septiembre a agosto: una asignación de septiembre de 2025 cae en el
  año 2026, como en el formato impreso.
- La **columna de acarreo** sale de la última asignación completada en años anteriores; mientras no
  exista, usa la fecha que se capture a mano en el territorio (para arrancar con el historial que
  ya traen en papel).
- Un territorio **no puede estar en dos manos a la vez**: al asignarlo de nuevo, la asignación
  anterior se cierra automáticamente el día previo.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/
npm run preview    # revisa el build de producción
```

## Publicar gratis

`base: "./"` en `vite.config.ts` hace que funcione tanto en la raíz como en un subdirectorio.

- **Netlify / Vercel** — conecta el repositorio; `netlify.toml` ya trae el comando (`npm run build`)
  y la carpeta (`dist`).
- **GitHub Pages** — sube el repo, entra en *Settings → Pages → Source: GitHub Actions*. El flujo
  `.github/workflows/deploy.yml` publica en cada `push` a `main`.

La app es una PWA: desde el celular, "Agregar a pantalla de inicio" la instala y funciona **sin
conexión**, que es como se usa en la calle. El service worker guarda también las teselas del
mapa que ya se vieron (hasta 900), así que el fondo sigue apareciendo sin señal en la zona que
ya se recorrió. Si aun así el fondo no carga, la capa **Sin fondo** dibuja las cuadras sobre
blanco y todo lo demás sigue funcionando igual.

## Dónde viven los datos

Toda la app habla con la interfaz `Repo` de [`src/data/repo.ts`](src/data/repo.ts), que tiene dos
implementaciones intercambiables — `crearRepo()` elige una sola línea:

- **`repoLocal.ts`** — en el navegador de cada dispositivo (`localStorage`); se comparte
  exportando el respaldo JSON desde Ajustes. Es lo que se usa si no hay Firebase configurado.
- **`repoFirebase.ts`** — registro compartido en vivo (Firestore): todos los que entren con la
  clave del grupo ven y editan el mismo dato, en el momento. Se activa solo con tener las
  variables `VITE_FIREBASE_*` configuradas.

### Modo compartido (Firebase)

No hay cuentas por persona. Hay **una sola cuenta** de Firebase Authentication (correo/contraseña)
en todo el proyecto, y su contraseña es la clave que se reparte con el grupo — al abrir el sitio
pide esa clave una vez por navegador (`src/components/PuertaAcceso.tsx`) y ya. Las reglas de
Firestore (`firestore.rules`, se pega en Firebase Console → Firestore Database → Reglas) exigen
sesión iniciada; como es la única cuenta que existe, entrar con la clave correcta es la única
forma de entrar.

Los datos se guardan por colección, no en un solo documento (`congregacion/estado`,
`congregacion/registros/{id}`, `congregacion/personas/{id}`, `congregacion/asignaciones/{id}`,
`congregacion/jornadas/{id}`, `congregacion/geometria/{cuadraId}`) — así la bitácora puede crecer
sin toparse con el límite de 1 MB por documento de Firestore, y dos personas guardando a la vez
no se pisan porque tocan documentos distintos. La geometría del mapa **no** se sincroniza (sigue
viviendo en `src/data/mapa.json`, igual para todos); solo lo editable (nombre, zona, notas,
acarreo, formas corregidas a mano) viaja por Firestore.

**Para activarlo:**
1. Firebase Console → Authentication → Sign-in method → habilitar Correo/contraseña.
2. Authentication → Users → Add user → el correo y la clave del grupo.
3. Firestore Database → crear la base (si no existe) → pegar `firestore.rules` en la pestaña Reglas.
4. Copiar `.env.local.example` a `.env.local` y llenar los valores (Firebase Console →
   Configuración del proyecto → tus apps → app web → Config del SDK) para `npm run dev`.
5. Para el sitio publicado: dar de alta los mismos valores como *secrets* en el **environment
   "prod"** del repositorio (Settings → Environments → prod → Environment secrets), con el
   **mismo nombre que la variable de entorno** (`deploy.yml` los pasa tal cual, sin renombrar) —
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_SHARED_EMAIL`. Tienen que quedar ahí y no en "Repository secrets": los secrets de un
   *environment* solo los ve un job que declare ese environment, y por eso el job `construir` de
   `deploy.yml` trae `environment: prod`. Si le pusiste protecciones al environment (revisores
   requeridos, espera), el build se va a detener a esperar esa aprobación antes de compilar.

## Regenerar el mapa

Cuando la congregación emita una revisión nueva, se corren los cuatro pasos en orden:

```bash
pip install pymupdf shapely
python tools/extraer_mapa.py       # PDF -> geometría, territorios y cuadras
python tools/descargar_osm.py      # red vial real de la zona
python tools/georreferenciar.py    # ajuste PDF -> coordenadas (imprime el error en metros)
python tools/generar_geo.py        # mapa.json final + contorno rojo
# copia el mapa_geo.json resultante a src/data/mapa.json
```

`extraer_mapa.py` agrupa cada cuadra con su territorio por color y adyacencia, y avisa de las
inconsistencias del mapa origen. En la revisión 04/26 detectó una: la letra `F` aparece dos veces
en el territorio 5, y la segunda se renombró a `J`.

**Los datos capturados no se pierden al actualizar el mapa.** Cada cuadra guarda un identificador
`origen` que no cambia aunque se mueva de territorio; al arrancar, la app conserva lo que editaste
(nombres, zonas, bajas, notas, reorganizaciones) y refresca solamente la geometría, incorporando
las cuadras nuevas que traiga la revisión.

### Corregir la forma de una cuadra a mano

Para un ajuste puntual (el límite no coincide con la calle real, cambió una calle) no hace falta
repetir el pipeline completo del PDF: **Mapa → modo "Editar forma"** deja tocar una cuadra y
arrastrar sus vértices directamente sobre el mapa real — tocar un vértice lo quita, tocar el punto
tenue de en medio de un lado agrega uno nuevo. El cambio se ve al instante en toda la app (mapa,
minimapas, superficie), pero vive solo en este dispositivo hasta que se exporta.

Cuando ya está bien: **Ajustes → Geometría corregida a mano → Exportar mapa.json actualizado**
descarga un `mapa.json` con esas cuadras corregidas y el contorno rojo y el área total
recalculados (la misma unión de polígonos que hace `generar_geo.py` con `shapely`, aquí con la
librería `polygon-clipping` en el navegador). Se copia a `src/data/mapa.json`, se hace
`npm run build`/se despliega, y en Ajustes se usa "Limpiar borrador" — ya quedó incorporado a la
geometría base para todos.

## Mapa base (revisión 04/26)

39 territorios · 240 cuadras · 16 zonas · 69 referencias (escuelas, iglesias, jardines, lotes
baldíos) · 211 nombres de calle · **0.99 km²** · error de georreferencia 3.9 m (mediana).
