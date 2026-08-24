import { defineConfig } from 'vitest/config'

// 真模型评测套件（ticket 09）：花 token,与 keyless 套件分开跑
// （`pnpm test:e2e`）。无 DEEPSEEK_API_KEY 时用例整体自跳过;
// 有 key 的环境从 mytool 根 .env 补读(Node >= 21.7 原生,缺文件即忽略)。
try {
  process.loadEnvFile(new URL('../.env', import.meta.url).pathname)
} catch {
  // 无 .env——环境变量可能已在进程环境里。
}

export default defineConfig({
  test: {
    include: ['test/**/*.e2e.ts'],
    // 真模型整管线（流式重写）远慢于单测;retry 保持 0,理由见 integrate.e2e.ts 头注。
    testTimeout: 240_000,
    hookTimeout: 60_000,
    retry: 0,
  },
})
