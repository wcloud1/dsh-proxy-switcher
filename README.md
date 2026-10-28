# 代理切换（dsh-proxy-switcher）

在 DSH Web 界面里一键切换 Harness 进程的出站 HTTP 代理：**直连 ⇄ 当前代理**。切换会同时作用于模型请求（DeepSeek API）、`web_fetch` / `web_search`，以及由本进程派生的终端命令（`curl`、`git` 等读取代理环境变量的程序）。

> 本项目为非官方插件，仅供学习、研究与个人参考使用；请先阅读文末的[免责声明](#免责声明)。

## 界面

**输入框下方的「代理」按钮组**

- 左侧主按钮：显示**代理名称**（没有代理时显示「代理」），点击在「直连」与「当前代理」之间切换。名称过长会以省略号截断，网络球与右侧箭头始终保留位置。
- 鼠标悬停在主按钮上只显示完整的代理名称。
- 右侧小箭头：打开代理管理面板。
- 网络球颜色即状态：
  - 灰色：直连；
  - 绿色：代理已开启（保存的代理或启动环境代理）；
  - 红色：最近一次切换或连通性测试失败。
- 没有任何代理时点击主按钮会打开面板并提示先添加代理。

**设置 → 网络代理**

- 代理列表：**点击某一项即启用该代理**（开启状态点击另一项会立即切换并自动测试）。
- 每项都可以「编辑」名称和地址，或「删除」。
- 代理地址和代理名称都必须唯一：重复地址或重复名称都会被拒绝并提示，不会覆盖已有配置。
- 编辑正在使用的代理地址会立即切换并自动测试；只改名称不会影响连接。
- 正在使用的代理，其「删除」按钮置灰；需要先切回直连才能删除。
- 添加代理只保存、不切换；点击列表项才会启用。
- 「测试当前连接」用当前生效的路由请求一次测试地址，失败时网络球变红。

其他行为：

- 支持 `http://` 与 `https://` 代理（含 `user:pass@`）；SOCKS / PAC 不受支持，会被明确拒绝。
- 切换前会探测代理端口；端口不可达则拒绝切换（配置仍会保留，方便代理启动后再启用）。
- 切换到代理后会自动做一次连通性测试，失败时给出提示和「回滚」。

## 工作方式

- 复用 Harness 自带的 `@deepseek-ai/dsh-http-proxy`：用与启动器相同的策略解析器重新安装全局 `undici` dispatcher，因此 `fetch`、LLM 栈与 `web-fetch-http` 看到的是同一套路由答案。若该包不可达，会退化为插件内自带的 `undici` 转发实现，并在面板中标注（此时 `web_fetch` 可能仍走直连）。
- 回环地址（`localhost`、`127.0.0.0/8`、`::1`）始终直连，不会把本机 Web UI 或本地服务绕进代理。
- 选择持久化在 `$DSH_HOME/proxy-switcher.json`，插件重新激活时自动恢复；若上次保存的代理已不可达，会回退到「跟随启动环境」并提示。

```json
{
  "version": 2,
  "selected": "env",
  "defaultId": null,
  "profiles": [],
  "testUrl": "https://example.com/"
}
```

- `selected`：当前实际路由（`direct` / `env` / 代理 id），由主按钮或点击列表项写入。
- `defaultId`：主按钮从直连恢复时启用的代理 id，等于最后一次成功启用的代理。
- 未在界面切换过时保持 `env`，插件不安装任何东西，启动前导出的 `HTTPS_PROXY` 等变量保持原样。

## 本地 HTTP 接口

客户端通过仅限本机回环的 JSON 路由访问 Host 半侧：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-proxy-switcher/state` | 当前选择、代理列表、生效状态、诊断 |
| POST | `/api/dsh-proxy-switcher/apply` | `{target}` 切换：`direct` / `env` / 代理 id（代理 id 会同时更新 `defaultId`） |
| POST | `/api/dsh-proxy-switcher/profiles` | `{action:"add",name,url}`、`{action:"update",id,name,url}`、`{action:"remove",id}`；重复地址返回 `code:"duplicate"`，重复名称返回 `code:"duplicate-name"`，删除使用中的代理返回 `code:"in-use"` |
| POST | `/api/dsh-proxy-switcher/test` | `{url?}` 用当前路由测试连通性 |

路由校验回环 socket、回环 `Host`、拒绝转发头与跨站来源。

## 限制

- 代理是**进程级**的，影响所有会话；子进程只有在启动时读取环境变量才会继承（Node 22.21+ / 24+ 的 `NODE_USE_ENV_PROXY` 由 Harness 自身处理）。
- 不支持按域名分流（除回环外全部走代理）；需要分流时请在代理软件里配置规则。
- 不支持 SOCKS / PAC / 系统代理自动探测，请填 HTTP(S) 监听端口（例如 Clash `http://127.0.0.1:7890`、v2rayN `http://127.0.0.1:10809`）。
- 卸载插件时会恢复启动时的代理策略；`$DSH_HOME/proxy-switcher.json` 不会被删除。

## 环境要求

- DSH `>= 0.2.1-rc.3`（见 `package.json` 的 `dsh.engines`）。
- 纯 ESM JavaScript，无需构建、无额外运行时依赖。

## 目录结构

```text
dsh-proxy-switcher/
├── package.json          # 清单：bundle patch、dsh.client、显示元数据
├── cordis.patch.yml      # 把插件行插入 profile
├── index.js              # Host：代理引擎、状态、回环 JSON 路由
├── client.js             # Client：胶囊、管理弹窗、设置页
├── icon.svg              # 插件管理器图标
├── locale/
│   ├── zh.json           # 显示名称/描述
│   └── en.json
├── README.md
├── LICENSE
└── .gitignore
```

## 安装

通过 Plugin Manager 把本目录（或发布后的包 / git 地址）安装为 bundle；本地目录安装会在 profile 的 `node_modules` 里创建指向本目录的 junction，**移动或删除本目录后需要重新安装**。安装完成后确认 `dsh-proxy-switcher` 已启用；首次使用若胶囊未出现，刷新一次页面。手动安装：

```text
plugin_manager install_bundle target=<本目录绝对路径或包 spec>
```

## 卸载

在「设置 → 插件」中禁用或移除 `dsh-proxy-switcher`；插件卸载时会先恢复原代理策略。

## 免责声明

- 本项目为个人开发的非官方插件，**仅供学习、研究与技术参考**，与 DeepSeek 官方无关。
- 插件会修改 Harness 进程的全局出站代理设置，可能影响模型请求、网页抓取和终端网络访问；请自行评估风险，并在可控环境中使用。
- 代理地址、账号及网络环境由使用者自行提供并负责。请遵守所在地法律法规及所使用的网络服务条款，勿将本项目用于任何违法或未经授权的用途。
- 软件按“现状”提供，不保证功能完整、稳定或适用于特定目的。作者不对因使用或无法使用本项目造成的任何直接或间接损失承担责任。
- 请勿在仓库或配置中提交代理账号、密钥等敏感信息。

This is an unofficial project provided for learning and reference only. Use at your own risk.

## License

[MIT](LICENSE)
