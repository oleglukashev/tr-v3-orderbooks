import { Injectable } from '@nestjs/common';
import { Base } from './base.service';
import { OrderbooksPrismaService } from '../orderbooksPrisma/orderbooksPrisma.service';
import { OrderbooksStorageService } from '../orderbooks-storage/orderbooks-storage.service';

@Injectable()
export class OrderbooksEntityService extends Base {
  constructor(
    orderbooksPrismaService: OrderbooksPrismaService,
    private readonly orderbooksStorageService: OrderbooksStorageService,
  ) {
    super(orderbooksPrismaService, 'orderbook');
  }

  public override async preBaseCreate(data) {
    return data;
  }

  public override async preBaseUpdate(data) {
    return data;
  }

  async moveOrderbooksFromStorageToBdByTf(tf: number) {
    const storageOrderbooks = this.orderbooksStorageService.finished(tf);

    console.log(
      `${tf} orderbooksStorageService size`,
      storageOrderbooks.length,
    );

    for (const orderbook of storageOrderbooks) {
      await this.createOrUpdateOrderbook(orderbook);
      this.orderbooksStorageService.deleteByOrderbook(orderbook);
    }
  }

  async createOrUpdateOrderbook(orderbook: any) {
    try {
      await this.baseCreate(orderbook);
    } catch (e: any) {
      console.log('e', e);
      if (e.code === 'P2002') {
        const existOrderbook = await this.findFirst({
          where: {
            ts: orderbook.ts,
            pairId: orderbook.pairId,
            tf: orderbook.tf,
          },
        });
        if (existOrderbook) {
          await this.baseUpdate(existOrderbook.id, {
            data: orderbook.data,
            v: existOrderbook.v,
          });
        }
      }
    }
  }
}
