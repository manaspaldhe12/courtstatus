// Hash-based routing: GitHub Pages serves one static index.html, so a real
// path like /court/alamo-square would 404 on a hard refresh or direct link
// without extra server-side rewrite tricks. A hash never hits the server,
// so it works with zero extra config.
export type Route = { name: 'home' } | { name: 'court'; slug: string }

export function parseRoute(hash: string): Route {
  const match = /^#\/court\/([^/]+)$/.exec(hash)
  if (match) return { name: 'court', slug: decodeURIComponent(match[1]) }
  return { name: 'home' }
}

export function courtHref(slug: string): string {
  return `#/court/${encodeURIComponent(slug)}`
}
