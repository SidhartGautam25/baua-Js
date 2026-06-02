export function getBase(url) {
  const secondSlashPosition = url.indexOf("/", 1);
  if (secondSlashPosition > 1) {
    return url.substring(0, secondSlashPosition);
  }
  return url;
}
