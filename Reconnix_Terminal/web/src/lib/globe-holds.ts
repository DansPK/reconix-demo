/**
 * Why the globe isn't drawing: any number of named reasons at once (off screen, a hidden tab,
 * faded out behind the AI Assistant, a low-power device behind it…). It draws only while none
 * holds. Pure (no DOM, no three), so it is unit-tested.
 */
export class Holds {
  private readonly reasons = new Set<string>();

  /** Hold (`on`) or release `reason`; true when that changed anything. */
  set(reason: string, on: boolean): boolean {
    const had = this.reasons.has(reason);
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
    return had !== on;
  }

  /** Something holds it. */
  get held(): boolean {
    return this.reasons.size > 0;
  }

  has(reason: string): boolean {
    return this.reasons.has(reason);
  }

  /** The reasons, oldest first. */
  list(): string[] {
    return [...this.reasons];
  }

  clear(): void {
    this.reasons.clear();
  }
}
