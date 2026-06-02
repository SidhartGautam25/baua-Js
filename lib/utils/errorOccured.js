export function errorOccured(err, req, res, next) {
  console.log("some error occured my friend");
  console.log("error is ", err);
  if (!res.writableEnded) {
    if (typeof res.status === "function") {
      res.status(500).send("Internal Server Error");
    } else {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Internal Server Error");
    }
  }
}
