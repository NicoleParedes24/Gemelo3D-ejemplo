# EcoCampus — visor 3D (three.js)

Gemelo digital 3D del campus UPS (sede Quito). Three.js puro + Vite, sin framework. Todo el código, los comentarios y la interfaz están en español; mantener ese idioma.

## Comandos
- `npm run dev` — servidor de desarrollo (incluye la API `/api/escena` para que el editor guarde).
- `npm run build` — genera `dist/` (estático).
- `docker compose up -d --build` — sirve `dist/` con nginx en el puerto 80 (`PUERTO=8088` para otro puerto).
- Modelo del Bloque H (Blender headless):
  `blender -b --factory-startup --python herramientas/blender/bloque_h.py -- [--preview DIR] [--bake N]`
  → escribe `public/modelos/bloque_h.glb`. El binario de Blender está en `referencias/BLOQUEH/blender-*/`.

## Estructura
- `src/main.js` — arranque y bucle `frame()`; carga la escena desde `/api/escena` o, si no hay API, `escena.json`.
- `src/render/pipeline.js` — renderer, postprocesado y **niveles de calidad** (alto/medio/bajo): detecta la GPU, `?q=` en la URL lo fuerza y baja de nivel si va a menos de ~24 fps.
- `src/render/pbr.js` — materiales PBR desde `public/tex/<nombre>/{color,normal,orm}.jpg` (CC0, ambientCG).
- `src/layout.js` — plano maestro en metros. **+X = este, +Y = arriba, +Z = sur.**
- `src/campus.js`, `environment.js`, `vegetacion.js`, `autos.js`, `decor.js` — exterior del campus.
- `src/bloqueh.js` — carga `bloque_h.glb` y asigna materiales por nombre o marcadores (`veg_*`, `auto`, `luz_*`, `microeolica`). GLTFLoader renombra `auto.001` → `auto001`.
- `src/scene/` — objetos dirigidos por datos (catálogo, cables con flujo, gestor).
- `src/editor/` — editor visual de `escena.json`.
- `src/data/` — bus interno + fuentes: `simulator.js` (por defecto) y `nats.js` (WebSocket, subjects `campus.med.<edificio>.<dispositivo>`).
- `public/escena.json` — objetos, conexiones, tablero y fuente de datos. Fuente del visor; se edita con el editor.

## Reglas
- Hay PCs con gráficos integrados (la de desarrollo es Intel HD 4600) y una pantalla grande: todo efecto nuevo debe respetar los niveles de calidad de `pipeline.js` y medir FPS.
- No tocar `referencias/` (fotos y Blender), `respaldos/` ni `_respaldo_v1/`, salvo que se pida.
- Existe otro stack Docker de EcoCampus (`ecocampus-nginx`, `-db`, `-modbus`, `-app`) en la misma máquina: no modificarlo ni ocupar sus puertos.
- En producción (nginx) no hay `/api/escena`: el botón Guardar del editor descarga el JSON.
- Cuando se pida "el plan", explicarlo sin crear archivos ni ejecutar comandos hasta que se apruebe.
