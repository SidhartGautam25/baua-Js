import { parser } from "./parser.js";
import { parse } from "querystring";
import crypto from "crypto";

export function decorateRequest(req, extra) {
  if (!extra) {
    extra = parser(req);
  }
  req.completeURL = req.originalUrl || req.url;
  req.path = extra.pathname;
  req.query = parse(extra.query);

  if (!req.id) {
    req.id = req.headers["x-request-id"] || req.headers["x-correlation-id"] || crypto.randomUUID();
  }

  return req;
}

export function decorateResponse(res) {
  res.status = function(code) {
    res.statusCode = code;
    return res;
  };

  res.json = function(obj) {
    if (res.writableEnded) return res;
    const body = JSON.stringify(obj);
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.setHeader("Content-Length", Buffer.byteLength(body));
    res.end(body);
    return res;
  };

  res.send = function(body) {
    if (res.writableEnded) return res;
    let chunk = body;
    let contentType = res.getHeader("Content-Type");

    if (body === null || body === undefined) {
      chunk = "";
    } else if (typeof body === "object" && !Buffer.isBuffer(body)) {
      return res.json(body);
    } else if (typeof body === "string") {
      if (!contentType) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
      }
    } else if (Buffer.isBuffer(body)) {
      if (!contentType) {
        res.setHeader("Content-Type", "application/octet-stream");
      }
    } else if (typeof body === "number" || typeof body === "boolean") {
      chunk = String(body);
      if (!contentType) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
    }

    const len = chunk !== undefined && chunk !== null ? Buffer.byteLength(chunk) : 0;
    res.setHeader("Content-Length", len);
    res.end(chunk);
    return res;
  };

  res.redirect = function(url, status = 302) {
    if (res.writableEnded) return res;
    res.statusCode = status;
    res.setHeader("Location", url);
    res.end();
    return res;
  };

  return res;
}
