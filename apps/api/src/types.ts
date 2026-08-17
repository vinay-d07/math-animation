export interface RenderJobData {
  sceneCode: string;
  sceneClassName: string;
  quality: "low" | "high";
  /** Set when this job renders a single-scene Project (legacy editor flow). */
  renderId?: string;
  /** Set when this job renders one Scene of a multi-scene VideoProject storyboard. */
  sceneId?: string;
}

export interface RenderJobResult {
  outputUrl: string;
  renderDurationMs: number;
  totalDurationMs: number;
}
