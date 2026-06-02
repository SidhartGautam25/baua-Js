export function helmet(opts = {}) {
  return (req, res, next) => {
    // Intercept writeHead to ensure X-Powered-By is stripped even if set by later handlers
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      res.removeHeader("X-Powered-By");
      return writeHead.apply(res, args);
    };

    // Strip it immediately as well
    res.removeHeader("X-Powered-By");

    // Helper to set header if not set to false (disabled)
    const setHeader = (name, defaultValue) => {
      const configVal = opts[name];
      if (configVal === false) return;
      res.setHeader(name, configVal || defaultValue);
    };

    // 2. Set security headers
    setHeader(
      "Content-Security-Policy",
      "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests"
    );
    setHeader("Cross-Origin-Opener-Policy", "same-origin");
    setHeader("Cross-Origin-Resource-Policy", "same-origin");
    setHeader("Origin-Agent-Cluster", "?1");
    setHeader("Referrer-Policy", "no-referrer");
    setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    setHeader("X-Content-Type-Options", "nosniff");
    setHeader("X-DNS-Prefetch-Control", "off");
    setHeader("X-Download-Options", "noopen");
    setHeader("X-Frame-Options", "SAMEORIGIN");
    setHeader("X-Permitted-Cross-Domain-Policies", "none");
    setHeader("X-XSS-Protection", "0");

    next();
  };
}
