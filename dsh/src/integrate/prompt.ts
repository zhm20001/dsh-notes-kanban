/**
 * 整合 prompt 模板（spec 0002 条目 2：显式、版本化、进源码）。
 * 规则内嵌条目 5/6/7/8（矛盾 blockquote、多来源、标签治理、status 只提案）与条目 3（摘要）。
 * 模板改动必须递增 PROMPT_VERSION——版本号随整合工具结果落会话日志，replay 可识别旧版行为。
 *
 * @module mytool-dsh-notes/integrate/prompt
 */

/** 模板版本；规则或输出契约变化时递增。 */
export const PROMPT_VERSION = 1

export interface IntegrationPromptInput {
  /** 既有笔记全文（front-matter + body，原样）。 */
  noteMarkdown: string
  /** 新材料原文。 */
  material: string
  /** 新材料来源（可省）。 */
  source?: string
  /** 标签上限（spec 0002 条目 7）。 */
  maxTags: number
  /** 摘要长度上限（spec 0002 条目 3）。 */
  summaryMaxChars: number
}

export interface IntegrationPrompt {
  system: string
  user: string
}

/** 组装整合模板；规则文本是产品逻辑，参数（上限）随 Config 注入。 */
export function buildIntegrationPrompt(input: IntegrationPromptInput): IntegrationPrompt {
  const system = [
    '你是笔记整合器。给定一条既有笔记全文与一份新材料，把两者重写成一条连贯的笔记。',
    '',
    '规则：',
    '1. 整合 = 去重 + 总结 + 体系化：合并信息、消除重复、组织成连贯结构；绝不把新材料粘贴追加到文末。',
    '2. 新材料的所有要点必须保留进正文。',
    '3. 矛盾不静默覆盖：新材料与既有内容冲突时，保留两种观点并用 `> ⚠️ 矛盾（存疑）：…` blockquote 标记，待人工裁定。',
    '4. 来源：正文里维护「来源」列表，既有来源与新材料来源都保留；front-matter 的 source 由调用方维护，你只管正文列表。',
    `5. 标签：合并既有 tags 与新材料值得加的标签，大小写不敏感去重，既有在前新在后，总数 ≤ ${input.maxTags}。`,
    `6. 摘要：产出 ≤ ${input.summaryMaxChars} 字符的摘要，概括整合后笔记的核心。`,
    '7. 状态：只在确信笔记明显成长/该搁置/该结案时提议升格（proposed_status），拿不准给 null；是否采纳由调用方决定。',
    '8. 标题：可微调使其点题；无必要不改动。',
    '',
    '输出：只输出一个裸 JSON 对象（不要代码围栏、不要任何多余文字），字段：',
    '{"title": string, "tags": string[], "summary": string, "body": string, "proposed_status": "spark"|"active"|"dormant"|"done"|null, "contradictions_flagged": boolean}',
    'body 是重写后的完整 markdown 正文。',
  ].join('\n')

  const user = [
    '<existing-note>',
    input.noteMarkdown,
    '</existing-note>',
    '',
    '<new-material>',
    input.material,
    '</new-material>',
    ...(input.source !== undefined ? ['', `本材料来源：${input.source}`] : []),
  ].join('\n')

  return { system, user }
}
