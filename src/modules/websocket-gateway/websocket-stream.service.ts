import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export type BidaskStreamPayload = {
  pairId: number;
  tf: number;
  ts: number;
  data: Record<string, any>;
  v: number;
};

@Injectable()
export class WebsocketStreamService {
  private readonly emitter = new EventEmitter();
  private readonly bidasksEvent = 'bidasks';

  onBidasks(handler: (payload: BidaskStreamPayload[]) => void): () => void {
    this.emitter.on(this.bidasksEvent, handler);
    return () => this.emitter.off(this.bidasksEvent, handler);
  }

  emitBidasks(payload: BidaskStreamPayload[]) {
    this.emitter.emit(this.bidasksEvent, payload);
  }
}
