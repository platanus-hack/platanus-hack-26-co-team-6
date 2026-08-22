import { Module } from '@nestjs/common';
import { HandshakeModule } from '../handshake/handshake.module';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [HandshakeModule],
  controllers: [TelegramController],
})
export class TelegramModule {}
