export interface RenderJobData {
  sceneCode: string;
  sceneClassName: string;
  quality: "low" | "high";
  /** Set when this job renders a single-scene Project (legacy editor flow). */
  renderId?: string;
  /** Set when this job renders one Scene of a multi-scene VideoProject storyboard. */
  sceneId?: string;
  /**
   * Base64-encoded WAV narration audio (BullMQ job data is JSON, so raw
   * Buffers don't round-trip) — only set for VideoProject scene jobs. When
   * present, the rendered clip gets muxed with this audio inside the same
   * sandbox before upload; the legacy editor flow never sets this and gets
   * a silent clip exactly as before.
   */
  narrationAudioBase64?: string;
}

export interface RenderJobResult {
  outputUrl: string;
  renderDurationMs: number;
  totalDurationMs: number;
}
