import "dotenv/config";
import { QueueEvents } from "bullmq";
import { connection } from "./queue/connection.js";
import { renderQueue, RENDER_QUEUE_NAME } from "./queue/renderQueue.js";

const TEST_SCENE = `
from manim import *

class LinearGraph(Scene):
    def construct(self):
        title = Text("Graph of y = 2x + 1", font_size=42)
        title.to_edge(UP)

        self.play(Write(title))

        axes = Axes(
            x_range=[-4, 4, 1],
            y_range=[-4, 10, 2],
            x_length=8,
            y_length=5,
            axis_config={"include_numbers": True},
        )

        labels = axes.get_axis_labels(
            x_label=MathTex("x"),
            y_label=MathTex("y"),
        )

        self.play(Create(axes), Write(labels))

        graph = axes.plot(
            lambda x: 2 * x + 1,
            x_range=[-4, 4],
            color=BLUE,
        )

        equation = MathTex("y = 2x + 1")
        equation.to_corner(UR)

        self.play(Create(graph), Write(equation))

        p1 = Dot(axes.c2p(0, 1), color=RED)
        p2 = Dot(axes.c2p(2, 5), color=RED)

        l1 = MathTex("(0,1)").scale(0.6).next_to(p1, LEFT)
        l2 = MathTex("(2,5)").scale(0.6).next_to(p2, RIGHT)

        self.play(FadeIn(p1), FadeIn(p2))
        self.play(Write(l1), Write(l2))

        slope_text = Text("Slope = 2", font_size=28)
        slope_text.to_edge(DOWN)

        self.play(Write(slope_text))

        rise = Arrow(
            axes.c2p(0, 1),
            axes.c2p(0, 3),
            buff=0,
            color=GREEN,
        )

        run = Arrow(
            axes.c2p(0, 3),
            axes.c2p(1, 3),
            buff=0,
            color=YELLOW,
        )

        rise_label = Text("Rise = 2", font_size=24, color=GREEN)
        run_label = Text("Run = 1", font_size=24, color=YELLOW)

        rise_label.next_to(rise, LEFT)
        run_label.next_to(run, UP)

        self.play(
            Create(rise),
            Create(run),
            Write(rise_label),
            Write(run_label),
        )

        self.wait(2)
`;
async function main() {
  const queueEvents = new QueueEvents(RENDER_QUEUE_NAME, { connection });
  await queueEvents.waitUntilReady();

  const job = await renderQueue.add("test-render", {
    sceneCode: TEST_SCENE,
    sceneClassName: "ContinuousVsDiscontinuous",
    quality: "low",
    renderId: "test",
  });

  console.log(`Enqueued job ${job.id}, waiting for the dispatcher to pick it up...`);
  console.log(`(make sure "npm run worker" is running in another terminal)`);

  const result = await job.waitUntilFinished(queueEvents, 120_000);
  console.log("Render complete:", result);

  await queueEvents.close();
  await renderQueue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error("Test job failed:", err);
  process.exit(1);
});
