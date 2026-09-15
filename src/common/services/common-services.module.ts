import { Global, Module } from '@nestjs/common';
import { ActorService } from './actor.service';

/** Shared, dependency-free services used across modules (no feature imports). */
@Global()
@Module({
  providers: [ActorService],
  exports: [ActorService],
})
export class CommonServicesModule {}
