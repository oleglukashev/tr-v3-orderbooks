import { Injectable } from '@nestjs/common';

// Slippage bands (percent from best price) used to summarise executable liquidity.
export const SLIPPAGE_BANDS = [0.1, 0.25, 0.5, 1] as const;

type Level = [number, number]; // [price, amount(base)]

interface RawBook {
  bids: Level[];
  asks: Level[];
  ts: number;
}

export interface DepthBand {
  base: number; // cumulative base volume executable within the band
  notional: number; // cumulative quote (USDT) executable within the band
}

export interface DepthProfile {
  pairId: number;
  ts: number;
  bestBid: number;
  bestAsk: number;
  mid: number;
  spreadPct: number;
  // Buying walks the asks; selling walks the bids. Keyed by band, e.g. "0.25".
  ask: Record<string, DepthBand>;
  bid: Record<string, DepthBand>;
}

/**
 * Live raw L2 book per pairId (top-N levels) + compact executable-liquidity profiles.
 * Separate from OrderbooksStorageService (which clusters for footprints); this keeps the raw
 * ladder needed to size an arbitrage entry without slippage.
 */
@Injectable()
export class DepthStorageService {
  private readonly store = new Map<number, RawBook>();
  private readonly TOP_N = 200;

  setDepth(pairId: number, bids: Level[], asks: Level[], ts: number): void {
    this.store.set(pairId, {
      bids: this.normalize(bids),
      asks: this.normalize(asks),
      ts,
    });
  }

  getRaw(pairId: number): RawBook | null {
    return this.store.get(pairId) ?? null;
  }

  /** Compact liquidity profiles for every pair currently in the store, keyed by pairId. */
  getProfiles(): Record<number, DepthProfile> {
    const out: Record<number, DepthProfile> = {};
    for (const [pairId, book] of this.store) {
      const profile = this.buildProfile(pairId, book);
      if (profile) {
        out[pairId] = profile;
      }
    }
    return out;
  }

  private normalize(levels: Level[]): Level[] {
    return (levels || [])
      .map((l) => [Number(l[0]), Number(l[1])] as Level)
      .filter((l) => Number.isFinite(l[0]) && Number.isFinite(l[1]) && l[1] > 0)
      .slice(0, this.TOP_N);
  }

  private buildProfile(pairId: number, book: RawBook): DepthProfile | null {
    const bestBid = book.bids[0]?.[0];
    const bestAsk = book.asks[0]?.[0];
    if (!bestBid || !bestAsk) {
      return null;
    }
    const mid = (bestBid + bestAsk) / 2;
    return {
      pairId,
      ts: book.ts,
      bestBid,
      bestAsk,
      mid,
      spreadPct: ((bestAsk - bestBid) / mid) * 100,
      ask: this.cumBands(book.asks, bestAsk, 'ask'),
      bid: this.cumBands(book.bids, bestBid, 'bid'),
    };
  }

  // Cumulative base/notional available within each slippage band, walking away from best price.
  private cumBands(
    levels: Level[],
    best: number,
    side: 'ask' | 'bid',
  ): Record<string, DepthBand> {
    const out: Record<string, DepthBand> = {};
    for (const band of SLIPPAGE_BANDS) {
      out[String(band)] = { base: 0, notional: 0 };
    }
    for (const [price, amount] of levels) {
      const slipPct =
        side === 'ask' ? (price / best - 1) * 100 : (1 - price / best) * 100;
      if (slipPct < 0) {
        continue;
      }
      for (const band of SLIPPAGE_BANDS) {
        if (slipPct <= band) {
          out[String(band)].base += amount;
          out[String(band)].notional += amount * price;
        }
      }
    }
    return out;
  }
}
