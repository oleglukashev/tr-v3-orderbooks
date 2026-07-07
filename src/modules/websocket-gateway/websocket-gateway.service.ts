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

// How often the full executable-liquidity snapshot is pushed to subscribers.
const DEPTH_SNAPSHOT_INTERVAL_MS = 2000;

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
  // Upstream pushers (tr-v3-orderbook-client) allowed to send { type: 'orderbook', data }.
  private readonly orderbookClientSubscriptions = new Set<string>();
  private depthSnapshotTimer?: ReturnType<typeof setInterval>;
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

    this.logger.log(`WebSocket server listening on ws://localhost:${port}`);
  }

  onModuleDestroy() {
    this.unsubscribeOrderbooks?.();
    if (this.depthSnapshotTimer) {
      clearInterval(this.depthSnapshotTimer);
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

  /** Broadcast the full liquidity snapshot to every subscriber. */
  private broadcastDepthSnapshot(): void {
    if (this.depthSnapshotSubscriptions.size === 0) {
      return;
    }
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
