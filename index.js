/**
 * dsh-proxy-switcher — Host half.
 *
 * Owns one process-wide outbound proxy selection and exposes it to the Client
 * half over loopback-only JSON routes. The actual transport policy is the
 * Harness's own `@deepseek-ai/dsh-http-proxy` package: this plugin re-resolves
 * it from a synthetic launch environment and reinstalls the global dispatcher
 * whenever the user switches. That is what keeps `globalThis.fetch`, the LLM
 * stack and the web-fetch provider on one consistent routing answer.
 *
 * Selection is persisted in `$DSH_HOME/proxy-switcher.json` and re-applied on
 * activation. `env` (follow the launch environment) is the default and installs
 * nothing, so a proxy exported before launch keeps working untouched.
 */

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { connect } from 'node:net'
import { pathToFileURL } from 'node:url'

export const name = 'dsh-proxy-switcher'

/** The web carrier this plugin's Client half calls. */
export const inject = ['webServer']

const ROUTE_PREFIX = '/api/dsh-proxy-switcher'
const DEFAULT_TEST_URL = 'https://example.com'
const TEST_TIMEOUT_MS = 15_000
const PROBE_TIMEOUT_MS = 3_000
const BODY_LIMIT = 64 * 1024
const LOOPBACK_NO_PROXY = 'localhost,127.0.0.1,::1,[::1]'
const PROXY_PACKAGE_FILE = join('node_modules', '@deepseek-ai', 'dsh-http-proxy', 'lib', 'index.js')
const UNDICI_PACKAGE_FILE = join('node_modules', 'undici', 'index.js')

export function apply(ctx) {
  const runtime = new ProxyRuntime()

  ctx.effect(() => () => {
    void runtime.dispose()
  }, 'proxy-switcher: runtime')

  const routes = [
    {
      kind: 'exact',
      path: `${ROUTE_PREFIX}/state`,
      handler: (req, res) => handle(req, res, 'GET', async () => {
        await runtime.ready
        return { ok: true, state: runtime.snapshot() }
      }),
    },
    {
      kind: 'exact',
      path: `${ROUTE_PREFIX}/apply`,
      handler: (req, res) => handle(req, res, 'POST', async (body) => runtime.applyRequest(body)),
    },
    {
      kind: 'exact',
      path: `${ROUTE_PREFIX}/profiles`,
      handler: (req, res) => handle(req, res, 'POST', async (body) => runtime.profilesRequest(body)),
    },
    {
      kind: 'exact',
      path: `${ROUTE_PREFIX}/test`,
      handler: (req, res) => handle(req, res, 'POST', async (body) => {
        await runtime.ready
        const test = await runtime.testConnection(body && body.url)
        return { ok: true, test }
      }),
    },
  ]

  for (const route of routes) {
    ctx.effect(() => ctx.webServer.register(route), `proxy-switcher: ${route.path}`)
  }
}

/* ------------------------------------------------------------------ *
 * Runtime
 * ------------------------------------------------------------------ */

class ProxyRuntime {
  constructor() {
    this.disposed = false
    this.queue = Promise.resolve()
    this.state = defaultState()
    this.launchEnv = captureLaunchEnv()
    this.warnings = []
    this.active = undefined
    this.engine = undefined
    this.engineId = null
    this.engineNote = null
    this.engineError = null
    this.ready = this.#init()
    this.ready.catch(() => {})
  }

