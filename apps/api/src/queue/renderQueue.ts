import { Queue } from "bullmq";
import { connection } from "./connection.js";
import type { RenderJobData } from "../types.js";

export const RENDER_QUEUE_NAME = "render";

export const renderQueue = new Queue<RenderJobData>(RENDER_QUEUE_NAME, { connection });
