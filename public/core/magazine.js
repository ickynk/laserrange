export class Magazine {
  constructor(settings = {}) {
    this.enabled = settings.ammoEnabled === true;
    this.capacity = settings.magazineSize ?? 15;
    this.remaining = this.capacity;
  }
  reload() {
    this.remaining = this.capacity;
    return this.state();
  }
  trigger() {
    const fired = !this.enabled || this.remaining > 0;
    if (this.enabled)
      this.remaining = fired ? this.remaining - 1 : this.capacity;
    return { fired, ...this.state() };
  }
  state() {
    return {
      enabled: this.enabled,
      remaining: this.remaining,
      capacity: this.capacity,
    };
  }
}
export function showMagazine(element, state, active) {
  element.hidden = !active || !state.enabled;
  element.textContent =
    state.remaining === 0 ? "Reload" : `${state.remaining} / ${state.capacity}`;
}
