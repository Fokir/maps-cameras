// web/src/modules/stream/lib/ringBuffer.ts

export interface RingBufferItem {
  blob: Blob;
  timestamp: number; // ms since epoch
}

/**
 * Time-based ring buffer for MediaRecorder chunks.
 * Drops items older than `retentionMs` on every push.
 */
export class RingBuffer {
  private items: RingBufferItem[] = [];

  constructor(private readonly retentionMs: number) {}

  push(item: RingBufferItem): void {
    this.items.push(item);
    this.evictOldLocked();
  }

  /**
   * Returns a copy of the current items. Safe to pass into
   * `new Blob([...items.map(i => i.blob), ...])`.
   */
  snapshot(): RingBufferItem[] {
    this.evictOldLocked();
    return this.items.slice();
  }

  clear(): void {
    this.items = [];
  }

  totalSize(): number {
    return this.items.reduce((sum, i) => sum + i.blob.size, 0);
  }

  private evictOldLocked(): void {
    const cutoff = Date.now() - this.retentionMs;
    while (this.items.length > 0 && this.items[0].timestamp < cutoff) {
      this.items.shift();
    }
  }
}
