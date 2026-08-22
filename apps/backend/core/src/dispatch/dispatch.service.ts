/**
 * Crea el handshake y dispara la notificación al jefe de urgencias.
 * CARRIL DE SEBAS.
 *
 * El reloj de latencia arranca aquí: es el número del pitch.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  DispatchRequest,
  DispatchResponse,
  Handshake,
} from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';
import { SedesService } from '../sedes/sedes.service';
import { EtaService } from '../eta/eta.service';
import { CanalesService } from '../canales/canales.service';
import { handshakeTimeoutS } from '../common/plazos';

@Injectable()
export class DispatchService {
  private readonly log = new Logger(DispatchService.name);

  constructor(
    private readonly almacen: AlmacenService,
    private readonly sedes: SedesService,
    private readonly eta: EtaService,
    private readonly canales: CanalesService,
    private readonly config: ConfigService,
  ) {}

  async despachar(cuerpo: DispatchRequest): Promise<DispatchResponse> {
    const caso = this.almacen.obtenerCaso(cuerpo.casoId);
    if (!caso) throw new NotFoundException('Caso no encontrado');

    const sede = await this.sedes.porCodigo(cuerpo.sedeCodigo);
    if (!sede) throw new NotFoundException('Sede no encontrada');

    // El plazo se sella AQUI y viaja al cliente. Es el mismo instante que
    // usara el barrido de expiracion, asi que el cronometro de /campo y el
    // reloj de core no pueden desincronizarse.
    const enviadoEn = new Date();
    const expiraEn = new Date(
      enviadoEn.getTime() + handshakeTimeoutS(this.config) * 1000,
    );

    const handshake: Handshake = {
      id: randomUUID(),
      casoId: caso.id,
      sedeCodigo: sede.codigo,
      canal: cuerpo.canal ?? 'telegram',
      estado: 'enviado',
      motivoRechazo: null,
      enviadoEn: enviadoEn.toISOString(),
      expiraEn: expiraEn.toISOString(),
      respondidoEn: null,
      latenciaS: null,
    };

    const [eta] = await this.eta.matriz(caso.origen, [
      { codigo: sede.codigo, coord: sede.coord },
    ]);

    // El ETA se calculaba, se mostraba, y se botaba. Guardarlo es lo que
    // permite despues saber si el traslado se esta demorando: sin linea
    // base no hay demora que detectar.
    handshake.etaMinAlDespachar = eta?.etaMin ?? null;
    this.almacen.guardarHandshake(handshake);
    const envio = await this.canales.notificar(
      handshake,
      caso,
      sede,
      eta?.etaMin,
    );
    this.log.log(
      `handshake ${handshake.id} → ${envio.canal} ${envio.detalle ?? ''}`,
    );

    return { handshake };
  }
}
