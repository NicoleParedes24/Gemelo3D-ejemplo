#!/usr/bin/env bash
# Lanza el visor 3D de EcoCampus en esta máquina con Docker (nginx).
# Uso:  ./desplegar.sh            (puerto 80)
#       PUERTO=8088 ./desplegar.sh
set -euo pipefail
cd "$(dirname "$0")"
PUERTO="${PUERTO:-80}"

# 1. Docker (se instala solo si falta)
if ! command -v docker >/dev/null 2>&1; then
  echo ">> Instalando Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# 2. Firewall (solo si ufw está activo)
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow "${PUERTO}/tcp"
fi

# 3. Construir y levantar
echo ">> Construyendo y levantando el contenedor (puerto ${PUERTO})..."
PUERTO="$PUERTO" $DOCKER compose up -d --build

# 4. Comprobar
sleep 2
if curl -fsS "http://localhost:${PUERTO}/" >/dev/null; then
  IP=$(hostname -I | awk '{print $1}')
  echo ""
  echo "Listo. Abre en el navegador:  http://${IP}$([ "$PUERTO" = 80 ] || echo ":$PUERTO")"
else
  echo "El contenedor no responde. Revisa:  $DOCKER compose logs"
  exit 1
fi
