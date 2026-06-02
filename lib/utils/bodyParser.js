import { parse as parseQuery } from "querystring";

function getBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

export function json() {
  return async function jsonParser(req, res, next) {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("application/json")) {
      return next();
    }

    try {
      const buffer = await getBodyBuffer(req);
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

export function urlencoded() {
  return async function urlencodedParser(req, res, next) {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      return next();
    }

    try {
      const buffer = await getBodyBuffer(req);
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
