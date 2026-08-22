"""Constructores de sedes y casos para los tests del motor."""

from app.schemas import CamaSede, Caso, Coordenada, EtaSede, Sede

BOGOTA = Coordenada(lat=4.5981, lng=-74.0758)


def sede(
    codigo: str = "S1",
    *,
    nombre: str | None = None,
    servicios: list[int] | None = None,
    complejidad: str = "alta",
    naturaleza: str = "Privada",
    camas: int = 200,
    ocupadas: int = 100,
) -> Sede:
    return Sede(
        codigo=codigo,
        nombre=nombre or f"Clínica {codigo}",
        coord=BOGOTA,
        naturaleza=naturaleza,
        complejidad=complejidad,
        servicios=servicios if servicios is not None else [1102, 743, 110],
        camas=[CamaSede(tipo="CAMAS-Adultos", total=camas, ocupadas_snapshot=ocupadas)],
    )


def caso(
    *,
    servicios_requeridos: list[int] | None = None,
    complejidad_requerida: str = "alta",
    tipo_movil: str = "TAM",
    requiere_medico_a_bordo: bool = True,
) -> Caso:
    return Caso(
        id="caso-1",
        resumen="IAM con supra ST",
        triage=2,
        dx_cie10="I21.1",
        dx_descripcion="Infarto agudo de miocardio",
        servicios_requeridos=servicios_requeridos
        if servicios_requeridos is not None
        else [743, 110],
        complejidad_requerida=complejidad_requerida,
        edad=54,
        sexo="M",
        signos_alarma=["Supradesnivel del ST"],
        requiere_medico_a_bordo=requiere_medico_a_bordo,
        confianza=0.9,
        texto_crudo="x",
        origen=BOGOTA,
        tipo_movil=tipo_movil,
        creado_en="2026-08-22T20:00:00+00:00",
    )


def eta(codigo: str, minutos: float) -> EtaSede:
    return EtaSede(codigo=codigo, eta_min=minutos, dist_km=minutos / 3)
