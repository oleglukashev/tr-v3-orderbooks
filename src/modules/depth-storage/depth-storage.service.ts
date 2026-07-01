import { Injectable } from '@nestjs/common';

type Level = [number, number]; // [price, amount(base)]

interface RawBook {
  pairId: number;
  ts: number;
  bids: Level[]; // best-first (descending price)
  asks: Level[]; // best-first (ascending price)
}

/**
 * Live raw L2 book per pairId (top-N levels). Separate from OrderbooksStorageService (which clusters
 * for footprints); this keeps the raw ladder so the client can walk it to compute the effective
 * (VWAP) price for an arbitrary entry volume.
 */
@Injectable()
export class DepthStorageService {
  private readonly store = new Map<number, RawBook>();
  // How deep we keep / expose. Enough for realistic entry sizes while bounding the WS payload.
  private readonly TOP_N = 60;

  setDepth(pairId: number, bids: Level[], asks: Level[], ts: number): void {
    this.store.set(pairId, {
      pairId,
      ts,
      bids: this.normalize(bids),
      asks: this.normalize(asks),
    });
  }

  getBook(pairId: number): RawBook | null {
    return this.store.get(pairId) ?? null;
  }

  /** Raw top-N books for every pair currently in the store, keyed by pairId. */
  getBooks(): Record<number, RawBook> {
    const out: Record<number, RawBook> = {};
    for (const [pairId, book] of this.store) {
      out[pairId] = book;
    }
    return out;
  }

  private normalize(levels: Level[]): Level[] {
    return (levels || [])
      .map((l) => [Number(l[0]), Number(l[1])] as Level)
      .filter((l) => Number.isFinite(l[0]) && Number.isFinite(l[1]) && l[1] > 0)
      .slice(0, this.TOP_N);
  }
}
