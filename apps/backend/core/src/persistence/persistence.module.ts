import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryRoutingStore } from './memory-routing.store';
import { Pool } from 'pg';
import { PostgresRoutingStore } from './postgres-routing.store';
import { ROUTING_STORE } from './routing-store';

@Module({
  providers: [MemoryRoutingStore, { provide: ROUTING_STORE, inject: [ConfigService, MemoryRoutingStore], useFactory: (config: ConfigService, memory: MemoryRoutingStore) => {
    if (config.get<string>('ROUTING_STORE') === 'memory') return memory;
    const url = config.get<string>('PULSO_ROUTING_DATABASE_URL');
    if (!url) throw new Error('PULSO_ROUTING_DATABASE_URL is required unless ROUTING_STORE=memory.');
    return new PostgresRoutingStore(new Pool({ connectionString: url }));
  } }],
  exports: [ROUTING_STORE],
})
export class PersistenceModule {}
