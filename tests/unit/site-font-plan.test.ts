import { describe, expect, test } from 'vitest'

import {
  buildFontPlan,
  compressUnicodeRanges,
  homepageFromGeneratedBlogs,
  migrateAssignmentsV2,
  parseAssignmentEpoch,
  parseAssignments,
  parseCodepoints,
  placeNewAssignments,
  rebalanceAssignments,
  serializeAssignmentEpoch,
  serializeAssignments,
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

const bytes = [500, 400, 300, 200, 100]

describe('committed data formats', () => {
  test('homepage cards use HuxPostCard preview fallback exactly', () => {
    const base = { author: '', tags: [], listed: true, date: '2026-01-01', body: { raw: '' } }
    const homepage = homepageFromGeneratedBlogs([
      { ...base, path: 'preview', title: '', subtitle: 'same', summary: 'other', preview: '預' },
      { ...base, path: 'summary', title: '', subtitle: 'different', summary: '摘', preview: '' },
      { ...base, path: 'duplicate', title: '', subtitle: '重', summary: '重', preview: '' },
    ])
    expect(homepage).toContain('預'.codePointAt(0))
    expect(homepage).toContain('摘'.codePointAt(0))
    expect(homepage).toContain('重'.codePointAt(0)) // subtitle only; duplicate summary adds nothing
  })

  test('homepage model covers sidebar featured tags from every listed post, not only top cards', () => {
    const base = { author: '', subtitle: '', summary: '', preview: '', body: { raw: '' } }
    const blogs = [
      // 前五張卡片(日期最新),不帶會重複的標籤。
      ...Array.from({ length: 5 }, (_, index) => ({
        ...base,
        path: `card-${index}`,
        title: 'A',
        tags: [`unique-${index}`],
        listed: true,
        date: `2026-02-0${index + 1}`,
      })),
      // 兩篇排在前五之外的舊文章共用含 CJK 的標籤 → 側欄 Featured Tags 會渲染它。
      ...['old-a', 'old-b'].map((path, index) => ({
        ...base,
        path,
        title: 'A',
        tags: ['共現標'],
        listed: true,
        date: `2026-01-0${index + 1}`,
      })),
      // 只出現一次的標籤與未列出文章的標籤都不會上側欄。
      { ...base, path: 'old-c', title: 'A', tags: ['孤標'], listed: true, date: '2026-01-03' },
      { ...base, path: 'hidden', title: 'A', tags: ['隱標', '隱標二'], listed: false, date: '2026-01-04' },
    ]
    const homepage = homepageFromGeneratedBlogs(blogs)
    for (const character of '共現標') {
      expect(homepage).toContain(character.codePointAt(0))
    }
    expect(homepage).not.toContain('孤'.codePointAt(0))
    expect(homepage).not.toContain('隱'.codePointAt(0))
  })
  test('parses and deterministically serializes code points', () => {
    expect(parseCodepoints('0042\n0041 1F600\n')).toEqual(new Set([0x42, 0x41, 0x1f600]))
    expect(serializeCodepoints(new Set([0x1f600, 0x42, 0x41]))).toBe('0041\n0042\n1F600\n')
  })

  test('validates assignment schema, keys, values, and duplicates', () => {
    expect(() => parseAssignments('{"schemaVersion":1,"bucketCount":5,"assignments":{}}')).toThrow(
      /schemaVersion/
    )
    expect(() => parseAssignments('{"schemaVersion":2,"bucketCount":4,"assignments":{}}')).toThrow(
      /bucketCount/
    )
    expect(() =>
      parseAssignments('{"schemaVersion":2,"bucketCount":5,"assignments":{"xyz":0}}')
    ).toThrow(/code point/i)
    expect(() =>
      parseAssignments('{"schemaVersion":2,"bucketCount":5,"assignments":{"0041":5}}')
    ).toThrow(/bucket/i)
    expect(() =>
      parseAssignments('{"schemaVersion":2,"bucketCount":5,"assignments":{"0041":0,"41":1}}')
    ).toThrow(/duplicate/i)
  })

  test('serializes assignments sorted and byte-identically', () => {
    const assignments = new Map([
      [0x4e00, 4],
      [0x42, 2],
      [0x41, 1],
    ])
    const expected = `{
  "schemaVersion": 2,
  "bucketCount": 5,
  "assignments": {
    "0041": 1,
    "0042": 2,
    "4E00": 4
  }
}\n`
    expect(serializeAssignments(assignments)).toBe(expected)
    expect(serializeAssignments(parseAssignments(expected))).toBe(expected)
  })
})

describe('stable placement', () => {
  test('uses maximum co-occurrence first', () => {
    const next = 0x50
    const result = placeNewAssignments({
      corpus: corpusWith({ documents: new Map([['p', new Set([0x41, 0x42, next])]]) }),
      core: new Set(),
      committedAssignments: new Map([
        [0x41, 1],
        [0x42, 1],
      ]),
      artifactBytes: bytes,
    })
    expect(result.get(next)).toBe(1)
  })

  test('then uses maximum touched pages', () => {
    const next = 0x50
    const result = placeNewAssignments({
      corpus: corpusWith({
        documents: new Map([
          ['p1', new Set([0x41, 0x42, 0x43, next])],
          ['p2', new Set([0x44, next])],
        ]),
      }),
      core: new Set(),
      committedAssignments: new Map([
        [0x41, 0],
        [0x42, 0],
        [0x43, 1],
        [0x44, 1],
      ]),
      artifactBytes: bytes,
    })
    expect(result.get(next)).toBe(1)
  })

  test('then uses minimum committed artifact bytes and lowest bucket ID', () => {
    const corpus = corpusWith({ documents: new Map([['p', new Set([0x50])]]) })
    expect(
      placeNewAssignments({
        corpus,
        core: new Set(),
        committedAssignments: new Map(),
        artifactBytes: [500, 100, 100, 200, 300],
      }).get(0x50)
    ).toBe(1)
  })

  test('processes new characters ascending and never moves historical assignments', () => {
    const committed = new Map([
      [0x41, 3],
      [0x2603, 4],
    ])
    const corpus = corpusWith({ documents: new Map([['p', new Set([0x41, 0x51, 0x50])]]) })
    const first = placeNewAssignments({
      corpus,
      core: new Set(),
      committedAssignments: committed,
      artifactBytes: bytes,
    })
    const second = placeNewAssignments({
      corpus,
      core: new Set(),
      committedAssignments: committed,
      artifactBytes: bytes,
    })
    expect([...first.keys()].slice(-2)).toEqual([0x50, 0x51])
    expect(first.get(0x41)).toBe(3)
    expect(first.get(0x2603)).toBe(4)
    expect(serializeAssignments(first)).toBe(serializeAssignments(second))
  })
})

describe('buildFontPlan', () => {
  test('ordinary updates preserve committed core and existing buckets', () => {
    const plan = buildFontPlan({
      corpus: corpusWith({ documents: new Map([['p', new Set([0x41, 0x42])]]) }),
      homepage: new Set([0x42]),
      committedCore: new Set([0x41]),
      committedAssignments: new Map([[0x42, 2]]),
      artifactBytes: bytes,
      rebuildCore: false,
    })
    expect(plan.core).toEqual(new Set([0x41]))
    expect(plan.promoted.size).toBe(0)
    expect(plan.assignments.get(0x42)).toBe(2)
  })

  test('rebuild monotonically adds fixed, homepage, and five-document characters', () => {
    const shared = 0x4e00
    const previousHomepageCharacter = 0x2603
    const documents = new Map(
      Array.from({ length: 5 }, (_, index) => [`post-${index}`, new Set([shared])])
    )
    const rebuilt = buildFontPlan({
      corpus: corpusWith({ fixedSeed: new Set([0x42]), documents }),
      homepage: new Set([0x43]),
      committedCore: new Set([0x41, previousHomepageCharacter]),
      committedAssignments: new Map([[0x43, 2]]),
      artifactBytes: bytes,
      rebuildCore: true,
    })
    expect(rebuilt.core).toEqual(new Set([0x41, previousHomepageCharacter, 0x42, 0x43, shared]))
    expect(rebuilt.core.has(previousHomepageCharacter)).toBe(true)
    expect(rebuilt.assignments.has(0x43)).toBe(false)
    expect(rebuilt.promoted).toEqual(new Set([0x42, 0x43, shared]))

    const fourDocuments = new Map([...documents].slice(0, 4))
    const withoutFifth = buildFontPlan({
      corpus: corpusWith({ documents: fourDocuments }),
      homepage: new Set(),
      committedCore: new Set(),
      committedAssignments: new Map(),
      artifactBytes: bytes,
      rebuildCore: true,
    })
    expect(withoutFifth.core.has(shared)).toBe(false)
  })

  test('keeps historical assignment extras and creates all five disjoint buckets', () => {
    const historical = 0x2603
    const plan = buildFontPlan({
      corpus: corpusWith({ documents: new Map([['p', new Set([0x41, 0x42])]]) }),
      homepage: new Set(),
      committedCore: new Set([0x41, 0x2708]),
      committedAssignments: new Map([
        [0x42, 2],
        [historical, 4],
      ]),
      artifactBytes: bytes,
      rebuildCore: false,
    })
    expect([...plan.buckets.keys()]).toEqual([0, 1, 2, 3, 4])
    expect(plan.buckets.get(0)?.size).toBe(0)
    expect(plan.assignments.get(historical)).toBe(4)
    expect(plan.buckets.get(4)?.has(historical)).toBe(true)
    const partitions = [plan.core, ...plan.buckets.values()]
    for (let left = 0; left < partitions.length; left += 1) {
      for (let right = left + 1; right < partitions.length; right += 1) {
        expect([...partitions[left]].some((value) => partitions[right].has(value))).toBe(false)
      }
    }
    expect(new Set(partitions.flatMap((partition) => [...partition]))).toEqual(
      new Set([0x41, 0x42, historical, 0x2708])
    )
  })

  test('adding documents and new characters cannot rebalance existing assignments', () => {
    const committed = new Map([[0x41, 3]])
    const before = buildFontPlan({
      corpus: corpusWith({ documents: new Map([['p1', new Set([0x41])]]) }),
      homepage: new Set(),
      committedCore: new Set(),
      committedAssignments: committed,
      artifactBytes: bytes,
      rebuildCore: false,
    })
    const after = buildFontPlan({
      corpus: corpusWith({
        documents: new Map([
          ['p1', new Set([0x41])],
          ['p2', new Set([0x41, 0x42])],
        ]),
      }),
      homepage: new Set(),
      committedCore: new Set(),
      committedAssignments: committed,
      artifactBytes: bytes,
      rebuildCore: false,
    })
    expect(before.assignments.get(0x41)).toBe(3)
    expect(after.assignments.get(0x41)).toBe(3)
    expect(after.newlyAssigned).toEqual(new Set([0x42]))
  })
})

describe('initial v2 migration', () => {
  test('groups identical incidence signatures and is deterministic', () => {
    const corpus = corpusWith({
      documents: new Map([
        ['a', new Set([0x41, 0x42])],
        ['b', new Set([0x41, 0x42, 0x43])],
      ]),
    })
    const first = migrateAssignmentsV2({
      corpus,
      homepage: new Set([0x43]),
      committedCore: new Set(),
    })
    const second = migrateAssignmentsV2({
      corpus,
      homepage: new Set([0x43]),
      committedCore: new Set(),
    })
    expect(first.schemaVersion).toBe(2)
    expect(first.bucketCount).toBe(5)
    expect(first.assignments.get(0x41)).toBe(first.assignments.get(0x42))
    expect(serializeAssignments(first.assignments)).toBe(serializeAssignments(second.assignments))
  })
})

describe('compressUnicodeRanges', () => {
  test('sorts and compresses adjacent code points', () => {
    expect(compressUnicodeRanges(new Set([0x41, 0x42, 0x44]))).toBe('U+0041-0042,U+0044')
    expect(compressUnicodeRanges(new Set())).toBe('')
  })
})

describe('rebalanceAssignments', () => {
  // 五份文件各自獨佔一批字元,外加一批被全部文件共用的字元。
  const shared = [0x4e00, 0x4e01, 0x4e02]
  const documents = new Map<string, Set<number>>(
    Array.from({ length: 5 }, (_, index) => [
      `doc-${index}`,
      new Set([...shared, 0x5000 + index * 2, 0x5001 + index * 2]),
    ])
  )
  const corpus = corpusWith({ documents })
  const core = new Set<number>()

  test('每份文件碰到的桶數不超過上限', () => {
    const assignments = rebalanceAssignments({ corpus, core })
    for (const codePoints of documents.values()) {
      const touched = new Set([...codePoints].map((codePoint) => assignments.get(codePoint)))
      expect(touched.size).toBeLessThanOrEqual(2)
    }
  })

  test('相同輸入必得完全相同輸出', () => {
    const first = rebalanceAssignments({ corpus, core })
    const second = rebalanceAssignments({ corpus, core })
    expect(serializeAssignments(first)).toBe(serializeAssignments(second))
  })

  test('同一文件簽名的字元必定同桶', () => {
    const assignments = rebalanceAssignments({ corpus, core })
    for (const codePoint of shared) {
      expect(assignments.get(codePoint)).toBe(assignments.get(shared[0]))
    }
  })

  test('覆蓋所有 non-core 字元,且不含 core 字元', () => {
    const withCore = new Set([0x4e00])
    const assignments = rebalanceAssignments({ corpus, core: withCore })
    expect(assignments.has(0x4e00)).toBe(false)
    expect(assignments.has(0x4e01)).toBe(true)
    for (const codePoints of documents.values()) {
      for (const codePoint of codePoints) {
        if (!withCore.has(codePoint)) expect(assignments.has(codePoint)).toBe(true)
      }
    }
  })

  test('保留已離開 corpus 的歷史 assignment,不讓它們消失', () => {
    const assignments = rebalanceAssignments({
      corpus,
      core,
      committedAssignments: new Map([[0x9fff, 3]]),
    })
    expect(assignments.has(0x9fff)).toBe(true)
    expect(assignments.get(0x9fff)).toBeGreaterThanOrEqual(0)
    expect(assignments.get(0x9fff)).toBeLessThan(5)
  })

  test('buildFontPlan 帶 rebalance 時改用重排結果,不帶時維持既有 assignment', () => {
    const committed = new Map([
      [0x4e00, 4],
      [0x4e01, 4],
      [0x4e02, 4],
    ])
    const incremental = buildFontPlan({
      corpus,
      committedCore: new Set(),
      committedAssignments: committed,
      artifactBytes: bytes,
    })
    // 增量放置不得移動既有 assignment。
    for (const codePoint of shared) expect(incremental.assignments.get(codePoint)).toBe(4)

    const rebalanced = buildFontPlan({
      corpus,
      committedCore: new Set(),
      committedAssignments: committed,
      artifactBytes: bytes,
      rebalance: true,
    })
    // 重排會重新推導:全文件共用的字元落到共用桶,各文件獨佔字元散到專屬桶。
    for (const codePoint of shared) expect(rebalanced.assignments.get(codePoint)).toBe(0)
    const privateBuckets = [...documents.values()].map(
      (codePoints) =>
        new Set(
          [...codePoints]
            .filter((codePoint) => !shared.includes(codePoint))
            .map((codePoint) => rebalanced.assignments.get(codePoint))
        )
    )
    expect(privateBuckets.every((buckets) => buckets.size === 1)).toBe(true)
    expect(new Set(privateBuckets.map((buckets) => [...buckets][0])).size).toBeGreaterThan(1)
    for (const codePoints of documents.values()) {
      const touched = new Set(
        [...codePoints].map((codePoint) => rebalanced.assignments.get(codePoint))
      )
      expect(touched.size).toBeLessThanOrEqual(2)
    }
  })

  test('bucket 數不足以滿足約束時大聲失敗,而不是回傳超標的 plan', () => {
    // 12 份文件,每份都獨佔一批字元且兩兩不共用 → 每份至少要自己的桶。
    const crowded = corpusWith({
      documents: new Map(
        Array.from({ length: 12 }, (_, index) => [`doc-${index}`, new Set([0x6000 + index])])
      ),
    })
    expect(() =>
      rebalanceAssignments({ corpus: crowded, core: new Set(), maxBucketsPerDocument: 0 })
    ).toThrow(/could not keep every document within/)
  })
})

describe('assignment epoch', () => {
  test('解析十進位整數並容忍尾端換行', () => {
    expect(parseAssignmentEpoch('0\n')).toBe(0)
    expect(parseAssignmentEpoch('7')).toBe(7)
    expect(parseAssignmentEpoch('  12  \n')).toBe(12)
  })

  test('拒絕非整數、負數與空字串', () => {
    expect(() => parseAssignmentEpoch('')).toThrow(/Invalid assignment epoch/)
    expect(() => parseAssignmentEpoch('-1')).toThrow(/Invalid assignment epoch/)
    expect(() => parseAssignmentEpoch('1.5')).toThrow(/Invalid assignment epoch/)
    expect(() => parseAssignmentEpoch('abc')).toThrow(/Invalid assignment epoch/)
  })

  test('序列化為單行加換行,並拒絕非法輸入', () => {
    expect(serializeAssignmentEpoch(0)).toBe('0\n')
    expect(serializeAssignmentEpoch(3)).toBe('3\n')
    expect(() => serializeAssignmentEpoch(-1)).toThrow(/Invalid assignment epoch/)
    expect(() => serializeAssignmentEpoch(1.5)).toThrow(/Invalid assignment epoch/)
  })
})
