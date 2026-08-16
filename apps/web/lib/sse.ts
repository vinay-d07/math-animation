/**
 * Minimal SSE client built on fetch + ReadableStream instead of EventSource,
 * because EventSource can't send an Authorization header and one of our two
 * streaming endpoints (AI edit) is a POST anyway.
 */
export async function consumeSSE(
  response: Response,
  handlers: Record<string, (data: any) => void>
) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const chunk of events) {
      const lines = chunk.split("\n");
      const eventLine = lines.find((l) => l.startsWith("event: "));
      const dataLine = lines.find((l) => l.startsWith("data: "));
      if (!eventLine || !dataLine) continue;

      const event = eventLine.slice("event: ".length);
      const data = JSON.parse(dataLine.slice("data: ".length));
      handlers[event]?.(data);
    }
  }
}
