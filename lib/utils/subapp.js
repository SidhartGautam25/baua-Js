export function isSubApp(handler) {
  return handler && typeof handler.runsOnEveryRequest === "function";
}

export function getMatchedPrefix(path, mountPath, params) {
  if (!mountPath.includes(":")) {
    return mountPath;
  }
  // Replace each parameter in mountPath with its value from params
  let resolved = mountPath;
  for (const [key, value] of Object.entries(params)) {
    resolved = resolved.replace(":" + key, value);
  }
  return resolved;
}

export function wrapSubApp(mountPath, subApp) {
  const cleanMountPath = mountPath.endsWith("/") && mountPath !== "/"
    ? mountPath.slice(0, -1)
    : mountPath;

  return function subAppMiddleware(req, res, next) {
    // 1. Keep original values
    const originalUrl = req.url;
    const originalPath = req.path;
    const originalParams = req.params;

    // 2. Resolve matching prefix (for dynamic path support)
    const matchedPrefix = mountPath.includes(":")
      ? getMatchedPrefix(req.path, cleanMountPath, req.params)
      : cleanMountPath;

    // 3. Compute new sub-path
    let subPath = req.path;
    if (matchedPrefix !== "/") {
      if (req.path.startsWith(matchedPrefix)) {
        subPath = req.path.slice(matchedPrefix.length);
        if (!subPath.startsWith("/")) {
          subPath = "/" + subPath;
        }
      }
    }

    // 4. Rewrite URL and path for sub-app execution
    const queryIndex = req.url.indexOf("?");
    const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : "";
    req.url = subPath + queryString;
    req.path = subPath;

    // 5. Run the sub-app request handler
    subApp.runsOnEveryRequest(req, res, (err) => {
      // 6. Restore original request values if control returns to parent
      req.url = originalUrl;
      req.path = originalPath;
      req.params = originalParams;
      next(err);
    });
  };
}
