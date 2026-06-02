export function injectCorrelationId(headers, correlationId) {
  if (!correlationId) return headers;
  const newHeaders = Object.assign({}, headers);
  // Support both standard headers
  newHeaders["X-Correlation-ID"] = correlationId;
  newHeaders["X-Request-ID"] = correlationId;
  return newHeaders;
}

export async function withTimeout(fetchFn, timeoutMs) {
  if (!timeoutMs) return fetchFn();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(controller.signal);
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function retryRequest(fetchFn, retries = 3, delay = 100) {
  let attempt = 0;
  while (true) {
    try {
      return await fetchFn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) {
        throw err;
      }
      const backoffDelay = delay * Math.pow(2, attempt);
      console.warn(`[Client] Request failed. Retrying in ${backoffDelay}ms... (Attempt ${attempt}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }
}

export async function request(req, url, options = {}) {
  const {
    timeout: timeoutMs = 5000,
    retries = 3,
    retryDelay = 100,
    headers = {},
    ...fetchOptions
  } = options;

  const correlationId = req ? req.id : null;
  const finalHeaders = injectCorrelationId(headers, correlationId);

  const fetchTask = (signal) => {
    return fetch(url, {
      ...fetchOptions,
      headers: finalHeaders,
      signal,
    });
  };

  const timeoutTask = () => withTimeout(fetchTask, timeoutMs);

  return retryRequest(timeoutTask, retries, retryDelay);
}
