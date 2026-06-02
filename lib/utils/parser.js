export function parser(req) {
  let url = req.url;
  if (!url) {
    return url;
  }
  let parsedUrl = req._parsedUrl;
  if (parsedUrl && parsedUrl._raw === url) {
    return parsedUrl;
  }

  let queryIndex = url.indexOf("?");
  const hasQuery = queryIndex !== -1;
  parsedUrl = {
    href: url,
    path: url,
    pathname: hasQuery ? url.substring(0, queryIndex) : url,
    search: hasQuery ? url.substring(queryIndex) : null,
    query: hasQuery ? url.substring(queryIndex + 1) : null,
    _raw: url,
  };

  req._parsedUrl = parsedUrl;
  return parsedUrl;
}
