/** A readiness barrier plus one authoritative timeline. No media bytes or sockets live here. */
export class CutsceneCoordinator {
  private waiting = new Set<string>();
  private ready = new Set<string>();
  private id: string | null = null;
  private start: (() => void) | null = null;

  prepare(id: string, participants: string[], onReady: () => void) {
    this.id = id;
    this.waiting = new Set(participants);
    this.ready.clear();
    this.start = onReady;
    this.flush();
  }

  acknowledge(id: string, participant: string) {
    if (id !== this.id || !this.waiting.has(participant)) return false;
    this.ready.add(participant);
    this.flush();
    return true;
  }

  updateParticipants(participants: string[]) {
    if (!this.start) return;
    this.waiting = new Set(participants);
    this.flush();
  }

  cancel() { this.id = null; this.start = null; this.waiting.clear(); this.ready.clear(); }

  private flush() {
    if (!this.start || [...this.waiting].some((id) => !this.ready.has(id))) return;
    const start = this.start;
    this.start = null;
    start();
  }
}