  async #init() {
    try {
      this.state = await this.#readState()
      try {
        this.engine = await loadProxyEngine()
        this.engineId = this.engine.id
        this.engineNote = this.engine.note ?? null
      } catch (error) {
        this.engineError = messageOf(error)
        this.warnings.push(this.engineError)
        return
      }
      if (this.disposed) return

      const selected = effectiveSelected(this.state)
      if (selected === 'env') return

      if (selected !== 'direct') {
        const profile = this.state.profiles.find((entry) => entry.id === selected)
        const probe = profile ? await probeProxy(profile.url) : { ok: false, error: '配置已不存在' }
        if (!probe.ok) {
          this.warnings.push(`上次使用的代理不可用（${probe.error}），已回退到启动环境`)
          this.state = { ...this.state, selected: 'env' }
          await this.#persist()
          return
        }
      }

      if (this.disposed) return
      const result = await this.applyTarget(selected, { skipProbe: true })
      if (!result.ok) this.warnings.push(result.error)
    } catch (error) {
      this.warnings.push(`初始化失败：${messageOf(error)}`)
    }
  }

  /**
   * Serialize mutating requests so two browser tabs cannot interleave an
   * install with a remove.
   */
  run(task) {
    const next = this.queue.then(task, task)
    this.queue = next.then(() => undefined, () => undefined)
    return next
  }

  async applyRequest(body) {
    const payload = body && typeof body === 'object' ? body : {}
    return this.run(async () => {
      await this.ready
      const result = await this.applyTarget(typeof payload.target === 'string' ? payload.target : undefined)
      return result.ok
        ? { ok: true, state: result.state, warnings: result.warnings ?? [] }
        : { ok: false, error: result.error, state: result.state ?? this.snapshot() }
    })
  }

  async profilesRequest(body) {
    const payload = body && typeof body === 'object' ? body : {}
    return this.run(async () => {
      await this.ready
      if (payload.action === 'add') {
        return this.addProfile(payload.name, payload.url)
      }
      if (payload.action === 'update') {
        return this.updateProfile(
          typeof payload.id === 'string' ? payload.id : '',
          payload.name,
          payload.url,
        )
      }
      if (payload.action === 'remove') {
        return this.removeProfile(typeof payload.id === 'string' ? payload.id : '')
      }
      return { ok: false, error: `未知操作：${String(payload.action)}`, state: this.snapshot() }
    })
  }

  /**
   * Switch to `direct`, `env`, or a saved profile id.
   * A profile is probed first: an unreachable proxy is refused instead of
   * silently breaking every request the Host makes.
   */
  async applyTarget(target, options = {}) {
    if (this.disposed) return { ok: false, error: '插件已卸载', state: this.snapshot() }
    const known = target === 'direct' || target === 'env' ||
      (typeof target === 'string' && this.state.profiles.some((entry) => entry.id === target))
    if (!known) return { ok: false, error: '未知的代理选择', state: this.snapshot() }

    let profile
    if (target !== 'direct' && target !== 'env') {
      profile = this.state.profiles.find((entry) => entry.id === target)
      if (!profile) return { ok: false, error: '未找到该代理配置', state: this.snapshot() }
      if (options.skipProbe !== true) {
        const probe = await probeProxy(profile.url)
        if (!probe.ok) return { ok: false, error: `代理不可用：${probe.error}`, state: this.snapshot() }
      }
    }

    const engine = this.engine
    if (!engine) {
      return { ok: false, error: this.engineError ?? '代理引擎未就绪', state: this.snapshot() }
    }

    await this.#disposeActive()
    const warnings = []
    const selection = target === 'direct'
      ? {}
      : target === 'env'
        ? null
        : { httpProxy: profile.url, httpsProxy: profile.url }

    try {
      if (selection !== null) {
        this.active = await engine.install(selection, (message) => warnings.push(String(message)))
      }
    } catch (error) {
      await this.#disposeActive()
      try {
        this.active = await engine.install({}, () => {})
      } catch {
        // The fallback direct install is best-effort; report the original failure.
      }
      // The fallback above leaves the process direct, so the recorded selection
      // must say so instead of claiming a proxy that never took effect.
      this.state = { ...this.state, selected: 'direct' }
      await this.#persist()
      return { ok: false, error: `应用代理失败：${messageOf(error)}`, state: this.snapshot() }
    }

    this.state = {
      ...this.state,
      selected: target,
      ...(profile ? { defaultId: profile.id } : {}),
    }
    if (warnings.length > 0) this.warnings = [...this.warnings.slice(-8), ...warnings]
    await this.#persist()
    return { ok: true, state: this.snapshot(), warnings }
  }

  /**
   * Save a proxy without switching to it. The first saved profile becomes the
   * default, which is the proxy the dock toggle turns on. A proxy URL is unique:
   * adding the same address twice is refused instead of overwriting the name.
   */
  async addProfile(name, url) {
    let normalizedUrl
    try {
      normalizedUrl = normalizeProxyUrl(url)
    } catch (error) {
      return { ok: false, error: messageOf(error), state: this.snapshot() }
    }

    const canonical = canonicalProxyUrl(normalizedUrl)
    const existing = this.state.profiles.find((entry) => canonicalProxyUrl(entry.url) === canonical)
    if (existing) {
      return { ok: false, code: 'duplicate', error: '该代理地址已存在', state: this.snapshot() }
    }

    const profileName = normalizeName(name, normalizedUrl)
    if (this.state.profiles.some((entry) => entry.name.toLowerCase() === profileName.toLowerCase())) {
      return { ok: false, code: 'duplicate-name', error: '该代理名称已存在', state: this.snapshot() }
    }

    const profile = { id: randomUUID(), name: profileName, url: normalizedUrl }
    this.state = {
      ...this.state,
      profiles: [...this.state.profiles, profile],
      defaultId: effectiveDefaultId(this.state) ?? profile.id,
    }
    await this.#persist()
    return { ok: true, state: this.snapshot() }
  }

  /**
   * Edit a saved proxy. Changing the address of the proxy that is currently in
   * use switches immediately; a failed switch rolls the whole edit back.
   * Changing only the name takes effect without touching the transport.
   */
  async updateProfile(id, name, url) {
    const profile = this.state.profiles.find((entry) => entry.id === id)
    if (!profile) return { ok: false, error: '未找到该代理配置', state: this.snapshot() }

    let normalizedUrl
    try {
      normalizedUrl = normalizeProxyUrl(url)
    } catch (error) {
      return { ok: false, error: messageOf(error), state: this.snapshot() }
    }

    const canonical = canonicalProxyUrl(normalizedUrl)
    const others = this.state.profiles.filter((entry) => entry.id !== id)
    if (others.some((entry) => canonicalProxyUrl(entry.url) === canonical)) {
      return { ok: false, code: 'duplicate', error: '该代理地址已存在', state: this.snapshot() }
    }

    const nextName = normalizeName(name, normalizedUrl)
    if (others.some((entry) => entry.name.toLowerCase() === nextName.toLowerCase())) {
      return { ok: false, code: 'duplicate-name', error: '该代理名称已存在', state: this.snapshot() }
    }

    const previous = this.state
    const urlChanged = canonicalProxyUrl(profile.url) !== canonical
    this.state = {
      ...this.state,
      profiles: this.state.profiles.map((entry) => (
        entry.id === id ? { ...entry, name: nextName, url: normalizedUrl } : entry
      )),
    }

    if (urlChanged && effectiveSelected(this.state) === id) {
      const result = await this.applyTarget(id)
      if (!result.ok) {
        this.state = previous
        await this.#persist()
        return { ok: false, error: result.error, state: this.snapshot() }
      }
      return { ok: true, state: this.snapshot() }
    }

    await this.#persist()
    return { ok: true, state: this.snapshot() }
  }

  async removeProfile(id) {
    const profile = this.state.profiles.find((entry) => entry.id === id)
    if (!profile) return { ok: false, error: '未找到该代理配置', state: this.snapshot() }
    if (effectiveSelected(this.state) === id) {
      return { ok: false, code: 'in-use', error: '该代理正在使用，无法删除', state: this.snapshot() }
    }

    const wasDefault = effectiveDefaultId(this.state) === id
    const profiles = this.state.profiles.filter((entry) => entry.id !== id)
    this.state = {
      ...this.state,
      profiles,
      defaultId: wasDefault ? (profiles[0]?.id ?? null) : this.state.defaultId,
    }
    await this.#persist()
    return { ok: true, state: this.snapshot() }
  }

  /** Test the routing that is active right now, through the Host's own fetch. */
  async testConnection(rawUrl) {
    let target = this.state.testUrl
    if (typeof rawUrl === 'string' && rawUrl.trim() !== '') {
      try {
        target = normalizeTestUrl(rawUrl)
      } catch (error) {
        return { ok: false, error: messageOf(error), target: rawUrl, ms: 0 }
      }
    }
    const started = Date.now()
    try {
      const response = await fetch(target, {
        redirect: 'follow',
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        headers: { 'user-agent': 'dsh-proxy-switcher/1.0' },
      })
      return {
        ok: true,
        status: response.status,
        ms: Date.now() - started,
        url: response.url,
        target,
        via: this.engineId,
      }
    } catch (error) {
      return { ok: false, error: messageOf(error), ms: Date.now() - started, target, via: this.engineId }
    }
  }

  snapshot() {
    const selected = effectiveSelected(this.state)
    return {
      selected,
      defaultId: effectiveDefaultId(this.state),
      profiles: this.state.profiles.map((entry) => ({ ...entry })),
      launchEnv: { ...this.launchEnv },
      active: describeSelection(this.state, selected),
      effectiveEnv: {
        httpProxy: readProcessEnv('http_proxy'),
        httpsProxy: readProcessEnv('https_proxy'),
        noProxy: readProcessEnv('no_proxy'),
      },
      engine: { id: this.engineId, note: this.engineNote, error: this.engineError },
      warnings: [...this.warnings],
      testUrl: this.state.testUrl,
    }
  }

  async dispose() {
    this.disposed = true
    await this.ready.catch(() => {})
    await this.#disposeActive()
  }

  async #disposeActive() {
    const dispose = this.active
    this.active = undefined
    if (typeof dispose !== 'function') return
    try {
      await dispose()
    } catch (error) {
      this.warnings.push(`恢复原代理失败：${messageOf(error)}`)
    }
  }

  async #readState() {
    const file = stateFilePath()
    let raw
    try {
      raw = JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      if (error && error.code !== 'ENOENT') this.warnings.push(`读取配置失败：${messageOf(error)}`)
      return defaultState()
    }
    return normalizeState(raw, this.warnings)
  }

  async #persist() {
    try {
      await writeJsonFile(stateFilePath(), this.state)
    } catch (error) {
      this.warnings.push(`保存配置失败：${messageOf(error)}`)
    }
  }
}

