export function nothingMatches(req, res) {
  console.log("no routes matched");
  if (!res.writableEnded) {
    if (typeof res.status === "function") {
      res.status(404).send("Not Found");
    } else {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not Found");
    }
  }
}
