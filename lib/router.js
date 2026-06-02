import { parse } from "regexparam";
import { isSubApp, wrapSubApp } from "./utils/subapp.js";
import { createRequestHandler } from "./final-handler.js";

const HTTP_METHODS = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  OPTIONS: "OPTIONS",
  HEAD: "HEAD",
  PATCH: "PATCH",
  USE: "USE",
  ALL: "ALL",
};

const METHOD_PRIORITY = {
  [HTTP_METHODS.USE]: 0,
  [HTTP_METHODS.GET]: 1,
  [HTTP_METHODS.POST]: 2,
  [HTTP_METHODS.PUT]: 3,
  [HTTP_METHODS.DELETE]: 4,
  [HTTP_METHODS.OPTIONS]: 5,
  [HTTP_METHODS.HEAD]: 6,
  [HTTP_METHODS.PATCH]: 7,
  [HTTP_METHODS.ALL]: 8,
};

class Route {
  constructor(method, path, handlers) {
    const { keys, pattern } = parse(path, method === HTTP_METHODS.USE);
    this.method = method;
    this.path = path;
    this.handlers = handlers;
    this.keys = keys;
    this.pattern = pattern;
  }
  match(method, url) {
    // just return if method dont matches(except for middleware and ALL)
    if (
      this.method !== HTTP_METHODS.USE &&
      this.method !== HTTP_METHODS.ALL &&
      this.method !== method
    ) {
      return null;
    }
    const matches = this.pattern.exec(url);
    if (!matches) {
      return null;
    }
    const params = this.extractParams(matches);
    return {
      handlers: this.handlers,
      params,
    };
  }

  extractParams(matches) {
    if (!this.keys.length && !matches.groups) {
      return {};
    }
    const params = {};
    if (matches.groups) {
      Object.assign(params, matches.groups);
    }
    this.keys.forEach((key, i) => {
      params[key] = matches[i + 1];
    });
    return params;
  }
}

export class Router {
  constructor() {
    this.routes = [];
    this.initializeMethods();
    this.runsOnEveryRequest = createRequestHandler(this);
  }
  initializeMethods() {
    Object.values(HTTP_METHODS).forEach((method) => {
      if (method === HTTP_METHODS.USE) {
        this.use = this.addRoute.bind(this, HTTP_METHODS.USE);
      } else if (method === HTTP_METHODS.ALL) {
        this.all = this.addRoute.bind(this, HTTP_METHODS.ALL);
      } else {
        this[method.toLowerCase()] = this.addRoute.bind(this, method);
      }
    });
  }
  addRoute(method, path, ...handlers) {
    let routePath = path;
    let routeHandlers = handlers;
    if (typeof path === "function" || (path && typeof path.runsOnEveryRequest === "function")) {
      routePath = "/";
      routeHandlers = [path, ...handlers];
    }
    
    // Wrap any sub-apps/routers registered as handlers
    routeHandlers = routeHandlers.map((handler) => {
      if (isSubApp(handler)) {
        return wrapSubApp(routePath, handler);
      }
      return handler;
    });

    const route = new Route(method, routePath, routeHandlers);
    this.routes.push(route);
    return this;
  }

  find(method, url) {
    const matches = [];
    for (const route of this.routes) {
      const match = route.match(method, url);
      if (!match) {
        continue;
      }
      matches.push({
        route,
        handlers: route.handlers,
        params: match.params,
      });
    }
    return matches;
  }
  
  // adding support for mounting
  mount(path, router) {
    router.routes.forEach((route) => {
      const mountedPath = path + (route.path === "/" ? "" : route.path);
      this.addRoute(route.method, mountedPath, ...route.handlers);
    });
    return this;
  }
}

