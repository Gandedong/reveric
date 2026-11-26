// Reveric bridge: exposes Reveric's in-app debug control endpoint as DSH tools.
//
// Reveric (debug build) writes %APPDATA%\ai.reveric.debug\Reveric\debug\control.json
// with { port, token } while it runs. Every tool below reads that file, calls the
// loopback endpoint, and returns the JSON response as text.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const name = 'reveric-bridge'
export const inject = ['tools']

// Windows: %APPDATA%\ai.reveric.debug\Reveric
// macOS:   ~/Library/Application Support/ai.reveric.debug/Reveric
const DEFAULT_SUPPORT_DIR = process.env.APPDATA
  ? join(process.env.APPDATA, 'ai.reveric.debug', 'Reveric')
  : join(
      process.env.HOME ?? '',
      'Library',
      'Application Support',
      'ai.reveric.debug',
      'Reveric',
    )

function descriptorPath(config) {
  const base = config?.supportDirectory || DEFAULT_SUPPORT_DIR
  return join(base, 'debug', 'control.json')
}

async function endpoint(config) {
  const path = descriptorPath(config)
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    throw new Error(
      `Reveric 调试端点未运行：找不到 ${path}。请先启动 Reveric 的 debug 构建。`,
    )
  }
  let descriptor
  try {
    descriptor = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Reveric 端点描述文件损坏：${error.message}`)
  }
  if (!descriptor?.port || !descriptor?.token) {
    throw new Error('Reveric 端点描述文件缺少 port 或 token。')
  }
  return `http://127.0.0.1:${descriptor.port}`
}

async function call(config, path, { method = 'GET', body } = {}) {
  const raw = await readFile(descriptorPath(config), 'utf8').then(JSON.parse)
  const base = await endpoint(config)
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${raw.token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text }
  }
  if (!response.ok) {
    const code = parsed?.error ?? `http_${response.status}`
    const detail = parsed?.message ?? text.slice(0, 300)
    throw new Error(`Reveric ${method} ${path} 失败（${code}）：${detail}`)
  }
  return parsed
}

const textOutput = (title) => ({
  schema: { type: 'object' },
  render(_args, value) {
    return [
      { type: 'text', text: `${title}\n${JSON.stringify(value, null, 2)}` },
    ]
  },
})

const STATUS_PARAMETERS = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

const GENERATE_PARAMETERS = {
  type: 'object',
  properties: {
    workId: { type: 'string', description: 'Reveric 作品 ID，例如 scr_40YRGM。' },
    names: {
      type: 'array',
      items: { type: 'string' },
      description: '角色姓名列表；留空表示给该作品内还没有头像的全部角色生成。',
    },
    characterIds: {
      type: 'array',
      items: { type: 'string' },
      description: '角色 ID 列表，优先于 names。',
    },
    style: {
      type: 'string',
      description: '风格：cg3d（3D 半写实 CG，默认）、cinematic、illustration、eastern、minimal，或直接给风格描述文本。',
    },
    dryRun: {
      type: 'boolean',
      description: '为 true 时只返回将要使用的提示词与数量，不调用生图模型、不产生费用。',
    },
    apply: {
      type: 'boolean',
      description: '默认 true：生成成功后写回角色头像字段；false 时只入库不更换头像。',
    },
  },
  required: ['workId'],
  additionalProperties: false,
}

const AGENT_PARAMETERS = {
  type: 'object',
  properties: {
    workId: { type: 'string', description: 'Reveric 作品 ID。' },
    message: {
      type: 'string',
      description: '交给 Reveric 内置智能体的自然语言任务。',
    },
    mode: {
      type: 'string',
      enum: ['readOnly', 'write'],
      description: 'readOnly（默认）只做读取与检查；write 允许修改内容。',
    },
    timeoutSeconds: {
      type: 'integer',
      description: '等待这一轮结束的秒数，默认 180，最大 900。',
    },
  },
  required: ['workId', 'message'],
  additionalProperties: false,
}

const CHECK_PARAMETERS = {
  type: 'object',
  properties: {
    workId: { type: 'string', description: 'Reveric 作品 ID。' },
    episodeNumbers: {
      type: 'array',
      items: { type: 'integer' },
      description: '只检查这些集；省略则检查全部集。',
    },
  },
  required: ['workId'],
  additionalProperties: false,
}

