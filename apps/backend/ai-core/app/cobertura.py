"""Quién va a cubrir qué zona cuando queda libre.

EL MODELO
  A  donde está la ambulancia cuando entra el caso
  B  donde está el paciente
  C  el hospital receptor
  D  la zona que debe ir a cubrir después de entregar

`scoring.py` resuelve A→B→C: a qué hospital llevar a este paciente.
Esto resuelve C→D: a dónde mandar la ambulancia cuando queda libre, para que
la ciudad no quede con un hueco.

En D no se mide permanencia — es donde espera. Lo que importa es el trayecto
C→D, porque es lo que decide si vale la pena que ESA unidad cubra ESA zona.

LO QUE NO HACE, Y ES A PROPÓSITO
  · No guarda estado. Recibe la foto (unidades + locks) y devuelve el reparto.
    Quien persiste los locks es `core`, igual que con `/v1/score`.
  · No despacha a una emergencia. Eso es función del CRUE (Res. 1220/2010).
    Esto reposiciona unidades LIBRES, y su salida es una PROPUESTA.
  · No decide el cupo por criterio clínico, sino por demanda histórica.

EL PROBLEMA DEL CHECKOUT
  Una unidad puede terminar turno, irse a almorzar, o simplemente no
  responder. Desde aquí las tres son iguales y deben tratarse igual: sin
  latido reciente, fuera del pool. No distinguir "no quiere" de "se le cayó
  la red" es lo que hace el sistema robusto — y evita convertirlo en una
  herramienta de vigilancia laboral.
"""

import math
from datetime import datetime, timedelta, timezone

from .schemas import (
    Asignacion,
    CoberturaRequest,
    CoberturaResponse,
    Lock,
    Unidad,
    Zona,
    ZonaCobertura,
)

#: Estados desde los que una unidad puede ir a cubrir. `en_puerta` cuenta
#: porque está a minutos de quedar libre y es justo el caso del punto C→D.
DISPONIBLES = {"libre", "en_puerta"}

#: Velocidad efectiva en Bogotá, puerta a puerta. La misma que usa el ETA de
#: respaldo cuando no hay Mapbox — que aquí es siempre: reposicionar no
#: justifica gastar llamadas a la Matrix API.
KMH = 22.0
#: Factor por el trazado real de calles contra la línea recta.
RODEO = 1.35


def _ahora(iso: str | None) -> datetime:
    if not iso:
        return datetime.now(timezone.utc)
    d = datetime.fromisoformat(iso)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _momento(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        d = datetime.fromisoformat(iso)
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def dist_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    """Haversine. Suficiente: el reposicionamiento no necesita ruta real."""
    r = 6371.0
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    x = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat))
        * math.sin(dlng / 2) ** 2
    )
    return r * 2 * math.asin(math.sqrt(x))


def eta_min(km: float) -> float:
    return round((km * RODEO / KMH) * 60, 1)


def disponible(u: Unidad, ahora: datetime, latido_max_min: int) -> bool:
    """¿Puede ir a cubrir?

    Dos condiciones, y la segunda es la que resuelve el checkout: sin latido
    reciente la unidad sale del pool sola, diga lo que diga su estado.
    """
    if u.estado not in DISPONIBLES:
        return False
    if u.ultimo_latido_en is None:
        # Sin telemetría, confiamos en el estado declarado. Es el modo en que
        # arranca cualquier flota antes de tener tracking.
        return True
    latido = _momento(u.ultimo_latido_en)
    if latido is None:
        return True
    return (ahora - latido) <= timedelta(minutes=latido_max_min)


def repartir_cupos(zonas: list[Zona], disponibles: int) -> dict[str, int]:
    """Cuántas unidades merece cada zona, por su peso en la demanda.

    Reparto proporcional con resto mayor: sin él, redondear cada zona por
    separado deja unidades sin asignar o asigna de más. Toda zona con demanda
    recibe al menos 1 mientras alcancen las unidades — una localidad con poca
    demanda igual tiene gente, y dejarla en cero es una decisión política que
    este código no debe tomar solo.
    """
    if disponibles <= 0 or not zonas:
        return {z.id: 0 for z in zonas}

    total = sum(z.demanda_relativa for z in zonas) or 1.0
    exactos = {z.id: (z.demanda_relativa / total) * disponibles for z in zonas}
    cupos = {zid: int(v) for zid, v in exactos.items()}

    # Piso de 1 para zonas con demanda, si alcanza.
    for z in sorted(zonas, key=lambda z: -z.demanda_relativa):
        if sum(cupos.values()) >= disponibles:
            break
        if z.demanda_relativa > 0 and cupos[z.id] == 0:
            cupos[z.id] = 1

    # El resto se reparte por parte decimal más grande.
    sobrantes = disponibles - sum(cupos.values())
    if sobrantes > 0:
        orden = sorted(zonas, key=lambda z: -(exactos[z.id] - int(exactos[z.id])))
        for z in orden[:sobrantes]:
            cupos[z.id] += 1

    return cupos


