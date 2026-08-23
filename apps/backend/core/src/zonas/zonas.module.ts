import { Module } from '@nestjs/common';
import { ZonasController } from './zonas.controller';

@Module({ controllers: [ZonasController] })
export class ZonasModule {}
