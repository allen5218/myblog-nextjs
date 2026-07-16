import { describe, expect, test } from 'vitest'

import {
  buildFontPlan,
  compressUnicodeRanges,
  parseCodepoints,
  serializeCodepoints,
} from '../../scripts/site-font-plan.mjs'

const corpusWith = ({
  fixedSeed = new Set<number>(),
  documents = new Map<string, Set<number>>(),
}: {
  fixedSeed?: Set<number>
  documents?: Map<string, Set<number>>
}) => {
  const occurrences = new Map<number, Set<string>>()
  for (const [document, codePoints] of documents) {
    for (const codePoint of codePoints) {
      const names = occurrences.get(codePoint) ?? new Set<string>()
      names.add(document)
      occurrences.set(codePoint, names)
    }
  }
  return { fixedSeed, documents, occurrences, excluded: new Map() }
}

describe('code point files', () => {
  test('parses whitespace-separated hexadecimal code points as numbers', () => {
    expect(parseCodepoints('0042\n0041 1F600\n')).toEqual(new Set([0x42, 0x41, 0x1f600]))
  })

  test('serializes sorted uppercase code points deterministically', () => {
    expect(serializeCodepoints(new Set([0x1f600, 0x42, 0x41]))).toBe('0041\n0042\n1F600\n')
  })
})

describe('buildFontPlan', () => {
  test('ordinary updates preserve the committed core without promotions', () => {
    const committedCore = new Set([0x41])
    const corpus = corpusWith({
      fixedSeed: new Set([0x42]),
      documents: new Map(
        Array.from({ length: 5 }, (_, index) => [`post-${index}`, new Set([0x43])])
      ),
    })

    const plan = buildFontPlan({ corpus, committedCore, rebuildCore: false })

    expect(plan.core).toEqual(committedCore)
    expect(plan.promoted.size).toBe(0)
  })

  test('the fifth distinct document promotes a character only during rebuild', () => {
    const shared = 0x4e00
    const fiveDocuments = new Map(
      Array.from({ length: 5 }, (_, index) => [`post-${index}`, new Set([shared])])
    )
    const fourDocuments = new Map([...fiveDocuments].slice(0, 4))

    const planWithFiveDocuments = buildFontPlan({
      corpus: corpusWith({ documents: fiveDocuments }),
      committedCore: new Set(),
      rebuildCore: true,
    })
    const planWithFourDocuments = buildFontPlan({
      corpus: corpusWith({ documents: fourDocuments }),
      committedCore: new Set(),
      rebuildCore: true,
    })

    expect(planWithFiveDocuments.core.has(shared)).toBe(true)
    expect(planWithFiveDocuments.promoted.has(shared)).toBe(true)
    expect(planWithFourDocuments.core.has(shared)).toBe(false)
  })

  test('rebuild is a monotonic union of old core, fixed seed, and high-frequency characters', () => {
    const oldCoreCharacter = 0x2603
    const fixedSeedCharacter = 0x41
    const frequentCharacter = 0x4e00
    const documents = new Map(
      Array.from({ length: 5 }, (_, index) => [`post-${index}`, new Set([frequentCharacter])])
    )

    const rebuilt = buildFontPlan({
      corpus: corpusWith({ fixedSeed: new Set([fixedSeedCharacter]), documents }),
      committedCore: new Set([oldCoreCharacter]),
      rebuildCore: true,
    })

    expect(rebuilt.core).toEqual(new Set([oldCoreCharacter, fixedSeedCharacter, frequentCharacter]))
    expect(rebuilt.core.has(oldCoreCharacter)).toBe(true)
  })

  test('retains historical core extras while buckets contain only the current corpus', () => {
    const historicalCoreCharacter = 0x2603
    const currentCoreCharacter = 0x41
    const currentSupplementalCharacter = 0x4e00
    const currentCorpus = new Set([currentCoreCharacter, currentSupplementalCharacter])

    const plan = buildFontPlan({
      corpus: corpusWith({
        fixedSeed: new Set([currentCoreCharacter]),
        documents: new Map([['current-post', new Set([currentSupplementalCharacter])]]),
      }),
      committedCore: new Set([historicalCoreCharacter, currentCoreCharacter]),
      rebuildCore: true,
    })

    expect(plan.core.has(historicalCoreCharacter)).toBe(true)
    const bucketCodePoints = new Set([...plan.buckets.values()].flatMap((bucket) => [...bucket]))
    expect([...bucketCodePoints].every((codePoint) => currentCorpus.has(codePoint))).toBe(true)
    const coveredCodePoints = new Set([...plan.core, ...bucketCodePoints])
    expect([...currentCorpus].every((codePoint) => coveredCodePoints.has(codePoint))).toBe(true)
  })

  test('partitions supported corpus into disjoint core and eight stable buckets', () => {
    const coreCharacter = 0x41
    const supplemental = [0x42, 0x43, 0x4e00, 0x4e07]
    const corpus = corpusWith({
      fixedSeed: new Set([coreCharacter]),
      documents: new Map([['post', new Set(supplemental)]]),
    })

    const plan = buildFontPlan({
      corpus,
      committedCore: new Set([coreCharacter]),
      rebuildCore: false,
    })

    expect([...plan.buckets.keys()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    for (const codePoint of supplemental) {
      expect(plan.buckets.get(codePoint % 8)?.has(codePoint)).toBe(true)
    }

    const partitions = [plan.core, ...plan.buckets.values()]
    for (let left = 0; left < partitions.length; left += 1) {
      for (let right = left + 1; right < partitions.length; right += 1) {
        expect([...partitions[left]].filter((value) => partitions[right].has(value))).toEqual([])
      }
    }
    const currentCorpus = new Set([coreCharacter, ...supplemental])
    const coveredCodePoints = new Set(partitions.flatMap((partition) => [...partition]))
    expect([...currentCorpus].every((codePoint) => coveredCodePoints.has(codePoint))).toBe(true)
    const bucketCodePoints = new Set([...plan.buckets.values()].flatMap((bucket) => [...bucket]))
    expect([...bucketCodePoints].every((codePoint) => currentCorpus.has(codePoint))).toBe(true)
  })
})

describe('compressUnicodeRanges', () => {
  test('sorts, deduplicates, and compresses adjacent code points', () => {
    expect(compressUnicodeRanges(new Set([0x44, 0x42, 0x41, 0x42]))).toBe('U+0041-0042,U+0044')
  })

  test('returns an empty string for an empty set', () => {
    expect(compressUnicodeRanges(new Set())).toBe('')
  })
})
