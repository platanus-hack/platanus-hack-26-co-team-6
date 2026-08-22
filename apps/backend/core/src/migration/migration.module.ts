import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatosService } from './datos.service';
import { EsquemaService } from './esquema.service';
import { PostgresService } from './postgres.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [PostgresService, EsquemaService, DatosService],
})
export class MigrationModule {}