const REPLACE_PARAMETERS = {
  type: 'object',
  properties: {
    workId: { type: 'string', description: 'Reveric 作品 ID。' },
    find: { type: 'string', description: '要查找的字面文本。' },
    replace: { type: 'string', description: '替换成的文本；传空字符串表示删除。' },
    episodeNumbers: {
      type: 'array',
      items: { type: 'integer' },
      description: '只在这些集内替换；省略则全部集。',
    },
    apply: {
      type: 'boolean',
      description: '默认 false（只 dry-run）。true 才会写库，写前端点会自动备份内容库。',
    },
  },
  required: ['workId', 'find'],
  additionalProperties: false,
}

export function apply(ctx, config) {
  ctx.effect(() =>
    ctx.tools.register({
      name: 'reveric_status',
      description:
        'Read Reveric works, whether an image model is configured, and the control endpoint state.',
      parameters: STATUS_PARAMETERS,
      output: textOutput('Reveric status'),
      timeoutMs: 30000,
      async execute() {
        return call(config, '/status')
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'reveric_generate_avatars',
      description:
        'Generate character avatars inside Reveric and write them into the work. Dry run first to inspect prompts and count; real runs cost model credits. One image takes roughly a minute.',
      parameters: GENERATE_PARAMETERS,
      output: textOutput('Reveric avatar generation'),
      timeoutMs: 1800000,
      async execute(args) {
        const input = args ?? {}
        return call(config, '/avatars/batch', {
          method: 'POST',
          body: {
            workId: input.workId,
            ...(Array.isArray(input.names) ? { names: input.names } : {}),
            ...(Array.isArray(input.characterIds)
              ? { characterIds: input.characterIds }
              : {}),
            ...(input.style ? { style: input.style } : {}),
            ...(input.dryRun === true ? { dryRun: true } : {}),
            ...(input.apply === false ? { apply: false } : {}),
          },
        })
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'reveric_agent',
      description:
        "Run one turn of Reveric's built-in agent on a work and return its reply. Use readOnly for checks; write only when the user asked for edits.",
      parameters: AGENT_PARAMETERS,
      output: textOutput('Reveric agent turn'),
      timeoutMs: 900000,
      async execute(args) {
        const input = args ?? {}
        return call(config, '/agent/turn', {
          method: 'POST',
          body: {
            workId: input.workId,
            message: input.message,
            mode: input.mode === 'write' ? 'write' : 'readOnly',
            ...(typeof input.timeoutSeconds === 'number'
              ? { timeoutSeconds: input.timeoutSeconds }
              : {}),
          },
        })
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'reveric_check',
      description:
        'Check a Reveric screenplay for structural and metric problems: duplicate sort orders, scenes without exactly one heading, empty scenes, stale statistics, missing cast entries, orphan dialogue.',
      parameters: CHECK_PARAMETERS,
      output: textOutput('Reveric screenplay check'),
      timeoutMs: 120000,
      async execute(args) {
        const input = args ?? {}
        return call(config, '/screenplay/check', {
          method: 'POST',
          body: {
            workId: input.workId,
            ...(Array.isArray(input.episodeNumbers)
              ? { episodeNumbers: input.episodeNumbers }
              : {}),
          },
        })
      },
    }),
  )

  ctx.effect(() =>
    ctx.tools.register({
      name: 'reveric_screenplay_replace',
      description:
        'Batch literal find/replace across screenplay element text. Dry run by default; applying rewrites through Reveric\'s own service after backing up the work database.',
      parameters: REPLACE_PARAMETERS,
      output: textOutput('Reveric screenplay replace'),
      timeoutMs: 600000,
      async execute(args) {
        const input = args ?? {}
        return call(config, '/screenplay/replace-text', {
          method: 'POST',
          body: {
            workId: input.workId,
            find: input.find,
            ...(typeof input.replace === 'string' ? { replace: input.replace } : {}),
            ...(Array.isArray(input.episodeNumbers)
              ? { episodeNumbers: input.episodeNumbers }
              : {}),
            ...(input.apply === true ? { apply: true } : {}),
          },
        })
      },
    }),
  )

}
