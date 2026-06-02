import { parser } from "./parser.js";
import { parse as parseQuery } from "querystring";
import crypto from "crypto";
import http from "http";

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((pair) => {
    const parts = pair.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim();
      cookies[key] = decodeURIComponent(val);
    }
  });
  return cookies;
}

function serializeCookie(name, val, options = {}) {
  let str = `${name}=${encodeURIComponent(val)}`;

  if (options.maxAge !== undefined) {
    str += `; Max-Age=${Math.floor(options.maxAge / 1000)}`;
  }
  if (options.domain) {
    str += `; Domain=${options.domain}`;
  }
  if (options.path) {
    str += `; Path=${options.path}`;
  } else {
    str += `; Path=/`;
  }
  if (options.expires) {
    str += `; Expires=${options.expires.toUTCString()}`;
  }
  if (options.httpOnly) {
    str += `; HttpOnly`;
  }
  if (options.secure) {
    str += `; Secure`;
  }
  if (options.sameSite) {
    const sameSite = typeof options.sameSite === "string"
      ? options.sameSite.toLowerCase()
      : "lax";
    str += `; SameSite=${sameSite.charAt(0).toUpperCase() + sameSite.slice(1)}`;
  }

  return str;
}

const mimeTypes = {
  html: "text/html",
  json: "application/json",
  txt: "text/plain",
  text: "text/plain",
  xml: "application/xml",
  css: "text/css",
  js: "application/javascript",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function decorateRequest(req, extra) {
  if (!extra) {
    extra = parser(req);
  }
  req.completeURL = req.originalUrl || req.url;
  req.path = extra.pathname;
  req.query = parseQuery(extra.query);

  if (!req.id) {
    req.id = req.headers["x-request-id"] || req.headers["x-correlation-id"] || crypto.randomUUID();
  }

  if (!req.headers.traceparent && !req.headers.Traceparent) {
    const cleanId = req.id.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
    const spanId = crypto.randomBytes
      ? crypto.randomBytes(8).toString("hex")
      : Math.random().toString(16).substring(2, 10).padEnd(16, "0");
    req.headers.traceparent = `00-${cleanId}-${spanId}-01`;
  }

  req.get = req.header = function(name) {
    if (!name) return undefined;
    const lc = name.toLowerCase();
    switch (lc) {
      case "referer":
      case "referrer":
        return req.headers.referrer || req.headers.referer;
      default:
        return req.headers[lc];
    }
  };

  Object.defineProperty(req, "cookies", {
    get() {
      if (!req._cookies) {
        req._cookies = parseCookies(req.headers.cookie);
      }
      return req._cookies;
    },
    configurable: true,
  });

  Object.defineProperty(req, "ip", {
    get() {
      const forwarded = req.headers["x-forwarded-for"];
      if (forwarded) {
        return forwarded.split(",")[0].trim();
      }
      return req.socket.remoteAddress;
    },
    configurable: true,
  });

  Object.defineProperty(req, "xhr", {
    get() {
      const val = req.headers["x-requested-with"] || "";
      return val.toLowerCase() === "xmlhttprequest";
    },
    configurable: true,
  });

  Object.defineProperty(req, "protocol", {
    get() {
      if (req.socket.encrypted) return "https";
      const forwarded = req.headers["x-forwarded-proto"];
      if (forwarded) {
        return forwarded.split(",")[0].trim().toLowerCase();
      }
      return "http";
    },
    configurable: true,
  });

  Object.defineProperty(req, "secure", {
    get() {
      return req.protocol === "https";
    },
    configurable: true,
  });

  Object.defineProperty(req, "hostname", {
    get() {
      let host = req.headers["x-forwarded-host"] || req.headers["host"];
      if (!host) return undefined;
      host = host.split(",")[0].trim();
      const index = host.indexOf(":");
      return index === -1 ? host : host.substring(0, index);
    },
    configurable: true,
  });

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

  res.sendStatus = function(statusCode) {
    res.statusCode = statusCode;
    const message = http.STATUS_CODES[statusCode] || String(statusCode);
    return res.send(message);
  };

  res.set = res.header = function(field, val) {
    if (arguments.length === 2) {
      res.setHeader(field, val);
    } else if (typeof field === "object") {
      for (const [key, value] of Object.entries(field)) {
        res.setHeader(key, value);
      }
    }
    return res;
  };

  res.get = function(field) {
    return res.getHeader(field);
  };

  res.type = function(type) {
    const ct = type.indexOf("/") === -1 ? (mimeTypes[type] || type) : type;
    res.setHeader("Content-Type", ct);
    return res;
  };

  res.cookie = function(name, value, options = {}) {
    const serialized = serializeCookie(name, value, options);
    const existing = res.getHeader("Set-Cookie");
    if (!existing) {
      res.setHeader("Set-Cookie", serialized);
    } else if (Array.isArray(existing)) {
      res.setHeader("Set-Cookie", [...existing, serialized]);
    } else {
      res.setHeader("Set-Cookie", [existing, serialized]);
    }
    return res;
  };

  return res;
}

