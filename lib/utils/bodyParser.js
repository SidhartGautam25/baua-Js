import { parse as parseQuery } from "querystring";

function getBodyBuffer(req, limit = 1048576) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;

    const contentLength = parseInt(req.headers["content-length"], 10);
    if (!isNaN(contentLength) && contentLength > limit) {
      const err = new Error("Payload Too Large");
      err.status = 413;
      return reject(err);
    }

    const onData = (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > limit) {
        req.off("data", onData);
        req.off("end", onEnd);
        req.off("error", onError);
        const err = new Error("Payload Too Large");
        err.status = 413;
        reject(err);
      } else {
        chunks.push(chunk);
      }
    };

    const onEnd = () => {
      resolve(Buffer.concat(chunks));
    };

    const onError = (err) => {
      reject(err);
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

export function json(opts = {}) {
  const limit = opts.limit || 1048576; // 1MB default
  return async function jsonParser(req, res, next) {
    const contentType = req.headers["content-type"] || "";
    const mediaType = contentType.split(";")[0].trim().toLowerCase();
    
    if (mediaType !== "application/json") {
      return next();
    }

    try {
      const buffer = await getBodyBuffer(req, limit);
      const str = buffer.toString("utf8");
      
      if (str) {
        req.body = JSON.parse(str);
      } else {
        req.body = {};
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function urlencoded(opts = {}) {
  const limit = opts.limit || 1048576; // 1MB default
  return async function urlencodedParser(req, res, next) {
    const contentType = req.headers["content-type"] || "";
    const mediaType = contentType.split(";")[0].trim().toLowerCase();
    
    if (mediaType !== "application/x-www-form-urlencoded") {
      return next();
    }

    try {
      const buffer = await getBodyBuffer(req, limit);
      const str = buffer.toString("utf8");
      
      if (str) {
        req.body = parseQuery(str);
      } else {
        req.body = {};
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

