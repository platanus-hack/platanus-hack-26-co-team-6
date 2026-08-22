import { Global, Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { RoutingService } from './routing.service';

@Global()
@Module({
  imports: [PersistenceModule],
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
