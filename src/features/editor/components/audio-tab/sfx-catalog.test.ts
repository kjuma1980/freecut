// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { SFX_CATEGORIES, SFX_ITEMS } from './sfx-catalog'

describe('SFX Catalog', () => {
  it('defines all required categories', () => {
    const categoryIds = SFX_CATEGORIES.map((c) => c.id)
    expect(categoryIds).toContain('all')
    expect(categoryIds).toContain('transitions')
    expect(categoryIds).toContain('ui')
    expect(categoryIds).toContain('foley')
  })

  it('contains categorized sound items with valid metadata', () => {
    expect(SFX_ITEMS.length).toBeGreaterThanOrEqual(12)

    for (const item of SFX_ITEMS) {
      expect(item.id).toBeTruthy()
      expect(item.name).toBeTruthy()
      expect(item.duration).toBeGreaterThan(0)
      expect(item.description).toBeTruthy()
      expect(item.assetPath).toMatch(/^\/assets\/audio\/sfx\/.+\.wav$/)
      expect(['transitions', 'ui', 'foley']).toContain(item.category)
    }
  })

  it('includes core transition sounds', () => {
    const transitionIds = SFX_ITEMS.filter((i) => i.category === 'transitions').map((i) => i.id)
    expect(transitionIds).toContain('whoosh-fast')
    expect(transitionIds).toContain('swish-cinematic')
    expect(transitionIds).toContain('riser-tension')
    expect(transitionIds).toContain('impact-boom')
  })

  it('includes core UI sounds', () => {
    const uiIds = SFX_ITEMS.filter((i) => i.category === 'ui').map((i) => i.id)
    expect(uiIds).toContain('click-soft')
    expect(uiIds).toContain('bubble-pop')
    expect(uiIds).toContain('chime-success')
    expect(uiIds).toContain('bell-notification')
  })
})
