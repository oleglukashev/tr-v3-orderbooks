import { Global, Module } from '@nestjs/common';
import { WebsocketGatewayService } from './websocket-gateway.service';
import { WebsocketStreamService } from './websocket-stream.service';

@Global()
@Module({
  providers: [WebsocketGatewayService, WebsocketStreamService],
  exports: [WebsocketStreamService],
})
export class WebsocketGatewayModule {}
