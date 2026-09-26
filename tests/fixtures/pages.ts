import { createServer, type Server } from "node:http";

const longTitle = "A very long reference title about typographic rhythm, motion, and careful spacing ".repeat(12);

export async function startFixtureServer(): Promise<{ base: string; previewStats: () => { requests: number; peak: number }; close: () => Promise<void> }> {
  let activePreviews = 0;
  let peak = 0;
  let requests = 0;
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url || "/", "http://localhost").pathname;
    if (path === "/slow-preview.png") {
      requests++;
      activePreviews++;
      peak = Math.max(peak, activePreviews);
      setTimeout(() => {
        response.writeHead(200, { "content-type": "image/png" });
        response.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAIf0AAAAASUVORK5CYII=", "base64"));
        activePreviews--;
      }, 120);
      return;
    }
    if (path === "/preview.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAIf0AAAAASUVORK5CYII=", "base64"));
      return;
    }
    if (path === "/broken.ico" || path === "/missing.png") {
      response.writeHead(404);
      response.end();
      return;
    }
    const title = path === "/long-title" ? longTitle : path === "/no-preview" ? "A page with no preview" : path === "/broken-preview" ? "A page with a broken preview" : path === "/huge" ? "An enormously tall page" : path === "/blocked-frame" ? "Framing is blocked" : path.startsWith("/slow/") ? `Delayed image reference ${path.split("/").at(-1)}` : "Visual reference";
    const preview = path === "/no-preview" ? "" : `<meta property="og:image" content="${path.startsWith("/slow/") ? "/slow-preview.png" : path === "/broken-preview" ? "/missing.png" : "/preview.png"}"><meta name="description" content="A carefully composed visual reference">`;
    const favicon = path === "/broken-favicon" ? '<link rel="icon" href="/broken.ico">' : "";
    const body = path === "/huge" ? "<p>Long form reference content</p>".repeat(3000) : "<p>A small fragment worth remembering and searching for.</p>";
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      ...(path === "/blocked-frame" ? { "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'" } : {})
    });
    response.end(`<!doctype html><html><head><title>${title}</title>${preview}${favicon}</head><body><h1>${title}</h1>${body}</body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind.");
  return {
    base: `http://127.0.0.1:${address.port}`,
    previewStats: () => ({ requests, peak }),
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}