/* ------------------------------------------------------------------ *
 * State file
 * ------------------------------------------------------------------ */

function defaultState() {
  return { version: 2, selected: 'env', defaultId: null, profiles: [], testUrl: DEFAULT_TEST_URL }
}

function stateFilePath() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME.trim()
    : join(homedir(), '.dsh')
  return join(home, 'proxy-switcher.json')
}

function normalizeState(raw, warnings) {
  const state = defaultState()
  if (!raw || typeof raw !== 'object') return state

  if (Array.isArray(raw.profiles)) {
    const seen = new Set()
    for (const item of raw.profiles) {
      if (!item || typeof item !== 'object') continue
      try {
        const url = normalizeProxyUrl(item.url)
        const id = typeof item.id === 'string' && item.id !== '' ? item.id : randomUUID()
        if (seen.has(id)) continue
        const canonical = canonicalProxyUrl(url)
        if (state.profiles.some((entry) => canonicalProxyUrl(entry.url) === canonical)) {
          warnings.push(`忽略重复的代理地址：${url}`)
          continue
        }
        const baseName = normalizeName(item.name, url)
        const name = uniqueProfileName(state.profiles, baseName)
        if (name !== baseName) {
          warnings.push(`代理名称重复，已重命名为「${name}」`)
        }
        seen.add(id)
        state.profiles.push({ id, name, url })
      } catch (error) {
        warnings.push(`忽略无效的代理配置：${messageOf(error)}`)
      }
    }
  }

  if (typeof raw.testUrl === 'string') {
    try {
      state.testUrl = normalizeTestUrl(raw.testUrl)
    } catch {
      // Keep the default.
    }
  }

  if (raw.selected === 'direct' || raw.selected === 'env') {
    state.selected = raw.selected
  } else if (typeof raw.selected === 'string' && state.profiles.some((entry) => entry.id === raw.selected)) {
    state.selected = raw.selected
  }

  if (typeof raw.defaultId === 'string' && state.profiles.some((entry) => entry.id === raw.defaultId)) {
    state.defaultId = raw.defaultId
  }
  // Migration and repair: a saved proxy is always selectable by the dock
  // toggle, so a non-empty list always has a default.
  if (state.defaultId === null) {
    state.defaultId = state.profiles.some((entry) => entry.id === state.selected)
      ? state.selected
      : (state.profiles[0]?.id ?? null)
  }

  return state
}

