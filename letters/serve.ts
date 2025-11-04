// Simple HTTP server for serving the letters game
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = url.pathname;

    // Default to index.html
    if (filePath === "/") {
      filePath = "/index.html";
    }

    // Remove leading slash and prepend current directory
    const file = Bun.file("." + filePath);

    // Check if file exists
    const exists = await file.exists();
    if (!exists) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(file);
  },
});

console.log(`Letters game server running at http://localhost:${server.port}`);
console.log(`Open http://localhost:${server.port} in your browser`);
