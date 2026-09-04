import { describe, it, expect } from 'vitest'
import { parseRoute, courtHref } from './router'

describe('parseRoute', () => {
  it('treats an empty hash as home', () => {
    expect(parseRoute('')).toEqual({ name: 'home' })
  })

  it('treats a bare "#/" as home', () => {
    expect(parseRoute('#/')).toEqual({ name: 'home' })
  })

  it('parses a court route and decodes the slug', () => {
    expect(parseRoute('#/court/alamo-square')).toEqual({ name: 'court', slug: 'alamo-square' })
    expect(parseRoute('#/court/st-mary%27s')).toEqual({ name: 'court', slug: "st-mary's" })
  })

  it('falls back to home for anything unrecognized', () => {
    expect(parseRoute('#/something/else')).toEqual({ name: 'home' })
    expect(parseRoute('#/court/')).toEqual({ name: 'home' })
    expect(parseRoute('#/court/a/b')).toEqual({ name: 'home' })
  })
})

describe('courtHref', () => {
  it('builds a hash link for a slug', () => {
    expect(courtHref('alamo-square')).toBe('#/court/alamo-square')
  })

  it('encodes characters that need it', () => {
    expect(courtHref('a b/c')).toBe('#/court/a%20b%2Fc')
  })

  it('round-trips through parseRoute', () => {
    expect(parseRoute(courtHref('dolores-park'))).toEqual({ name: 'court', slug: 'dolores-park' })
  })
})