async function writeJsonFile(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    const handle = await open(temp, 'w')
    try {
      await handle.writeFile(JSON.stringify(value, null, 2), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temp, path)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}

/* ------------------------------------------------------------------ *
 * Selection helpers
 * ------------------------------------------------------------------ */

function effectiveSelected(state) {
  const { selected } = state
  if (selected === 'direct' || selected === 'env') return selected
  return state.profiles.some((entry) => entry.id === selected) ? selected : 'env'
}

/** The proxy the dock toggle turns on; a non-empty list always has one. */
function effectiveDefaultId(state) {
  if (state.defaultId !== null && state.profiles.some((entry) => entry.id === state.defaultId)) {
    return state.defaultId
  }
  return state.profiles[0]?.id ?? null
}

function describeSelection(state, selected) {
  if (selected === 'direct') return { kind: 'direct' }
  const profile = state.profiles.find((entry) => entry.id === selected)
  if (profile) return { kind: 'proxy', id: profile.id, name: profile.name, url: profile.url }
  return { kind: 'env' }
}

function captureLaunchEnv() {
  const all = readProcessEnv('all_proxy')
  const httpProxy = readProcessEnv('http_proxy') ?? all
  const httpsProxy = readProcessEnv('https_proxy') ?? all ?? readProcessEnv('http_proxy')
  return { httpProxy: httpProxy ?? null, httpsProxy: httpsProxy ?? null }
}

function readProcessEnv(name) {
  const value = process.env[name]
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text === '' ? null : text
}

function normalizeProxyUrl(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') throw new Error('代理地址不能为空')
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new Error('代理地址不是合法 URL，例如 http://127.0.0.1:7890')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅支持 http:// 或 https:// 代理（SOCKS / PAC 不受支持）')
  }
  return text
}

