# Despliegue del visor 3D en una MV (Docker + nginx)

Solo la parte visual: sin NATS. El visor usa el simulador de `escena.json`.

## Requisitos de la MV
- Ubuntu 22.04 o más nuevo, con acceso a internet (para descargar Docker y las imágenes `node` y `nginx`).
- Usuario con `sudo`.
- 1 GB de RAM libre y 2 GB de disco libre como mínimo.
- El puerto 80 libre y accesible desde la red.

## 1. En tu PC: crear el paquete
```bash
./empaquetar.sh            # genera visor3d.tar.gz
```

## 2. Copiarlo a la MV
```bash
scp visor3d.tar.gz USUARIO@IP_DE_LA_MV:~
```

## 3. En la MV: lanzar
```bash
tar -xzf visor3d.tar.gz
cd visor3d
./desplegar.sh             # instala Docker si falta, construye y levanta
```
Al terminar muestra la URL, por ejemplo `http://172.17.138.164`.

Si Docker se acaba de instalar, el primer `./desplegar.sh` usa `sudo`. Para no necesitarlo después, sal y vuelve a entrar por SSH.

## Uso diario
| Qué | Comando (dentro de `visor3d/`) |
|---|---|
| Ver si está corriendo | `docker compose ps` |
| Ver los logs | `docker compose logs -f` |
| Detener | `docker compose down` |
| Actualizar el código o el modelo | copiar el nuevo `visor3d.tar.gz`, descomprimir encima y correr `./desplegar.sh` |
| Cambiar solo la escena | reemplazar `public/escena.json` y recargar la página (no hace falta recompilar) |

El contenedor se reinicia solo si la MV se reinicia (`restart: unless-stopped`).

## Notas
- El rendimiento (FPS) depende de la computadora de quien abre la página, no de la MV.
- En la MV, el botón **Guardar** del editor descarga `escena.json`, porque no hay API de guardado. Para aplicar los cambios, sube ese archivo a `public/escena.json`.
