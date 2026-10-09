/** Minimal event emitter. */
export class Emitter {
  constructor() {
    this.listeners = new Map();
  }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const list = this.listeners.get(event);
    if (list) this.listeners.set(event, list.filter((f) => f !== fn));
  }
  emit(event, ...args) {
    for (const fn of [...(this.listeners.get(event) ?? [])]) fn(...args);
  }
}