/** Compare proxy URLs without caring about a trailing slash or host casing. */
function canonicalProxyUrl(value) {
  try {
    return new URL(value).href
  } catch {
    return String(value)
  }
}

/**
 * Keep a legacy duplicate name instead of dropping its profile: append the
 * first free numeric suffix. New duplicates are rejected by `addProfile`.
 */
function uniqueProfileName(profiles, base) {
  const taken = new Set(profiles.map((entry) => entry.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let index = 2
  while (true) {
    const candidate = `${base} (${index})`.slice(0, 48)
    if (!taken.has(candidate.toLowerCase())) return candidate
    index += 1
  }
}

function normalizeTestUrl(value) {
  const text = String(value).trim()
  if (text === '') throw new Error('测试地址不能为空')
  const parsed = new URL(text)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('测试地址必须是 http:// 或 https://')
  }
  return parsed.href
}

function normalizeName(value, url) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (text !== '') return text.slice(0, 48)
  try {
    const parsed = new URL(url)
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
    return `${parsed.hostname}:${port}`
  } catch {
    return '代理'
  }
}

/* ------------------------------------------------------------------ *
 * Transport engines
 * ------------------------------------------------------------------ */

let enginePromise

function loadProxyEngine() {
  if (enginePromise === undefined) enginePromise = createProxyEngine()
  return enginePromise
}

