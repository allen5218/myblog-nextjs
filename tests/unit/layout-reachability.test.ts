import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'

// `layouts/` 底下的檔案是頁面直接使用的版面,不走 barrel、不靠間接 composition。
// 契約:每個版面都必須是某個 `app/**/page.tsx` **編譯後仍然留著**的 import。
//
// 機器實際證明的是「頁面的直接 runtime 相依」,不是「頁面渲染了它」——
// `import '@/layouts/X'` 這種純副作用 import 也會通過。這是刻意接受的邊界:那種寫法在本 repo
// 不存在,而要擋掉它就得回頭自己判斷「有沒有被渲染」,正是下面說的那條走不通的路。
//
// 「編譯後仍然留著」而不是「原始碼裡有 import」,是這條斷言唯一站得住的定義。
// `no-unused-vars` 在 eslint.config.mjs 是 off、tsconfig 也沒開 `noUnusedLocals`,所以
// 「刪掉用法卻留下 import」不會被任何其他關卡發現 —— 而編譯器會把整條 import 抹除,
// 那個 runtime 相依根本不存在。只看 import 在不在,就是在測一個已被編譯器丟掉的東西。
//
// **判斷交給 TypeScript 自己的 emit(`ts.transpileModule`),不要自己判斷「有沒有被用到」。**
// 手寫識別字比對必然出錯,而且兩個方向都會錯:同名的物件 property、type parameter、
// interface 成員、另一條 import 的來源名都會被誤算成「用到了」;反過來
// `class Page extends Layout` 是真的 runtime 相依,卻因為 `ExpressionWithTypeArguments`
// 被 TypeScript 歸類成 TypeNode 而被誤判成沒用到。import elision 是編譯器的既有職責,
// 直接問它。用的是本 repo 自己的 compilerOptions,所以將來若開了 `verbatimModuleSyntax`
// 這類旗標,這條契約的語意會自動跟著改。
//
// **module specifier 交給 `ts.resolveModuleName`,不要自己解析路徑。** 手寫 resolver 會漏掉
// `baseUrl` 的裸路徑(`layouts/X`)、副檔名替換(`@/layouts/X.js` → `.tsx`)與目錄 index,
// 三者都是合法且 tsconfig 認得的寫法,漏掉會讓活著的版面被誤判成死的。
//
// 候選檔用 `readdirSync` 遞迴列舉而非 `git ls-files`:突變測試新增的檔案通常還沒 stage,
// 走 git 會看不見它,於是突變靜默通過、證明不了任何事。
const ROOT = process.cwd()

const compilerOptions = (() => {
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json')
  if (configPath === undefined) throw new Error('找不到 tsconfig.json')
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile)
  return ts.parseJsonConfigFileContent(config, ts.sys, ROOT).options
})()

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(full, match)
    return match(entry.name) ? [full] : []
  })
}

/** 這個頁面編譯後仍然留著的 import,解析成絕對檔名。 */
function survivingImports(file: string): string[] {
  const { outputText } = ts.transpileModule(ts.sys.readFile(file) ?? '', {
    fileName: file,
    compilerOptions,
  })
  const emitted = ts.createSourceFile(
    file,
    outputText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

  return emitted.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement)) return []
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return []
    const resolved = ts.resolveModuleName(
      statement.moduleSpecifier.text,
      file,
      compilerOptions,
      ts.sys
    ).resolvedModule?.resolvedFileName
    return resolved === undefined ? [] : [resolve(resolved)]
  })
}

const layouts = filesUnder(resolve(ROOT, 'layouts'), (name) => name.endsWith('.tsx'))
const usedByPages = new Set(
  filesUnder(resolve(ROOT, 'app'), (name) => name === 'page.tsx').flatMap(survivingImports)
)

describe('layouts/ 的可達性', () => {
  // 沒有這一條的話,枚舉一旦變空,下面的 test.each 會一個案例都不跑。
  test('候選檔與頁面留存的 import 都不是空集合', () => {
    expect(layouts.length).toBeGreaterThan(0)
    expect(usedByPages.size).toBeGreaterThan(0)
  })

  test.each(layouts.map((file) => [relative(ROOT, file), file]))(
    '%s 必須是某個 app/**/page.tsx 編譯後仍留存的 import',
    (_label, file) => {
      expect(usedByPages.has(file)).toBe(true)
    }
  )
})
