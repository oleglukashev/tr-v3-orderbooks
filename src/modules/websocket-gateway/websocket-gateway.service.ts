import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  OrderbookStreamPayload,
  WebsocketStreamService,
} from './websocket-stream.service';
import { DepthStorageService } from '../depth-storage/depth-storage.service';

type WsOrderbookSubscription = {
  ws: WebSocket;
  tf: number;
  pairId: number;
};

type WsDepthSubscription = { ws: WebSocket };

type WsDepthPairSubscription = { ws: WebSocket; pairId: number };

// How often the full executable-liquidity snapshot is pushed to subscribers.
const DEPTH_SNAPSHOT_INTERVAL_MS = 2000;
// Coalescing window for the per-pair delta stream (subscribeDepthDeltas): changed books are
// buffered and flushed at most this often, so consumers get fresh data without a message per update.
const DEPTH_DELTA_FLUSH_MS = 250;

@Injectable()
export class WebsocketGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsocketGatewayService.name);
  private readonly orderbookSubscriptions = new Map<
    string,
    WsOrderbookSubscription
  >();
  private readonly orderbookSubscriptionsByPairId = new Map<
    string,
    WsOrderbookSubscription
  >();
  private readonly orderbookSubscriptionsByPairIdAndTf = new Map<
    string,
    WsOrderbookSubscription
  >();
  // Clients (arbitrage page) that want the whole executable-liquidity snapshot at once.
  private readonly depthSnapshotSubscriptions = new Map<
    string,
    WsDepthSubscription
  >();
  // Clients (arbitrage bot) that want per-pair deltas coalesced over a short window.
  private readonly depthDeltaSubscriptions = new Map<
    string,
    WsDepthSubscription
  >();
  // Clients (xv-range graph) that want ONE pair's raw book only, delivered in the same
  // `depthSnapshot` shape ({ [pairId]: book }) so they don't receive every pair.
  private readonly depthPairSubscriptions = new Map<
    string,
    WsDepthPairSubscription
  >();
  // pairIds whose book changed since the last delta flush.
  private readonly pendingDeltaPairIds = new Set<number>();
  // Upstream pushers (tr-v3-orderbook-client) allowed to send { type: 'orderbook', data }.
  private readonly orderbookClientSubscriptions = new Set<string>();
  private depthSnapshotTimer?: ReturnType<typeof setInterval>;
  private depthDeltaTimer?: ReturnType<typeof setInterval>;
  private wss?: WebSocketServer;
  private unsubscribeOrderbooks?: () => void;

  constructor(
    private readonly websocketStream: WebsocketStreamService,
    private readonly depthStorage: DepthStorageService,
  ) {}

  onModuleInit() {
    const port = Number(process.env.WS_PORT);
    if (!port) {
      this.logger.warn('WS_PORT is not set; WebSocket server not started.');
      return;
    }

    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.unsubscribeOrderbooks = this.websocketStream.onOrderbooks((payload) =>
      this.broadcastOrderbooks(payload),
    );

    this.depthSnapshotTimer = setInterval(
      () => this.broadcastDepthSnapshot(),
      DEPTH_SNAPSHOT_INTERVAL_MS,
    );

    this.depthDeltaTimer = setInterval(
      () => this.flushDepthDeltas(),
      DEPTH_DELTA_FLUSH_MS,
    );

    this.logger.log(`WebSocket server listening on ws://localhost:${port}`);
  }

  onModuleDestroy() {
    this.unsubscribeOrderbooks?.();
    if (this.depthSnapshotTimer) {
      clearInterval(this.depthSnapshotTimer);
    }
    if (this.depthDeltaTimer) {
      clearInterval(this.depthDeltaTimer);
    }
    this.wss?.close();
  }

  private handleConnection(ws: WebSocket) {
    const connectionId = uuidv4();
    (ws as any).id = connectionId;
    this.logger.log(`Client connected: ${connectionId}`);

    ws.on('message', (msg) => this.handleMessage(ws, msg));
    ws.on('close', () => {
      try {
        this.orderbookSubscriptions.delete(connectionId);
      } catch (e) {}
      try {
        this.orderbookSubscriptionsByPairId.delete(connectionId);
      } catch (e) {}
      try {
        this.orderbookSubscriptionsByPairIdAndTf.delete(connectionId);
      } catch (e) {}
      try {
        this.depthSnapshotSubscriptions.delete(connectionId);
      } catch (e) {}
      try {
        this.depthDeltaSubscriptions.delete(connectionId);
      } catch (e) {}
      try {
        this.depthPairSubscriptions.delete(connectionId);
      } catch (e) {}
      try {
        this.orderbookClientSubscriptions.delete(connectionId);
      } catch (e) {}
      this.logger.log(`Client disconnected: ${connectionId}`);
    });
  }

  private handleMessage(ws: WebSocket, msg: WebSocket.RawData) {
    try {
      const data = JSON.parse(msg.toString());
      if (
        data.type === 'subscribeOrderbooksByPairIdAndTf' &&
        data.pairId &&
        data.tf
      ) {
        const connectionId = (ws as any).id;
        this.orderbookSubscriptionsByPairIdAndTf.set(connectionId, {
          ws,
          tf: data.tf,
          pairId: data.pairId,
        });
        this.logger.log(
          `Client subscribed to bidask: ${data.pairId} @ ${data.tf}`,
        );
      } else if (
        data.type === 'subscribeBidasksByPairId' &&
        data.pairId &&
        data.tf
      ) {
        const connectionId = (ws as any).id;
        this.orderbookSubscriptionsByPairId.set(connectionId, {
          ws,
          tf: data.tf,
          pairId: data.pairId,
        });
        this.logger.log(
          `Client subscribed to bidask: ${data.pairId} @ ${data.tf}`,
        );
      } else if (data.type === 'subscribeBidasks') {
        const connectionId = (ws as any).id;
        this.orderbookSubscriptions.set(connectionId, {
          ws,
          tf: data.tf,
          pairId: data.pairId,
        });
        this.logger.log(
          `Client subscribed to bidask: ${data.pairId} @ ${data.tf}`,
        );
      } else if (data.type === 'subscribeAllDepth') {
        // Whole executable-liquidity snapshot at once: immediately + every interval.
        const connectionId = (ws as any).id;
        this.depthSnapshotSubscriptions.set(connectionId, { ws });
        this.sendDepthSnapshot(ws);
      } else if (data.type === 'subscribeDepthDeltas') {
        // Per-pair deltas coalesced over DEPTH_DELTA_FLUSH_MS. Send a full snapshot once as a
        // baseline, then only changed books are pushed.
        const connectionId = (ws as any).id;
        this.depthDeltaSubscriptions.set(connectionId, { ws });
        this.sendDepthSnapshot(ws);
      } else if (data.type === 'subscribeDepthByPairId' && data.pairId) {
        // One pair's raw book only. Send it immediately, then every snapshot tick.
        const connectionId = (ws as any).id;
        const pairId = Number(data.pairId);
        this.depthPairSubscriptions.set(connectionId, { ws, pairId });
        this.sendDepthForPair(ws, pairId);
        this.logger.log(`Client subscribed to depth for pair ${pairId}`);
      } else if (data.type === 'subscribeOrderbookClients') {
        // Upstream collector (tr-v3-orderbook-client) registering to push order books.
        const connectionId = (ws as any).id;
        this.orderbookClientSubscriptions.add(connectionId);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ subscription: true }));
        }
        const addr = (ws as any)?._socket?.remoteAddress;
        this.logger.log(`orderbook client subscribed: ${connectionId} from ${addr}`);
      } else if (data.type === 'orderbook' && data.data) {
        this.handleIncomingOrderbook(ws, data.data);
      }
    } catch (error) {
      this.logger.error('Failed to parse WebSocket message.', error as Error);
    }
  }

  /** Store a raw L2 book pushed by an upstream collector client. */
  private handleIncomingOrderbook(ws: WebSocket, raw: any): void {
    const connectionId = (ws as any).id as string;
    if (!this.orderbookClientSubscriptions.has(connectionId)) {
      this.logger.warn('Ignored orderbook: socket did not send subscribeOrderbookClients');
      return;
    }
    const pairId = Number(raw.pairId);
    if (!Number.isFinite(pairId)) {
      return;
    }
    const ts =
      typeof raw.ts === 'string' ? parseInt(raw.ts, 10) : Number(raw.ts);
    // Diagnostic: log the first push per connection so we can see WHO pushes WHAT precision.
    const connKey = `dbg:${connectionId}`;
    if (!this.orderbookClientSubscriptions.has(connKey)) {
      this.orderbookClientSubscriptions.add(connKey);
      const bb = (raw.bids && raw.bids[0]) || null;
      const ba = (raw.asks && raw.asks[0]) || null;
      this.logger.log(
        `[push] conn ${connectionId} pairId ${pairId} bestBid ${JSON.stringify(bb)} bestAsk ${JSON.stringify(ba)}`,
      );
    }
    this.depthStorage.setDepth(
      pairId,
      raw.bids || [],
      raw.asks || [],
      Number.isFinite(ts) ? ts : Date.now(),
    );

    // Buffer this pair for the next coalesced delta flush (only if anyone is listening).
    if (this.depthDeltaSubscriptions.size > 0) {
      this.pendingDeltaPairIds.add(pairId);
    }
  }

  // private broadcastBidask(payload: BidaskStreamPayload) {
  //   const message = JSON.stringify({
  //     type: 'bidask',
  //     data: {
  //       pairId: payload.pairId,
  //       tf: payload.tf,
  //       ts: payload.ts.toString(),
  //       data: payload.data,
  //       v: payload.v,
  //     },
  //   });
  //
  //   if (this.bidaskSubscriptions.size > 0) {
  //     for (const key of this.bidaskSubscriptions.keys()) {
  //       const wsData = this.bidaskSubscriptions[key];
  //       if (wsData.ws.readyState === WebSocket.OPEN) {
  //         wsData.ws.send(message);
  //       }
  //     }
  //   }
  //
  //   if (this.bidaskSubscriptionsByPairId.size > 0) {
  //     for (const key of this.bidaskSubscriptionsByPairId.keys()) {
  //       const wsData = this.bidaskSubscriptionsByPairId[key];
  //       if (
  //         wsData.ws.readyState === WebSocket.OPEN &&
  //         wsData.pairId === payload.pairId
  //       ) {
  //         wsData.ws.send(message);
  //       }
  //     }
  //   }
  //
  //   if (this.bidaskSubscriptionsByPairIdAndTf.size > 0) {
  //     for (const key of this.bidaskSubscriptionsByPairIdAndTf.keys()) {
  //       const wsData = this.bidaskSubscriptionsByPairIdAndTf[key];
  //       if (
  //         wsData.ws.readyState === WebSocket.OPEN &&
  //         wsData.tf === payload.tf &&
  //         wsData.pairId === payload.pairId
  //       ) {
  //         wsData.ws.send(message);
  //       }
  //     }
  //   }
  // }

  /** Send the full raw top-N order books ({ [pairId]: { bids, asks } }) to one client. */
  private sendDepthSnapshot(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(
      JSON.stringify({
        type: 'depthSnapshot',
        updatedAt: Date.now(),
        data: this.depthStorage.getBooks(),
      }),
    );
  }

  /** Send ONE pair's raw book to a client, in the full-snapshot shape ({ [pairId]: book }). */
  private sendDepthForPair(ws: WebSocket, pairId: number): void {
    if (ws.readyState !== WebSocket.OPEN || !Number.isFinite(pairId)) {
      return;
    }
    const book = this.depthStorage.getBook(pairId);
    ws.send(
      JSON.stringify({
        type: 'depthSnapshot',
        updatedAt: Date.now(),
        data: book ? { [pairId]: book } : {},
      }),
    );
  }

  /** Broadcast the full liquidity snapshot to full-snapshot subscribers, and each pair-scoped
   *  subscriber only its own pair — both on the same tick. */
  private broadcastDepthSnapshot(): void {
    if (this.depthSnapshotSubscriptions.size > 0) {
      const message = JSON.stringify({
        type: 'depthSnapshot',
        updatedAt: Date.now(),
        data: this.depthStorage.getBooks(),
      });
      for (const { ws } of this.depthSnapshotSubscriptions.values()) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
    }

    for (const { ws, pairId } of this.depthPairSubscriptions.values()) {
      this.sendDepthForPair(ws, pairId);
    }
  }

  /**
   * Flush the books that changed since the last tick to delta subscribers as one coalesced message
   * ({ [pairId]: { bids, asks } }). Nothing is sent when there are no subscribers or no changes.
   */
  private flushDepthDeltas(): void {
    if (this.depthDeltaSubscriptions.size === 0 || this.pendingDeltaPairIds.size === 0) {
      this.pendingDeltaPairIds.clear();
      return;
    }
    const data: Record<number, any> = {};
    for (const pairId of this.pendingDeltaPairIds) {
      const book = this.depthStorage.getBook(pairId);
      if (book) {
        data[pairId] = book;
      }
    }
    this.pendingDeltaPairIds.clear();
    if (Object.keys(data).length === 0) {
      return;
    }
    const message = JSON.stringify({
      type: 'depthDelta',
      updatedAt: Date.now(),
      data,
    });
    for (const { ws } of this.depthDeltaSubscriptions.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  private broadcastOrderbooks(orderbooks: OrderbookStreamPayload[]) {
    if (this.orderbookSubscriptions.size > 0) {
      const message = JSON.stringify({
        type: 'orderbooks',
        data: orderbooks,
      });
      for (const key of this.orderbookSubscriptions.keys()) {
        const wsData = this.orderbookSubscriptions.get(key);
        if (wsData.ws.readyState === WebSocket.OPEN) {
          wsData.ws.send(message);
        }
      }
    }

    if (this.orderbookSubscriptionsByPairId.size > 0) {
      for (const key of this.orderbookSubscriptionsByPairId.keys()) {
        const wsData = this.orderbookSubscriptionsByPairId.get(key);
        if (wsData.ws.readyState === WebSocket.OPEN) {
          const message = JSON.stringify({
            type: 'orderbooks',
            data: orderbooks.filter((item) => item.pairId === wsData.pairId),
          });
          wsData.ws.send(message);
        }
      }
    }

    if (this.orderbookSubscriptionsByPairIdAndTf.size > 0) {
      for (const key of this.orderbookSubscriptionsByPairIdAndTf.keys()) {
        const wsData = this.orderbookSubscriptionsByPairIdAndTf.get(key);
        if (wsData.ws.readyState === WebSocket.OPEN) {
          const message = JSON.stringify({
            type: 'orderbooks',
            data: orderbooks.filter(
              (item) => item.pairId === wsData.pairId && wsData.tf === item.tf,
            ),
          });
          wsData.ws.send(message);
        }
      }
    }
  }
}