/**
 * Prefer the Harness's own policy package: it is the module the launcher
 * installed, so the web-fetch provider and the global dispatcher share one
 * routing answer. Fall back to a local undici dispatcher only when that module
 * cannot be reached from this package.
 */
async function createProxyEngine() {
  const notes = []
  let policy = await attemptImport('@deepseek-ai/dsh-http-proxy', notes)

  if (!(policy && typeof policy.installProxyFromEnvironment === 'function')) {
    for (const file of moduleCandidates(PROXY_PACKAGE_FILE)) {
      const candidate = await attemptImport(pathToFileURL(file).href, notes)
      if (candidate && typeof candidate.installProxyFromEnvironment === 'function') {
        policy = candidate
        break
      }
    }
  }

  if (policy && typeof policy.installProxyFromEnvironment === 'function') {
    return {
      id: 'dsh-http-proxy',
      note: null,
      install: (selection, report) => policy.installProxyFromEnvironment(envSnapshot(selection), report),
    }
  }
  notes.push('@deepseek-ai/dsh-http-proxy: 缺少 installProxyFromEnvironment 导出')

  let undici = await attemptImport('undici', notes)
  if (!(undici && typeof undici.setGlobalDispatcher === 'function')) {
    for (const file of moduleCandidates(UNDICI_PACKAGE_FILE)) {
      const candidate = await attemptImport(pathToFileURL(file).href, notes)
      if (candidate && typeof candidate.setGlobalDispatcher === 'function') {
        undici = candidate
        break
      }
    }
  }

  if (undici && typeof undici.setGlobalDispatcher === 'function') {
    return {
      id: 'undici',
      note: 'Harness 代理策略包不可用，已改用本地 undici 转发（网页抓取可能仍走直连）。',
      install: (selection, report) => installWithUndici(undici, selection, report),
    }
  }

  notes.push('undici: 不可用')
  throw new Error(`代理引擎加载失败：${notes.join('；')}`)
}

async function attemptImport(specifier, notes) {
  try {
    return await import(specifier)
  } catch (error) {
    notes.push(`${specifier}: ${messageOf(error)}`)
    return undefined
  }
}

/** The Harness installation directories this process may have been launched from. */
function installDirs() {
  const dirs = new Set()
  if (typeof process.resourcesPath === 'string' && process.resourcesPath !== '') {
    dirs.add(join(process.resourcesPath, 'app.asar', 'dsh'))
    dirs.add(join(process.resourcesPath, 'app', 'dsh'))
  }
  for (const arg of process.argv) {
    if (typeof arg !== 'string') continue
    const index = arg.indexOf('app.asar')
    if (index === -1) continue
    dirs.add(join(arg.slice(0, index + 'app.asar'.length), 'dsh'))
  }
  return [...dirs]
}

function moduleCandidates(relative) {
  const files = []
  for (const dir of installDirs()) {
    const file = join(dir, relative)
    try {
      if (existsSync(file)) files.push(file)
    } catch {
      // An unreadable candidate is simply skipped.
    }
  }
  return files
}

/** The launch-environment view `installProxyFromEnvironment` expects. */
function envSnapshot(selection) {
  const values = new Map()
  if (selection.httpProxy) values.set('http_proxy', selection.httpProxy)
  if (selection.httpsProxy) values.set('https_proxy', selection.httpsProxy)
  if (selection.noProxy) values.set('no_proxy', selection.noProxy)
  return {
    get(key) {
      if (typeof key !== 'string') return undefined
      const value = values.get(key.toLowerCase())
      return value === undefined ? undefined : { value }
    },
  }
}

