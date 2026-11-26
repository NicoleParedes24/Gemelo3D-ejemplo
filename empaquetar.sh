#!/usr/bin/env bash
# Crea visor3d.tar.gz con solo lo necesario para desplegar en la MV.
set -euo pipefail
cd "$(dirname "$0")"
tar -czf visor3d.tar.gz --transform 's,^,visor3d/,' \
  Dockerfile docker-compose.yml nginx.conf .dockerignore desplegar.sh DESPLIEGUE.md \
  package.json package-lock.json index.html vite.config.js src public
echo "Creado: $(pwd)/visor3d.tar.gz ($(du -h visor3d.tar.gz | cut -f1))"
