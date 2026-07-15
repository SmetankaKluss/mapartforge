import type { LensGrid, LensTileResolution } from './companionLens';

export const LENS_TILE_RESOLUTIONS: readonly LensTileResolution[] = [128, 64, 32, 16];
export const LENS_MAX_ATLAS_SIDE = 4096;
export const LENS_MAX_ATLAS_PIXELS = 16_777_216;
export const LENS_MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

export function chooseLensTileResolution(grid: LensGrid): LensTileResolution {
  return LENS_TILE_RESOLUTIONS.find(resolution => {
    const width = grid.wide * resolution;
    const height = grid.tall * resolution;
    return width <= LENS_MAX_ATLAS_SIDE
      && height <= LENS_MAX_ATLAS_SIDE
      && width * height <= LENS_MAX_ATLAS_PIXELS;
  }) ?? 16;
}

export function nextLensTileResolution(resolution: LensTileResolution): LensTileResolution | null {
  const index = LENS_TILE_RESOLUTIONS.indexOf(resolution);
  return index >= 0 && index < LENS_TILE_RESOLUTIONS.length - 1
    ? LENS_TILE_RESOLUTIONS[index + 1]
    : null;
}

export interface LensPublishQueueOptions<T> {
  debounceMs: number;
  minIntervalMs: number;
  publish: (value: T) => Promise<void>;
  onError?: (error: unknown) => void;
  retryDelay?: (error: unknown, attempt: number) => number | null;
  now?: () => number;
}

export class LensPublishQueue<T> {
  private pending: T | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private publishing = false;
  private lastStartedAt = Number.NEGATIVE_INFINITY;
  private retryAttempt = 0;
  private retryScheduled = false;
  private generation = 0;
  private readonly now: () => number;
  private readonly options: LensPublishQueueOptions<T>;

  constructor(options: LensPublishQueueOptions<T>) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  enqueue(value: T): void {
    this.pending = value;
    if (this.retryScheduled || this.publishing) return;
    this.retryAttempt = 0;
    this.arm(this.options.debounceMs);
  }

  retryNow(): void {
    if (this.pending !== null && !this.publishing) {
      this.retryScheduled = false;
      this.arm(0);
    }
  }

  clear(): void {
    this.generation += 1;
    this.pending = null;
    this.retryAttempt = 0;
    this.retryScheduled = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, Math.max(0, delay));
  }

  private async flush(): Promise<void> {
    if (this.publishing || this.pending === null) return;
    const wait = this.options.minIntervalMs - (this.now() - this.lastStartedAt);
    if (wait > 0) {
      this.arm(wait);
      return;
    }

    const value = this.pending;
    const generation = this.generation;
    this.pending = null;
    this.retryScheduled = false;
    this.publishing = true;
    this.lastStartedAt = this.now();
    let retryDelay: number | null = null;
    try {
      await this.options.publish(value);
      if (generation === this.generation) this.retryAttempt = 0;
    } catch (error) {
      if (generation === this.generation) {
        this.options.onError?.(error);
        retryDelay = this.options.retryDelay?.(error, this.retryAttempt) ?? null;
        if (retryDelay !== null) {
          if (this.pending === null) this.pending = value;
          this.retryAttempt += 1;
          this.retryScheduled = true;
        }
      }
    } finally {
      this.publishing = false;
      if (this.pending !== null) this.arm(generation === this.generation ? (retryDelay ?? 0) : 0);
    }
  }
}
