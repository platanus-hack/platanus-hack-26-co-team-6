import { Module } from '@nestjs/common';
import { CatalogoController } from './catalogo.controller';

@Module({ controllers: [CatalogoController] })
export class CatalogoModule {}
