import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export type OrderbookStreamPayload = {
  pairId: number;
  tf: number;
  ts: number;
  data: Record<string, any>;
  v: number;
};

@Injectable()
export class WebsocketStreamService {
  private readonly emitter = new EventEmitter();
  private readonly orderbooksEvent = 'orderbooks';

  onOrderbooks(
    handler: (payload: OrderbookStreamPayload[]) => void,
  ): () => void {
    this.emitter.on(this.orderbooksEvent, handler);
    return () => this.emitter.off(this.orderbooksEvent, handler);
  }

  emitOrderbooks(payload: OrderbookStreamPayload[]) {
    this.emitter.emit(this.orderbooksEvent, payload);
  }
}
