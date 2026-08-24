#!/usr/bin/env node
/**
 * 看板 client bundle 构建（ADR 0007）：tsc 单文件 ESM → 机械转 CJS → 包 loader
 * 工厂壳 → 纯度校验。
 *
 * 不引入 tsdown/bundler：client 半边只有一个入口文件、只有外部件 import。
 * tsc 需 `moduleResolution: bundler`（上游包的类型走 exports 子路径），故先出
 * ESM，再把顶部 import/export 声明按固定模式转成 require/exports 赋值——转换
 * 是窄模式 + 失败即报错，格式漂移会在构建期暴露而不是浏览器里。
 * 工厂壳格式与上游 tsdown 预设逐字对齐（banner/intro/footer）；纯度规则 =
 * 平台模块表 + runtime/client 豁免。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tscBin = join(root, 'node_modules', '.bin', 'tsc')

const compiled = spawnSync(tscBin, ['-p', 'tsconfig.client.json'], { cwd: root, stdio: 'inherit' })
if (compiled.error !== undefined) {
  console.error(compiled.error.message)
  process.exit(1)
}
if (compiled.status !== 0) process.exit(compiled.status ?? 1)

const emitted = join(root, 'lib/client/index.js')
const id = 'mytool-dsh-notes'
const banner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`
const intro = 'var module = { exports: {} }; var exports = module.exports;'
const footer = 'return module.exports; } });'

let code = readFileSync(emitted, 'utf8')

// import { a, b as c } from 'x';  →  const { a, c: b } = require('x');
// 注意别名方向：ESM `b as c` 里 b 是导出名、c 是本地名，CJS 键取导出名（c: b 是反的，
// 会让 jsx as _jsx 去找不存在的 _jsx 属性 → 渲染期 undefined TypeError）。
const importPattern = /^import \{([^}]+)\} from ['"]([^'"]+)['"];$/gm
const imports = [...code.matchAll(importPattern)]
if (imports.length === 0) throw new Error('client bundle: 顶部没有任何 import 声明，转换模式失效')
const destructure = (names) => names.split(',')
  .map((part) => part.trim())
  .filter((part) => part !== '')
  .map((part) => {
    const asMatch = /^(\w+) as (\w+)$/.exec(part)
    return asMatch === null ? part : `${asMatch[1]}: ${asMatch[2]}`
  })
  .join(', ')
code = code.replace(importPattern, (_m, names, spec) => `const { ${destructure(names)} } = require('${spec}');`)

// 内联导出：export const/function X → 去前缀，名字记录到末尾统一挂 exports。
const exportedNames = []
code = code.replace(/^export const (\w+) =/gm, (_m, name) => { exportedNames.push(name); return `const ${name} =` })
code = code.replace(/^export function (\w+)/gm, (_m, name) => { exportedNames.push(name); return `function ${name}` })
if (exportedNames.length === 0) throw new Error('client bundle: 找不到 export 声明，转换模式失效')
const assigns = exportedNames.map((n) => `exports.${n} = ${n};`).join(' ')

const wrapped = `${banner}\n${intro}\n${code}\n${assigns}\n${footer}\n`
writeFileSync(emitted, wrapped)

const ALLOWED = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment', '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
])
const requires = [...wrapped.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((m) => m[2])
const bad = [...new Set(requires.filter((r) => !ALLOWED.has(r)))]
if (bad.length > 0) {
  console.error(`client bundle purity: 不允许的 require：${bad.join(', ')}（只允许平台模块表）`)
  process.exit(1)
}

// 防回归闸：别名方向写反（jsx as _jsx → { _jsx: jsx }）只在渲染期爆 undefined TypeError，
// 浏览器里被 SlotErrorBoundary 静默吞掉。凡本机 require 得到的外部件，逐一核对解构键
// 真实存在；require 不到的（@deepseek-ai/* 是浏览器源码形态）跳过。
for (const m of wrapped.matchAll(/^const \{([^}]+)\} = require\((['"])([^'"]+)\2\);$/gm)) {
  let mod
  try {
    mod = await import(m[3])
  } catch {
    continue
  }
  for (const part of m[1].split(',')) {
    const key = part.split(':')[0].trim()
    if (!(key in mod)) {
      console.error(`client bundle smoke: ${m[3]} 上不存在解构键 '${key}'（别名方向反了？）`)
      process.exit(1)
    }
  }
}
console.log(`lib/client/index.js 就绪（${imports.length} 个 import 转换，${requires.length} 个 require，全部平台外部件）`)
