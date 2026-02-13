import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  BidaskStreamPayload,
  WebsocketStreamService,
} from './websocket-stream.service';

type WsBidaskSubscription = {
  ws: WebSocket;
  tf: number;
  pairId: number;
};

@Injectable()
export class WebsocketGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsocketGatewayService.name);
  private readonly bidaskSubscriptions = new Map<
    string,
    WsBidaskSubscription
  >();
  private readonly bidaskSubscriptionsByPairId = new Map<
    string,
    WsBidaskSubscription
  >();
  private readonly bidaskSubscriptionsByPairIdAndTf = new Map<
    string,
    WsBidaskSubscription
  >();
  private wss?: WebSocketServer;
  private unsubscribeBidasks?: () => void;

  constructor(private readonly websocketStream: WebsocketStreamService) {}

  onModuleInit() {
    const port = Number(process.env.WS_PORT);
    if (!port) {
      this.logger.warn('WS_PORT is not set; WebSocket server not started.');
      return;
    }

    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.unsubscribeBidasks = this.websocketStream.onBidasks((payload) =>
      this.broadcastBidasks(payload),
    );

    this.logger.log(`WebSocket server listening on ws://localhost:${port}`);
  }

  onModuleDestroy() {
    this.unsubscribeBidasks?.();
    this.wss?.close();
  }

  private handleConnection(ws: WebSocket) {
    const connectionId = uuidv4();
    (ws as any).id = connectionId;
    this.logger.log(`Client connected: ${connectionId}`);

    ws.on('message', (msg) => this.handleMessage(ws, msg));
    ws.on('close', () => {
      try {
        this.bidaskSubscriptions.delete(connectionId);
      } catch (e) {}
      try {
        this.bidaskSubscriptionsByPairId.delete(connectionId);
      } catch (e) {}
      try {
        this.bidaskSubscriptionsByPairIdAndTf.delete(connectionId);
      } catch (e) {}
      this.logger.log(`Client disconnected: ${connectionId}`);
    });
  }

  private handleMessage(ws: WebSocket, msg: WebSocket.RawData) {
    try {
      const data = JSON.parse(msg.toString());
      if (
        data.type === 'subscribeBidasksByPairIdAndTf' &&
        data.pairId &&
        data.tf
      ) {
        const connectionId = (ws as any).id;
        this.bidaskSubscriptionsByPairIdAndTf.set(connectionId, {
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
        this.bidaskSubscriptionsByPairId.set(connectionId, {
          ws,
          tf: data.tf,
          pairId: data.pairId,
        });
        this.logger.log(
          `Client subscribed to bidask: ${data.pairId} @ ${data.tf}`,
        );
      } else if (data.type === 'subscribeBidasks') {
        const connectionId = (ws as any).id;
        this.bidaskSubscriptions.set(connectionId, {
          ws,
          tf: data.tf,
          pairId: data.pairId,
        });
        this.logger.log(
          `Client subscribed to bidask: ${data.pairId} @ ${data.tf}`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to parse WebSocket message.', error as Error);
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

  private broadcastBidasks(bidasks: BidaskStreamPayload[]) {
    if (this.bidaskSubscriptions.size > 0) {
      const message = JSON.stringify({
        type: 'bidasks',
        data: bidasks,
      });
      for (const key of this.bidaskSubscriptions.keys()) {
        const wsData = this.bidaskSubscriptions.get(key);
        if (wsData.ws.readyState === WebSocket.OPEN) {
          wsData.ws.send(message);
        }
      }
    }

    if (this.bidaskSubscriptionsByPairId.size > 0) {
      for (const key of this.bidaskSubscriptionsByPairId.keys()) {
        const wsData = this.bidaskSubscriptionsByPairId.get(key);
        if (wsData.ws.readyState === WebSocket.OPEN) {
          const message = JSON.stringify({
            type: 'bidasks',
            data: bidasks.filter((item) => item.pairId === wsData.pairId),
          });
          wsData.ws.send(message);
        }
      }
    }

    if (this.bidaskSubscriptionsByPairIdAndTf.size > 0) {
      for (const key of this.bidaskSubscriptionsByPairIdAndTf.keys()) {
        const wsData = this.bidaskSubscriptionsByPairIdAndTf.get(key);
        if (wsData.ws.readyState === WebSocket.OPEN) {
          const message = JSON.stringify({
            type: 'bidasks',
            data: bidasks.filter(
              (item) => item.pairId === wsData.pairId && wsData.tf === item.tf,
            ),
          });
          wsData.ws.send(message);
        }
      }
    }
  }
}
