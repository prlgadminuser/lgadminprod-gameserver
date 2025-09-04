// src/handlers/httpHandler.js
function setupHttpServer(req, res) {
  try {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "interest-cohort=()");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("qs\n");
  } catch (error) {
    console.error("Error handling request:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error\n");
  }
}

module.exports = { setupHttpServer };