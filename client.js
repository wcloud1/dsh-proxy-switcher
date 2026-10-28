/**
 * dsh-proxy-switcher — Client half.
 *
 * A split pill under the composer toggles between direct and the default proxy;
 * its caret opens the configuration panel, and Settings gains a "Proxy" section
 * with the same panel. Both surfaces share one snapshot store; the Host half
 * owns the actual transport policy and persistence.
 *
 * The module is plain JavaScript on purpose: it is served as a lazily
 * materialized factory, so only the React baseline and browser globals are
 * available.
 */
window.__ModuleLoader__.load({
  id: 'dsh-proxy-switcher',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-proxy-switcher'
    const API = '/api/dsh-proxy-switcher'

    const zh = {
      'dock.label': '代理',
      'dock.open': '打开代理设置',
      'panel.title': '网络代理',
      'panel.subtitle': '点击列表里的代理即可启用它；「代理」按钮在直连与当前代理之间切换。',
      'panel.close': '关闭',
      'panel.current': '当前生效',
      'panel.applying': '切换中…',
      'panel.directActive': '直连（不使用代理）',
      'panel.envActive': '启动环境 · {url}',
      'panel.active': '使用中',
      'panel.edit': '编辑',
      'panel.save': '保存',
      'panel.updated': '已更新代理',
      'panel.updateFailed': '保存失败：{error}',
      'panel.addTitle': '添加代理',
      'panel.namePlaceholder': '名称（可选）',
      'panel.urlPlaceholder': 'http://127.0.0.1:7890',
      'panel.urlLabel': '代理地址',
      'panel.addSubmit': '添加代理',
      'panel.adding': '添加中…',
      'panel.added': '已添加代理',
      'panel.addFailed': '添加失败：{error}',
      'panel.duplicate': '该代理地址已存在，不能重复添加',
      'panel.duplicateName': '该代理名称已存在，请换一个名称',
      'panel.delete': '删除',
      'panel.confirmDelete': '确认删除',
      'panel.cancel': '取消',
      'panel.removed': '已删除该代理配置',
      'panel.removeFailed': '删除失败：{error}',
      'panel.removeInUse': '该代理正在使用，请先切换为直连再删除',
      'panel.inUse': '正在使用，先切换为直连再删除',
      'panel.empty': '还没有代理配置。添加后点击列表项即可启用；「代理」按钮可在直连与它之间切换。',
      'panel.noDefault': '还没有可用的代理：先在这里添加一个代理，再点击「代理」按钮。',
      'panel.test': '测试当前连接',
      'panel.testing': '测试中…',
      'panel.testOk': '连接正常 · HTTP {status} · {ms}ms',
      'panel.testFail': '连接失败：{error}',
      'panel.applyFailed': '切换失败：{error}',
      'panel.autoTestFailed': '已切换，但连通性测试失败：{error}',
      'panel.revert': '回滚',
      'panel.hint': '支持 http:// 与 https:// 代理，SOCKS / PAC 不受支持。代理对本进程及其子进程生效；停止代理后请切回直连。正在使用的代理不能删除，请先切回直连。',
      'panel.loading': '正在读取代理状态…',
      'panel.loadFailed': '读取代理状态失败：{error}',
      'panel.retry': '重试',
      'panel.diagnostics': '诊断信息（{count}）',
      'panel.engineError': '代理引擎不可用：{error}',
      'panel.engineNote': '{note}',
      'settings.nav': '网络代理',
    }

    const en = {
      'dock.label': 'Proxy',
      'dock.open': 'Open proxy settings',
      'panel.title': 'Network proxy',
      'panel.subtitle': 'Click a proxy in the list to enable it; the Proxy button toggles between direct and the current proxy.',
      'panel.close': 'Close',
      'panel.current': 'Currently active',
      'panel.applying': 'Applying…',
      'panel.directActive': 'Direct (no proxy)',
      'panel.envActive': 'Launch environment · {url}',
      'panel.active': 'In use',
      'panel.edit': 'Edit',
      'panel.save': 'Save',
      'panel.updated': 'Proxy updated',
      'panel.updateFailed': 'Save failed: {error}',
      'panel.addTitle': 'Add a proxy',
      'panel.namePlaceholder': 'Name (optional)',
      'panel.urlPlaceholder': 'http://127.0.0.1:7890',
      'panel.urlLabel': 'Proxy URL',
      'panel.addSubmit': 'Add proxy',
      'panel.adding': 'Adding…',
      'panel.added': 'Proxy added',
      'panel.addFailed': 'Add failed: {error}',
      'panel.duplicate': 'That proxy URL already exists; duplicates are not allowed',
      'panel.duplicateName': 'That proxy name already exists; choose another one',
      'panel.delete': 'Delete',
      'panel.confirmDelete': 'Confirm delete',
      'panel.cancel': 'Cancel',
      'panel.removed': 'Proxy profile removed',
      'panel.removeFailed': 'Remove failed: {error}',
      'panel.removeInUse': 'This proxy is in use; switch to direct before deleting it',
      'panel.inUse': 'In use — switch to direct before deleting',
      'panel.empty': 'No proxies yet. Add one, then click it in the list to enable it; the Proxy button toggles direct and that proxy.',
      'panel.noDefault': 'No proxy is available yet: add one here, then use the Proxy button.',
      'panel.test': 'Test current connection',
      'panel.testing': 'Testing…',
      'panel.testOk': 'Connected · HTTP {status} · {ms}ms',
      'panel.testFail': 'Connection failed: {error}',
      'panel.applyFailed': 'Switch failed: {error}',
      'panel.autoTestFailed': 'Switched, but the connectivity test failed: {error}',
      'panel.revert': 'Revert',
      'panel.hint': 'http:// and https:// proxies only; SOCKS and PAC are not supported. The proxy covers this host process and its children — switch back to Direct when the proxy stops. An in-use proxy cannot be deleted; switch to direct first.',
      'panel.loading': 'Reading proxy state…',
      'panel.loadFailed': 'Could not read proxy state: {error}',
      'panel.retry': 'Retry',
      'panel.diagnostics': 'Diagnostics ({count})',
      'panel.engineError': 'Proxy engine unavailable: {error}',
      'panel.engineNote': '{note}',
      'settings.nav': 'Proxy',
    }

    /* ---------------------------------------------------------------- *
     * Helpers
     * ---------------------------------------------------------------- */

    function messageOf(error) {
      if (error && typeof error === 'object') {
        if (typeof error.message === 'string' && error.message !== '') return error.message
      }
      return String(error)
    }

    function hostOf(url) {
      if (typeof url !== 'string' || url === '') return ''
      try {
        return new URL(url).host
      } catch {
        return url.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '')
      }
    }

    function createStore() {
      let snapshot = {
        phase: 'loading',
        state: null,
        error: null,
        open: false,
        busy: null,
        notice: null,
        test: null,
        fault: null,
        revertTo: null,
        localeRevision: 0,
      }
      let translate = (key) => key
      const listeners = new Set()

      const publish = (patch) => {
        snapshot = Object.assign({}, snapshot, patch)
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (error) {
            // A broken subscriber must not take the store down.
          }
        }
      }

      const t = (key, params) => {
        try {
          return translate(key, params)
        } catch (error) {
          return key
        }
      }

      async function request(path, body) {
        const init = { method: body === undefined ? 'GET' : 'POST' }
        if (body !== undefined) {
          init.headers = { 'content-type': 'application/json' }
          init.body = JSON.stringify(body)
        }
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          init.signal = AbortSignal.timeout(30000)
        }
        const response = await fetch(path, init)
        let payload = null
        try {
          payload = await response.json()
        } catch (error) {
          payload = null
        }
        if (!response.ok) {
          throw new Error(payload && typeof payload.error === 'string' ? payload.error : 'HTTP ' + response.status)
        }
        return payload
      }

      async function refresh() {
        if (snapshot.phase !== 'ready') publish({ phase: 'loading' })
        try {
          const payload = await request(API + '/state')
          publish({ phase: 'ready', state: payload && payload.state ? payload.state : null, error: null })
        } catch (error) {
          publish({ phase: 'error', error: messageOf(error) })
        }
      }

      async function testOnce(url) {
        try {
          const payload = await request(API + '/test', { url })
          const result = payload && payload.test ? payload.test : { ok: false, error: 'No test result', ms: 0 }
          publish({ test: result })
          return result
        } catch (error) {
          const result = { ok: false, error: messageOf(error), ms: 0 }
          publish({ test: result })
          return result
        }
      }

      async function test(url) {
        if (snapshot.busy !== null) return
        publish({ busy: 'test', notice: null })
        const result = await testOnce(url)
        publish({
          busy: null,
          fault: result.ok === true ? null : (result.error || 'connectivity test failed'),
        })
      }

      /** Switch routing. `direct` and `env` are infra states; profiles come from the list. */
      async function apply(target) {
        if (snapshot.busy !== null) return false
        const previousTarget = snapshot.state ? snapshot.state.selected : null
        publish({ busy: 'apply', notice: null, test: null, fault: null })
        try {
          const payload = await request(API + '/apply', { target })
          if (!payload || payload.ok !== true) {
            const error = payload && payload.error ? payload.error : 'unknown error'
            publish({
              busy: null,
              state: payload && payload.state ? payload.state : snapshot.state,
              notice: { kind: 'error', text: t('panel.applyFailed', { error }) },
              fault: error,
            })
            return false
          }
          publish({ busy: null, state: payload.state, test: null, revertTo: previousTarget, fault: null })
          if (target !== 'direct' && target !== 'env') {
            const result = await testOnce()
            if (result.ok !== true) {
              const error = result.error || 'HTTP ' + result.status
              publish({
                notice: {
                  kind: 'warn',
                  text: t('panel.autoTestFailed', { error }),
                  revert: previousTarget !== null,
                },
                fault: error,
              })
            }
          }
          return true
        } catch (error) {
          const text = messageOf(error)
          publish({
            busy: null,
            notice: { kind: 'error', text: t('panel.applyFailed', { error: text }) },
            fault: text,
          })
          return false
        }
      }

      /**
       * The dock toggle: proxy on -> direct, direct -> the default proxy.
       * Nothing switches from a list row click.
       */
      async function toggle() {
        const state = snapshot.state
        if (snapshot.busy !== null || state === null) return
        if (isProxyOn(state)) {
          await apply('direct')
          return
        }
        if (!state.defaultId) {
          publish({ open: true, notice: { kind: 'warn', text: t('panel.noDefault') } })
          void refresh()
          return
        }
        await apply(state.defaultId)
      }

      /** Save a proxy; the first one becomes the default. Never switches. */
      async function add(name, url) {
        if (snapshot.busy !== null) return false
        publish({ busy: 'add', notice: null })
        try {
          const payload = await request(API + '/profiles', { action: 'add', name, url })
          if (!payload || payload.ok !== true) {
            let text
            if (payload && payload.code === 'duplicate') text = t('panel.duplicate')
            else if (payload && payload.code === 'duplicate-name') text = t('panel.duplicateName')
            else text = t('panel.addFailed', { error: (payload && payload.error) || 'unknown error' })
            publish({
              busy: null,
              state: payload && payload.state ? payload.state : snapshot.state,
              notice: { kind: 'error', text },
            })
            return false
          }
          publish({ busy: null, state: payload.state, notice: { kind: 'ok', text: t('panel.added') } })
          return true
        } catch (error) {
          publish({ busy: null, notice: { kind: 'error', text: t('panel.addFailed', { error: messageOf(error) }) } })
          return false
        }
      }

      /**
       * Edit a saved proxy. A URL change on the proxy that is currently in use
       * switches immediately; a name-only edit takes effect without switching.
       */
      async function updateProfile(id, name, url) {
        if (snapshot.busy !== null) return false
        const before = snapshot.state
        const previous = before ? before.profiles.find((entry) => entry.id === id) : null
        const wasActive = Boolean(before) && before.active && before.active.kind === 'proxy' && before.active.id === id
        const urlChanged = Boolean(previous) && previous.url !== String(url).trim()
        publish({ busy: 'update', notice: null })
        try {
          const payload = await request(API + '/profiles', { action: 'update', id, name, url })
          if (!payload || payload.ok !== true) {
            let text
            if (payload && payload.code === 'duplicate') text = t('panel.duplicate')
            else if (payload && payload.code === 'duplicate-name') text = t('panel.duplicateName')
            else text = t('panel.updateFailed', { error: (payload && payload.error) || 'unknown error' })
            publish({
              busy: null,
              state: payload && payload.state ? payload.state : snapshot.state,
              notice: { kind: 'error', text },
            })
            return false
          }
          publish({ busy: null, state: payload.state, notice: { kind: 'ok', text: t('panel.updated') } })
          if (wasActive && urlChanged) {
            publish({ fault: null })
            const result = await testOnce()
            if (result.ok !== true) {
              const error = result.error || 'HTTP ' + result.status
              publish({
                notice: { kind: 'warn', text: t('panel.autoTestFailed', { error }) },
                fault: error,
              })
            }
          }
          return true
        } catch (error) {
          publish({ busy: null, notice: { kind: 'error', text: t('panel.updateFailed', { error: messageOf(error) }) } })
          return false
        }
      }

      async function remove(id) {
        if (snapshot.busy !== null) return
        publish({ busy: 'remove', notice: null })
        try {
          const payload = await request(API + '/profiles', { action: 'remove', id })
          if (!payload || payload.ok !== true) {
            const text = payload && payload.code === 'in-use'
              ? t('panel.removeInUse')
              : t('panel.removeFailed', { error: (payload && payload.error) || 'unknown error' })
            publish({ busy: null, notice: { kind: 'error', text } })
            return
          }
          publish({ busy: null, state: payload.state, notice: { kind: 'ok', text: t('panel.removed') } })
        } catch (error) {
          publish({ busy: null, notice: { kind: 'error', text: t('panel.removeFailed', { error: messageOf(error) }) } })
        }
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        getSnapshot() {
          return snapshot
        },
        t,
        setTranslator(fn) {
          translate = typeof fn === 'function' ? fn : (key) => key
        },
        bumpLocale() {
          publish({ localeRevision: snapshot.localeRevision + 1 })
        },
        refresh,
        refreshIfNeeded() {
          if (snapshot.open || snapshot.state === null) void refresh()
        },
        apply,
        add,
        updateProfile,
        remove,
        test,
        toggle,
        open() {
          if (snapshot.open) return
          publish({ open: true })
          void refresh()
        },
        close() {
          if (!snapshot.open) return
          publish({ open: false })
        },
      }
    }

    const store = createStore()

    function useSnapshot() {
      return React.useSyncExternalStore(store.subscribe, store.getSnapshot)
    }

    function describeActive(state) {
      if (!state) return { kind: 'idle', short: '', detail: '' }
      const active = state.active || {}
      if (active.kind === 'proxy') {
        const name = active.name || hostOf(active.url)
        return { kind: 'proxy', id: active.id, name, short: name, detail: active.url || '' }
      }
      if (active.kind === 'env') {
        const launch = state.launchEnv || {}
        const url = launch.httpsProxy || launch.httpProxy
        if (url) return { kind: 'env', short: hostOf(url), detail: url }
      }
      return { kind: 'direct', short: '', detail: '' }
    }

    /** Whether traffic currently goes through a proxy (saved profile or launch environment). */
    function isProxyOn(state) {
      if (!state) return false
      const active = state.active || {}
      if (active.kind === 'proxy') return true
      if (active.kind === 'env') {
        const launch = state.launchEnv || {}
        return Boolean(launch.httpsProxy || launch.httpProxy)
      }
      return false
    }

    /** Pill light: green = proxied, gray = direct, red = a known failure. */
    function lightOf(snap) {
      if (snap.state && snap.state.engine && snap.state.engine.error) return 'error'
      if (snap.fault) return 'error'
      if (snap.test && snap.test.ok === false) return 'error'
      return isProxyOn(snap.state) ? 'on' : 'off'
    }

    /** The name shown on the dock pill: the active proxy, else the default proxy. */
    function dockName(state) {
      if (!state) return store.t('dock.label')
      const active = state.active || {}
      if (active.kind === 'proxy') return active.name || hostOf(active.url)
      const defaultId = state.defaultId
      const profile = defaultId ? state.profiles.find((entry) => entry.id === defaultId) : null
      return profile ? profile.name : store.t('dock.label')
    }

    function GlobeIcon(props) {
      const size = props && props.size ? props.size : 13
      return h('svg', {
        className: 'psw-globe',
        'data-state': props.state,
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        style: { flex: 'none', display: 'block' },
      },
        h('circle', { cx: 8, cy: 8, r: 6.1, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('ellipse', { cx: 8, cy: 8, rx: 2.9, ry: 6.1, stroke: 'currentColor', strokeWidth: 1.1 }),
        h('path', { d: 'M2 8h12', stroke: 'currentColor', strokeWidth: 1.1 }))
    }

    /* ---------------------------------------------------------------- *
     * Surfaces
     * ---------------------------------------------------------------- */

    function DockEntry() {
      const snap = useSnapshot()
      const t = store.t
      const light = lightOf(snap)
      const on = isProxyOn(snap.state)
      const name = dockName(snap.state)
      const busy = snap.busy !== null
      return h('div', { className: 'psw-dock' },
        h('div', { className: 'psw-switch', 'data-state': light },
          h('button', {
            type: 'button',
            className: 'psw-switch-main',
            onClick: () => { void store.toggle() },
            disabled: busy,
            'aria-pressed': on,
            title: name,
            'aria-label': name,
          },
            h(GlobeIcon, { size: 13, state: light }),
            h('span', { className: 'psw-switch-name', title: name }, name)),
          h('button', {
            type: 'button',
            className: 'psw-switch-more',
            onClick: () => store.open(),
            'aria-haspopup': 'dialog',
            'aria-label': t('dock.open'),
            title: t('dock.open'),
          }, h('svg', {
            width: 10,
            height: 10,
            viewBox: '0 0 10 10',
            fill: 'none',
            'aria-hidden': 'true',
          }, h('path', {
            d: 'M2.5 4l2.5 2.5L7.5 4',
            stroke: 'currentColor',
            strokeWidth: 1.3,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          })))))
    }

    function Overlay() {
      const snap = useSnapshot()
      const t = store.t
      React.useEffect(() => {
        if (!snap.open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            store.close()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [snap.open])
      if (!snap.open) return null
      return h('div', {
        className: 'psw-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) store.close()
        },
      },
        h('div', {
          className: 'psw-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('panel.title'),
        }, h(Panel, { overlay: true })))
    }

    function SettingsSection() {
      return h('div', { className: 'psw-section' }, h(Panel, { overlay: false }))
    }

    function Panel(props) {
      const snap = useSnapshot()
      const t = store.t
      const state = snap.state
      const [name, setName] = React.useState('')
      const [url, setUrl] = React.useState('')
      const [confirmId, setConfirmId] = React.useState(null)
      const [editingId, setEditingId] = React.useState(null)
      const [editName, setEditName] = React.useState('')
      const [editUrl, setEditUrl] = React.useState('')

      React.useEffect(() => {
        if (confirmId === null) return undefined
        const timer = setTimeout(() => setConfirmId(null), 5000)
        return () => clearTimeout(timer)
      }, [confirmId])

      const active = describeActive(state)
      const busy = snap.busy !== null

      const startEdit = (profile) => {
        setConfirmId(null)
        setEditingId(profile.id)
        setEditName(profile.name)
        setEditUrl(profile.url)
      }

      const cancelEdit = () => {
        setEditingId(null)
        setEditName('')
        setEditUrl('')
      }

      const saveEdit = async (profile) => {
        const trimmed = editUrl.trim()
        if (trimmed === '' || busy) return
        const ok = await store.updateProfile(profile.id, editName.trim(), trimmed)
        if (ok) cancelEdit()
      }

      const blocks = []

      blocks.push(h('div', { className: 'psw-head', key: 'head' },
        h('div', { className: 'psw-head-main' },
          h('div', { className: 'psw-title' }, t('panel.title')),
          h('div', { className: 'psw-sub' }, t('panel.subtitle'))),
        props.overlay
          ? h('button', {
              type: 'button',
              className: 'psw-icon',
              onClick: () => store.close(),
              'aria-label': t('panel.close'),
              title: t('panel.close'),
            }, '\u00d7')
          : null))

      if (!state) {
        blocks.push(h('div', { className: 'psw-placeholder', key: 'placeholder' },
          h('span', null, snap.phase === 'error' && snap.error ? t('panel.loadFailed', { error: snap.error }) : t('panel.loading')),
          snap.phase === 'error'
            ? h('button', { type: 'button', className: 'psw-link', onClick: () => { void store.refresh() } }, t('panel.retry'))
            : null))
      } else {
        blocks.push(h('div', { className: 'psw-status', key: 'status' },
          h('div', { className: 'psw-status-text' },
            h('div', { className: 'psw-status-label' }, t('panel.current')),
            h('div', { className: 'psw-status-value', title: active.detail || '' },
              active.kind === 'proxy'
                ? active.short + ' · ' + active.detail
                : active.kind === 'env'
                  ? t('panel.envActive', { url: active.detail })
                  : t('panel.directActive'))),
          snap.busy === 'apply' ? h('span', { className: 'psw-busy' }, t('panel.applying')) : null))

        if (state.profiles.length === 0) {
          blocks.push(h('div', { className: 'psw-placeholder', key: 'empty' },
            h('span', null, t('panel.empty'))))
        } else {
          const rows = state.profiles.map((profile) => {
            const isActive = active.kind === 'proxy' && active.id === profile.id

            if (editingId === profile.id) {
              return h('form', {
                key: profile.id,
                className: 'psw-option psw-option-editing',
                onSubmit: (event) => {
                  event.preventDefault()
                  void saveEdit(profile)
                },
              },
                h('div', { className: 'psw-edit-row' },
                  h('input', {
                    className: 'psw-input psw-input-name',
                    value: editName,
                    maxLength: 48,
                    placeholder: t('panel.namePlaceholder'),
                    'aria-label': t('panel.namePlaceholder'),
                    onChange: (event) => setEditName(event.target.value),
                  }),
                  h('input', {
                    className: 'psw-input psw-input-url',
                    value: editUrl,
                    placeholder: t('panel.urlPlaceholder'),
                    'aria-label': t('panel.urlLabel'),
                    spellCheck: false,
                    autoCapitalize: 'off',
                    autoCorrect: 'off',
                    onChange: (event) => setEditUrl(event.target.value),
                  })),
                h('div', { className: 'psw-edit-actions' },
                  h('button', {
                    type: 'button',
                    className: 'psw-link',
                    disabled: busy,
                    onClick: cancelEdit,
                  }, t('panel.cancel')),
                  h('button', {
                    type: 'submit',
                    className: 'psw-primary psw-small',
                    disabled: busy || editUrl.trim() === '',
                  }, t('panel.save'))))
            }

            return h('div', {
              key: profile.id,
              className: 'psw-option',
              'data-active': String(isActive),
            },
              h('button', {
                type: 'button',
                className: 'psw-option-main',
                disabled: busy || isActive,
                onClick: () => { void store.apply(profile.id) },
              },
                h('span', { className: 'psw-radio', 'data-checked': String(isActive), 'aria-hidden': 'true' }),
                h('span', { className: 'psw-option-text' },
                  h('span', { className: 'psw-option-name' },
                    h('span', { className: 'psw-option-name-text', title: profile.name }, profile.name),
                    isActive ? h('span', { className: 'psw-badge' }, t('panel.active')) : null),
                  h('span', { className: 'psw-option-hint', title: profile.url }, profile.url))),
              h('span', { className: 'psw-option-actions' },
                h('button', {
                  type: 'button',
                  className: 'psw-link',
                  disabled: busy,
                  onClick: () => startEdit(profile),
                }, t('panel.edit')),
                confirmId === profile.id
                  ? [
                      h('button', {
                        key: 'confirm',
                        type: 'button',
                        className: 'psw-link psw-danger',
                        disabled: busy || isActive,
                        title: isActive ? t('panel.inUse') : undefined,
                        onClick: () => {
                          setConfirmId(null)
                          void store.remove(profile.id)
                        },
                      }, t('panel.confirmDelete')),
                      h('button', {
                        key: 'cancel',
                        type: 'button',
                        className: 'psw-link',
                        onClick: () => setConfirmId(null),
                      }, t('panel.cancel')),
                    ]
                  : h('button', {
                      type: 'button',
                      className: 'psw-link',
                      disabled: busy || isActive,
                      title: isActive ? t('panel.inUse') : undefined,
                      onClick: () => setConfirmId(profile.id),
                    }, t('panel.delete'))))
          })
          blocks.push(h('div', { className: 'psw-list', 'aria-label': t('panel.title'), key: 'list' }, rows))
        }

        blocks.push(h('form', {
          className: 'psw-add',
          key: 'add',
          onSubmit: async (event) => {
            event.preventDefault()
            const trimmed = url.trim()
            if (trimmed === '' || busy) return
            const ok = await store.add(name.trim(), trimmed)
            if (ok) {
              setName('')
              setUrl('')
            }
          },
        },
          h('div', { className: 'psw-add-title' }, t('panel.addTitle')),
          h('div', { className: 'psw-add-row' },
            h('input', {
              className: 'psw-input psw-input-name',
              value: name,
              maxLength: 48,
              placeholder: t('panel.namePlaceholder'),
              'aria-label': t('panel.namePlaceholder'),
              onChange: (event) => setName(event.target.value),
            }),
            h('input', {
              className: 'psw-input psw-input-url',
              value: url,
              placeholder: t('panel.urlPlaceholder'),
              'aria-label': t('panel.urlLabel'),
              spellCheck: false,
              autoCapitalize: 'off',
              autoCorrect: 'off',
              onChange: (event) => setUrl(event.target.value),
            })),
          h('div', { className: 'psw-add-actions' },
            h('button', {
              className: 'psw-primary',
              type: 'submit',
              disabled: busy || url.trim() === '',
            }, snap.busy === 'add' ? t('panel.adding') : t('panel.addSubmit')))))

        blocks.push(h('div', { className: 'psw-footer', key: 'footer' },
          h('button', {
            className: 'psw-secondary',
            type: 'button',
            disabled: busy,
            onClick: () => { void store.test() },
          }, snap.busy === 'test' ? t('panel.testing') : t('panel.test')),
          snap.test
            ? h('span', {
                className: 'psw-test',
                'data-ok': String(snap.test.ok === true),
                title: snap.test.target || '',
              }, snap.test.ok === true
                ? t('panel.testOk', { status: snap.test.status, ms: snap.test.ms })
                : t('panel.testFail', { error: snap.test.error || '' }))
            : null))

        if (state.engine && state.engine.error) {
          blocks.push(h('div', { className: 'psw-notice', 'data-kind': 'error', key: 'engine-error' },
            h('span', { className: 'psw-notice-text' }, t('panel.engineError', { error: state.engine.error }))))
        } else if (state.engine && state.engine.note) {
          blocks.push(h('div', { className: 'psw-notice', 'data-kind': 'warn', key: 'engine-note' },
            h('span', { className: 'psw-notice-text' }, t('panel.engineNote', { note: state.engine.note }))))
        }
      }

      if (state && snap.phase === 'error' && snap.error) {
        blocks.push(h('div', { className: 'psw-notice', 'data-kind': 'error', key: 'refresh-error' },
          h('span', { className: 'psw-notice-text' }, t('panel.loadFailed', { error: snap.error })),
          h('button', {
            type: 'button',
            className: 'psw-link',
            disabled: busy,
            onClick: () => { void store.refresh() },
          }, t('panel.retry'))))
      }

      if (snap.notice) {
        blocks.push(h('div', { className: 'psw-notice', 'data-kind': snap.notice.kind, key: 'notice' },
          h('span', { className: 'psw-notice-text' }, snap.notice.text),
          snap.notice.revert && snap.revertTo
            ? h('button', {
                type: 'button',
                className: 'psw-link',
                disabled: busy,
                onClick: () => { void store.apply(snap.revertTo) },
              }, t('panel.revert'))
            : null))
      }

      if (state && state.warnings && state.warnings.length > 0) {
        blocks.push(h('details', { className: 'psw-diag', key: 'diagnostics' },
          h('summary', null, t('panel.diagnostics', { count: state.warnings.length })),
          h('ul', null, state.warnings.slice(-5).map((warning, index) => h('li', { key: index }, warning)))))
      }

      blocks.push(h('div', { className: 'psw-hint', key: 'hint' }, t('panel.hint')))

      return h('div', { className: 'psw-panel' }, blocks)
    }

    /* ---------------------------------------------------------------- *
     * Styles
     * ---------------------------------------------------------------- */

    const CSS = [
      '.psw-dock{display:flex;align-items:center;min-height:22px}',
      '.psw-switch{display:inline-flex;align-items:stretch;height:22px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;overflow:hidden}',
      '.psw-switch-main{display:inline-flex;align-items:center;gap:6px;height:100%;max-width:228px;padding:0 8px 0 9px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background .15s,color .15s}',
      '.psw-switch-main:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.psw-switch-main:disabled{cursor:default;opacity:.6}',
      '.psw-switch-main:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.psw-switch[data-state="on"] .psw-switch-main{color:var(--dsw-alias-label-primary)}',
      '.psw-switch-name{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.psw-switch-more{display:inline-flex;align-items:center;justify-content:center;width:20px;flex:none;padding:0;border:none;border-left:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.psw-switch-more:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.psw-switch-more:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.psw-globe{color:var(--dsw-alias-label-secondary);transition:color .15s}',
      '.psw-globe[data-state="on"]{color:var(--dsw-alias-state-success-primary)}',
      '.psw-globe[data-state="error"]{color:var(--dsw-alias-state-error-primary)}',
      '.psw-backdrop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.32);pointer-events:auto}',
      '.psw-dialog{width:min(520px,100%);max-height:min(82vh,760px);overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 24px 64px rgba(0,0,0,.28);font-size:13px;line-height:1.5}',
      '.psw-panel{padding:18px 18px 16px}',
      '.psw-section{max-width:760px;padding:2px 0 16px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}',
      '.psw-section .psw-panel{padding:0}',
      '.psw-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}',
      '.psw-head-main{flex:1;min-width:0}',
      '.psw-title{font-size:16px;font-weight:650;letter-spacing:.01em}',
      '.psw-sub{margin-top:2px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.psw-icon{flex:none;width:26px;height:26px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:18px;line-height:1;cursor:pointer}',
      '.psw-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.psw-status{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.psw-status-text{flex:1;min-width:0}',
      '.psw-status-label{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.psw-status-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}',
      '.psw-busy{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.psw-placeholder{display:flex;align-items:center;gap:10px;padding:12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.psw-list{display:flex;flex-direction:column;gap:6px;margin:6px 0 4px}',
      '.psw-option{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.psw-option[data-active="true"]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.psw-option-editing{flex-direction:column;align-items:stretch;gap:8px}',
      '.psw-option-main{display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:0;border:none;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.psw-option-main:disabled{cursor:default}',
      '.psw-option-main:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:8px}',
      '.psw-option-name{display:flex;align-items:center;gap:4px;min-width:0;font-weight:550}',
      '.psw-option-name-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.psw-badge{flex:none;padding:0 5px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:500;line-height:14px;display:inline-block}',
      '.psw-radio{flex:none;width:16px;height:16px;border:1.5px solid var(--dsw-alias-border-l2);border-radius:50%;display:flex;align-items:center;justify-content:center;box-sizing:border-box}',
      '.psw-radio[data-checked="true"]{border-color:var(--dsw-alias-state-business-primary)}',
      '.psw-radio[data-checked="true"]::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}',
      '.psw-option-text{display:flex;flex-direction:column;min-width:0;flex:1}',
      '.psw-option-hint{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.psw-option-actions{display:flex;align-items:center;gap:6px;flex:none}',
      '.psw-edit-row{display:flex;gap:8px}',
      '.psw-edit-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:8px}',
      '.psw-link{padding:0;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}',
      '.psw-link:hover{color:var(--dsw-alias-label-primary)}',
      '.psw-link:disabled{opacity:.55;cursor:default}',
      '.psw-danger{color:var(--dsw-alias-state-error-primary)}',
      '.psw-add{margin-top:14px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.psw-add-title{font-weight:600;margin-bottom:8px}',
      '.psw-add-row{display:flex;gap:8px}',
      '.psw-input{min-width:0;height:30px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none;box-sizing:border-box}',
      '.psw-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.psw-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.psw-input-name{flex:0 0 132px}',
      '.psw-input-url{flex:1}',
      '.psw-add-actions{display:flex;justify-content:flex-end;margin-top:8px}',
      '.psw-primary{height:30px;padding:0 14px;border:none;border-radius:8px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font:inherit;font-size:12px;font-weight:600;cursor:pointer}',
      '.psw-primary:disabled{opacity:.5;cursor:default}',
      '.psw-primary.psw-small{height:26px;padding:0 12px}',
      '.psw-secondary{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.psw-secondary:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.psw-secondary:disabled{opacity:.55;cursor:default}',
      '.psw-footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}',
      '.psw-test{font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.psw-test[data-ok="true"]{color:var(--dsw-alias-state-success-primary)}',
      '.psw-test[data-ok="false"]{color:var(--dsw-alias-state-error-primary)}',
      '.psw-notice{display:flex;align-items:center;gap:10px;margin-top:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;font-size:12px}',
      '.psw-notice[data-kind="error"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.psw-notice[data-kind="warn"]{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}',
      '.psw-notice[data-kind="ok"]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.psw-notice-text{flex:1;min-width:0;overflow-wrap:anywhere}',
      '.psw-diag{margin-top:10px;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.psw-diag summary{cursor:pointer}',
      '.psw-diag ul{margin:6px 0 0;padding-left:18px}',
      '.psw-diag li{overflow-wrap:anywhere;margin:2px 0}',
      '.psw-hint{margin-top:10px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
      '@media (max-width:560px){.psw-add-row,.psw-edit-row{flex-direction:column}.psw-input-name{flex:none}}',
    ].join('\n')

    /* ---------------------------------------------------------------- *
     * Plugin
     * ---------------------------------------------------------------- */

    const inject = ['slots', 'locale']

    function apply(ctx) {
      store.setTranslator(ctx.locale.bind(NS))

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'proxy-switcher: dictionaries')
      ctx.effect(() => ctx.locale.subscribe(() => store.bumpLocale()), 'proxy-switcher: locale subscription')

      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = NS
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => {
          tag.remove()
        }
      }, 'proxy-switcher: styles')

      void store.refresh()

      ctx.effect(() => {
        const disposers = [
          ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: 'proxy',
            order: 25,
            label: () => store.t('settings.nav'),
          }, SettingsSection)),
          ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'proxy',
            order: 6,
            label: () => store.t('dock.label'),
          }, DockEntry)),
          ctx.slots.inject('shell.overlay', () => ctx.slots.register({
            name: 'shell.overlay',
            id: 'proxy-panel',
            order: 6,
          }, Overlay)),
        ]
        return () => {
          for (const dispose of disposers.splice(0)) {
            try {
              dispose()
            } catch (error) {
              // The owning slot already collapsed; nothing left to release.
            }
          }
        }
      }, 'proxy-switcher: slots')

      ctx.effect(() => {
        const onFocus = () => store.refreshIfNeeded()
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
      }, 'proxy-switcher: refresh on focus')
    }

    return { inject, apply }
  },
})
