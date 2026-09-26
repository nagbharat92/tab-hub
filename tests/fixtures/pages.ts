import { createServer, type Server } from "node:http";

const longTitle = "A very long reference title about typographic rhythm, motion, and careful spacing ".repeat(12);

export async function startFixtureServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url || "/", "http://localhost").pathname;
    if (path === "/preview.svg") {
      response.writeHead(200, { "content-type": "image/svg+xml" });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="800" height="500" fill="#b11f4b"/><circle cx="400" cy="250" r="120" fill="#f7f4ef"/></svg>');
      return;
    }
    if (path === "/broken.ico") {
      response.writeHead(404);
      response.end();
      return;
    }
    const title = path === "/long-title" ? longTitle : path === "/no-preview" ? "A page with no preview" : path === "/huge" ? "An enormously tall page" : path === "/blocked-frame" ? "Framing is blocked" : "Visual reference";
    const preview = path === "/no-preview" ? "" : '<meta property="og:image" content="/preview.svg"><meta name="description" content="A carefully composed visual reference">';
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
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}