/** Fallback: install an equivalent per-origin dispatcher with this profile's undici. */
async function installWithUndici(undici, selection, report) {
  const proxy = selection.httpsProxy ?? selection.httpProxy
  const previous = undici.getGlobalDispatcher()
  let agent

  if (proxy) {
    const parsed = new URL(proxy)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('仅支持 http:// 或 https:// 代理')
    }
    agent = new undici.Agent({
      factory(origin, options) {
        const target = new URL(origin.toString())
        if (isLoopbackHostname(target.hostname)) return new undici.Pool(origin, options)
        return new undici.ProxyAgent({ ...options, uri: proxy })
      },
    })
  } else {
    agent = new undici.Agent()
  }

  undici.setGlobalDispatcher(agent)
  const restoreEnv = publishProxyEnv(selection)
  report?.('使用本地 undici 转发')

  return async () => {
    undici.setGlobalDispatcher(previous)
    restoreEnv()
    await agent.close()
  }
}

function publishProxyEnv(selection) {
  const names = ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'no_proxy', 'NO_PROXY']
  const previous = new Map(names.map((entry) => [entry, process.env[entry]]))
  const proxied = selection.httpProxy !== undefined || selection.httpsProxy !== undefined
  const next = {
    http_proxy: selection.httpProxy,
    https_proxy: selection.httpsProxy,
    no_proxy: proxied ? selection.noProxy || LOOPBACK_NO_PROXY : undefined,
  }
  for (const entry of names) {
    const value = next[entry.toLowerCase()]
    if (value === undefined) Reflect.deleteProperty(process.env, entry)
    else process.env[entry] = value
  }
  return () => {
    for (const entry of names) {
      const value = previous.get(entry)
      if (value === undefined) Reflect.deleteProperty(process.env, entry)
      else process.env[entry] = value
    }
  }
}

/* ------------------------------------------------------------------ *
 * HTTP plumbing
 * ------------------------------------------------------------------ */

async function handle(req, res, method, run) {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
    return
  }
  if (req.method !== method) {
    writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` })
    return
  }
  try {
    const body = method === 'POST' ? await readJson(req) : undefined
    const payload = await run(body)
    writeJson(res, 200, payload)
  } catch (error) {
    writeJson(res, 400, { ok: false, error: messageOf(error) })
  }
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

/**
 * Request-level trust fence: a loopback socket address, a loopback Host header,
 * and no forwarding hop. Same-origin browser markers are honoured when present.
 */
function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket && request.socket.remoteAddress)) return false
  if (request.headers['cf-connecting-ip'] !== undefined || request.headers['x-forwarded-for'] !== undefined) return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function isIPv4Loopback(address) {
  const parts = address.split('.')
  return parts.length === 4 && parts[0] === '127' &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address === '') return false
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isIPv4Loopback(normalized.slice(7))
  return isIPv4Loopback(normalized)
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  return isIPv4Loopback(hostname)
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function probeProxy(value, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let parsed
    try {
      parsed = new URL(value)
    } catch {
      resolve({ ok: false, error: '代理地址不是合法 URL' })
      return
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ ok: false, error: '仅支持 http:// 或 https:// 代理' })
      return
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, '')
    const port = parsed.port !== '' ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      resolve({ ok: false, error: '代理端口无效' })
      return
    }

    const socket = connect({ host, port })
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish({ ok: true }))
    socket.once('timeout', () => finish({ ok: false, error: `连接 ${host}:${port} 超时` }))
    socket.once('error', (error) => finish({
      ok: false,
      error: `无法连接 ${host}:${port}（${error.code || error.message}）`,
    }))
  })
}

function messageOf(error) {
  if (error && typeof error === 'object') {
    const cause = error.cause
    if (cause && typeof cause === 'object' && (cause.code || cause.message)) {
      const detail = cause.code || cause.message
      return `${error.message || 'error'}（${detail}）`
    }
    if (typeof error.message === 'string' && error.message !== '') return error.message
  }
  return String(error)
}
