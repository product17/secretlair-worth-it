import { describe, expect, it, vi } from 'vitest'
import {
  createStableSlug,
  getScryfallDisplayName,
  getScryfallOracleId,
  parseSldGroups,
  parseScryfallJsonlLine,
  resolveSldCards,
} from './scryfall.ts'

describe('parseSldGroups', () => {
  it('extracts clean group metadata and cards from adjacent grids', () => {
    const html = `
      <h2 class="card-grid-header" id="the-first-drop">
        <span class="card-grid-header-content">
          The First Drop
          <span class="card-grid-header-dot">•</span>
          <a href="/search">2 cards</a>
        </span>
      </h2>
      <div class="card-grid">
        <div data-card-id="11111111-1111-4111-8111-111111111111"></div>
        <div data-card-id="22222222-2222-4222-8222-222222222222"></div>
      </div>
      <h2 class="card-grid-header">
        <span class="card-grid-header-content">
          Déjà Vu &amp; Friends
          <span class="card-grid-header-dot">•</span>
          <a href="/search">1 card</a>
        </span>
      </h2>
      <div class="card-grid">
        <div data-card-id="33333333-3333-4333-8333-333333333333"></div>
      </div>
    `

    expect(parseSldGroups(html)).toEqual([
      {
        slug: 'the-first-drop',
        title: 'The First Drop',
        cardCount: 2,
        cardIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ],
      },
      {
        slug: 'deja-vu-and-friends',
        title: 'Déjà Vu & Friends',
        cardCount: 1,
        cardIds: ['33333333-3333-4333-8333-333333333333'],
      },
    ])
  })

  it('rejects a header without an immediately following populated grid', () => {
    const html = `
      <h2 class="card-grid-header" id="broken">
        <span class="card-grid-header-content">
          Broken <a>1 card</a>
        </span>
      </h2>
      <p>Not a card grid</p>
    `

    expect(() => parseSldGroups(html)).toThrow(
      'is not immediately followed by a .card-grid',
    )
  })
})

describe('Scryfall parser helpers', () => {
  it('creates deterministic ASCII slugs', () => {
    expect(createStableSlug('  Déjà Vu & Friends!  ')).toBe(
      'deja-vu-and-friends',
    )
  })

  it('parses one JSONL card without archive buffering', () => {
    expect(
      parseScryfallJsonlLine(
        '{"id":"11111111-1111-4111-8111-111111111111","name":"Card"}',
      ),
    ).toMatchObject({ name: 'Card' })
    expect(parseScryfallJsonlLine('  ')).toBeNull()
  })

  it('resolves reversible cards through their shared face Oracle ID', () => {
    const reversibleCard = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Command Tower // Command Tower',
      set: 'sld',
      set_name: 'Secret Lair Drop',
      collector_number: '1',
      released_at: '2026-01-01',
      scryfall_uri: 'https://scryfall.com/card/sld/1',
      card_faces: [
        {
          name: 'Command Tower',
          oracle_id: '22222222-2222-4222-8222-222222222222',
        },
        {
          name: 'Command Tower',
          oracle_id: '22222222-2222-4222-8222-222222222222',
        },
      ],
    }

    expect(getScryfallOracleId(reversibleCard)).toBe(
      '22222222-2222-4222-8222-222222222222',
    )
    expect(getScryfallDisplayName(reversibleCard)).toBe('Command Tower')
  })

  it('retries transient rate limits using Retry-After', async () => {
    const cardId = '11111111-1111-4111-8111-111111111111'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '0' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: cardId,
                name: 'Card',
                set: 'sld',
                set_name: 'Secret Lair Drop',
                collector_number: '1',
                released_at: '2026-01-01',
                scryfall_uri: 'https://scryfall.com/card/sld/1',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ) as unknown as typeof fetch

    const result = await resolveSldCards([cardId], fetchMock)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.unmatchedCardIds).toEqual([])
    expect(result.cardsById.get(cardId)?.name).toBe('Card')
  })
})
