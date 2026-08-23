#!/usr/bin/env bash
#
# Verifica PULSO en Render, de lo más barato a lo que molesta a alguien.
#
#   BASE=https://pulso-voz.onrender.com \
#   SECRETO=... UNIDAD=AMB-014 \
#   bash scripts/demo/probar-produccion.sh
#
# Los pasos 1-4 NO le escriben a nadie: son de solo lectura y se pueden correr
# las veces que haga falta. El paso 5 manda un WhatsApp de verdad y pone una
# ambulancia en movimiento — pide confirmación.
set -uo pipefail

BASE="${BASE:?falta BASE, ej https://pulso-voz.onrender.com}"
CORE="${CORE:-}"
SECRETO="${SECRETO:-}"
UNIDAD="${UNIDAD:-AMB-014}"
LAT="${LAT:-4.628}"; LNG="${LNG:--74.155}"

ok() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
mal() { printf "  \033[31m✗\033[0m %s\n" "$1"; }
sec() { printf "\n\033[1m%s\033[0m\n" "$1"; }

pedir() { curl -sS -m 25 -w '\n%{http_code}' ${SECRETO:+-H "X-Secreto: $SECRETO"} "$@" 2>/dev/null; }
# Aceptan el texto por argumento o por tubería: llamarlas de las dos formas
# es natural y con `set -u` la que falte revienta con «unbound variable».
codigo() { if [ $# -gt 0 ]; then tail -1 <<<"$1"; else tail -1; fi; }
cuerpo() { if [ $# -gt 0 ]; then sed '$d' <<<"$1"; else sed '$d'; fi; }

sec "1 · ¿está vivo?"
# ⚠️ En el plan free de Render el servicio duerme a los ~15 min y despertarlo
#    tarda decenas de segundos. Si este paso demora, no está roto: está
#    despertando. El SEGUNDO intento es el que dice la verdad.
r=$(pedir "$BASE/health")
[ "$(codigo "$r")" = 200 ] && ok "/health" || { mal "/health → $(codigo "$r")"; exit 1; }

sec "2 · ¿qué credenciales llegaron al contenedor?"
r=$(pedir "$BASE/listo"); cuerpo "$r" | python3 -m json.tool 2>/dev/null | sed 's/^/  /'

sec "3 · la costura hacia adentro"
if [ -n "$CORE" ]; then
  r=$(pedir "$CORE/health/ai-core")
  [ "$(codigo "$r")" = 200 ] && ok "core → ai-core" || mal "core → ai-core → $(codigo "$r")"
  # Si esto devuelve 0 zonas, `data/` no viajó en la imagen. El síntoma es
  # mudo: no hay error, sólo un mapa vacío.
  n=$(pedir "$CORE/zonas" | cuerpo | python3 -c 'import sys,json;print(json.load(sys.stdin).get("total",0))' 2>/dev/null || echo 0)
  [ "$n" -gt 1000 ] && ok "$n zonas H3" || mal "$n zonas — ¿viajó data/ en la imagen?"
else
  echo "  (sin CORE=… se salta)"
fi

sec "4 · ¿hay alguna ambulancia con turno abierto?"
r=$(pedir "$BASE/despacho/turnos")
if [ "$(codigo "$r")" != 200 ]; then
  mal "/despacho/turnos → $(codigo "$r") · ¿SECRETO correcto?"
else
  n=$(cuerpo "$r" | python3 -c 'import sys,json;print(json.load(sys.stdin)["total"])' 2>/dev/null || echo 0)
  if [ "$n" -gt 0 ]; then
    ok "$n turno(s) — hay ventana de 24 h abierta"
    cuerpo "$r" | python3 -c '
import sys, json
for t in json.load(sys.stdin)["turnos"]:
    print(f"    {t[\"unidadId\"]:10s} {t[\"estado\"]:14s} punto {t[\"punto\"]}")' 2>/dev/null
  else
    mal "ningún turno abierto"
    cat <<'AVISO'

    Sin turno abierto NO se puede despachar, y no es un bug: WhatsApp exige
    una plantilla aprobada por Meta para escribirle primero a alguien que no
    te ha escrito en 24 h.

    Que el paramédico mande «soy la AMB-014» al número del sandbox. Eso abre
    la ventana y de ahí en adelante PULSO le escribe libre por 24 horas.
AVISO
    exit 0
  fi
fi

sec "5 · despachar de verdad"
echo "  Esto le manda un WhatsApp a $UNIDAD y la pone en movimiento."
read -r -p "  ¿Seguir? [s/N] " c
[ "$c" = "s" ] || { echo "  cancelado"; exit 0; }

r=$(pedir -X POST "$BASE/despacho" -H 'Content-Type: application/json' \
  -d "{\"unidadId\":\"$UNIDAD\",\"lat\":$LAT,\"lng\":$LNG,\"descripcion\":\"PRUEBA — masculino 54, dolor precordial de 40 minutos, supradesnivel del ST\"}")
if [ "$(codigo "$r")" = 200 ]; then
  ok "despachada"; cuerpo "$r" | python3 -m json.tool 2>/dev/null | sed 's/^/    /'
  cat <<'SIGUE'

    En el celular deberían llegar tres cosas: el mensaje con la dirección,
    la tarjeta de ubicación, y el botón «Voy en camino».

    Tocando los botones en orden se recorre el turno completo:
      Voy en camino → Ya llegué → Paciente a bordo
      → (dictas el reporte y el motor elige hospital)
      → Entregué al paciente → Ya salí → Llegué a la zona

    `GET /despacho/turnos` muestra en qué punto va, sin molestar a nadie.
SIGUE
else
  mal "despacho → $(codigo "$r")"; cuerpo "$r" | sed 's/^/    /'
fi