def _motivo(z: Zona, faltan: int) -> str:
    """Lo lee un regulador del CRUE, no un log. Que esté bien escrito."""
    unidades = "unidad" if faltan == 1 else "unidades"
    return (
        f"{z.nombre} concentra {z.demanda_relativa * 100:.1f}% de la demanda "
        f"y le {'faltaba' if faltan == 1 else 'faltaban'} {faltan} {unidades}."
    )


def calcular(req: CoberturaRequest) -> CoberturaResponse:
    import time

    t0 = time.perf_counter()
    ahora = _ahora(req.ahora)
    por_id = {u.id: u for u in req.unidades}
    zonas_por_id = {z.id: z for z in req.zonas}

    # ── 1. Depurar locks ────────────────────────────────────────
    # Un lock muere por dos razones: venció, o su unidad dejó de estar
    # disponible (checkout). Las dos devuelven la zona al pool.
    vigentes: list[Lock] = []
    liberadas: list[Lock] = []
    for lk in req.locks:
        exp = _momento(lk.expira_en)
        u = por_id.get(lk.unidad_id)
        vencido = exp is None or exp <= ahora
        sin_unidad = u is None or not disponible(u, ahora, req.latido_maximo_min)
        if vencido or sin_unidad or lk.zona_id not in zonas_por_id:
            liberadas.append(lk)
        else:
            vigentes.append(lk)

    # ── 2. Quién puede ir ───────────────────────────────────────
    libres = [u for u in req.unidades if disponible(u, ahora, req.latido_maximo_min)]
    comprometidas = {lk.unidad_id for lk in vigentes}
    sin_asignar = [u for u in libres if u.id not in comprometidas]

    # ── 3. Cupo por zona ────────────────────────────────────────
    cupos = repartir_cupos(req.zonas, len(libres))
    cubierta: dict[str, list[str]] = {z.id: [] for z in req.zonas}
    for lk in vigentes:
        cubierta[lk.zona_id].append(lk.unidad_id)

    # ── 4. Asignar ──────────────────────────────────────────────
    # Primero las zonas con más déficit, y a igual déficit la de más demanda:
    # dejar descubierta a Kennedy cuesta más que dejar descubierta a Sumapaz.
    expira = (ahora + timedelta(minutes=req.ttl_lock_min)).isoformat()
    asignaciones: list[Asignacion] = []

    def deficit_de(zid: str) -> int:
        return cupos.get(zid, 0) - len(cubierta[zid])

    while sin_asignar:
        pendientes = [z for z in req.zonas if deficit_de(z.id) > 0]
        if not pendientes:
            break
        pendientes.sort(key=lambda z: (-deficit_de(z.id), -z.demanda_relativa))
        z = pendientes[0]

        # La unidad más cercana al centroide. Greedy a propósito: un óptimo
        # global (asignación húngara) no se puede explicar en un pitch, y con
        # decenas de unidades la diferencia es de minutos, no de vidas.
        mejor = min(
            sin_asignar,
            key=lambda u: dist_km(
                u.posicion.lat, u.posicion.lng, z.centroide.lat, z.centroide.lng
            ),
        )
        km = dist_km(
            mejor.posicion.lat, mejor.posicion.lng, z.centroide.lat, z.centroide.lng
        )

        asignaciones.append(
            Asignacion(
                unidad_id=mejor.id,
                zona_id=z.id,
                zona_nombre=z.nombre,
                eta_min=eta_min(km),
                dist_km=round(km, 1),
                expira_en=expira,
                motivo=_motivo(z, deficit_de(z.id)),
            )
        )
        cubierta[z.id].append(mejor.id)
        sin_asignar.remove(mejor)

    # ── 5. Salida ───────────────────────────────────────────────
    # DOS medidas distintas, y confundirlas es lo que hace que un tablero
    # mienta:
    #   · `cupo` reparte las unidades QUE HAY. Suma exactamente la flota
    #     libre, así que medir déficit contra esto SIEMPRE da cero.
    #   · `requeridas` mide contra la flota que la ciudad DEBERÍA tener.
    #     Sólo existe si alguien declara ese objetivo.
    requeridas = (
        repartir_cupos(req.zonas, req.flota_objetivo)
        if req.flota_objetivo
        else cupos
    )

    salida = [
        ZonaCobertura(
            id=z.id,
            nombre=z.nombre,
            demanda_relativa=z.demanda_relativa,
            cupo=cupos.get(z.id, 0),
            requeridas=requeridas.get(z.id, 0),
            cubierta_por=cubierta[z.id],
            deficit=max(0, requeridas.get(z.id, 0) - len(cubierta[z.id])),
            descubierta=len(cubierta[z.id]) == 0,
            poligono=z.poligono,
        )
        for z in req.zonas
    ]
    salida.sort(key=lambda z: (-z.deficit, z.cubierta_por != [], -z.demanda_relativa))

    return CoberturaResponse(
        zonas=salida,
        asignaciones=asignaciones,
        descubiertas=[z.id for z in salida if z.descubierta],
        con_deficit=[z.id for z in salida if z.deficit > 0] if req.flota_objetivo else [],
        liberadas=liberadas,
        unidades_disponibles=len(libres),
        unidades_totales=len(req.unidades),
        latencia_ms=round((time.perf_counter() - t0) * 1000),
    )
