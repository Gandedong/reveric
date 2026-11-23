# Reveric 桥接

把 Reveric（桌面写作工作台）应用内的**本地调试端点**接到 DSH，让模型可以用工具直接操作项目，不再依赖窗口焦点或人工点击。

## 前置条件

1. Reveric 需要以 **debug 构建**运行（release 构建不含调试端点）。
2. Reveric 启动后会在下面这个位置写端点描述文件：

   ```
   %APPDATA%\ai.reveric.debug\Reveric\debug\control.json
   ```

   内容形如 `{ "port": 60024, "token": "…", "pid": 19936 }`；端点只监听 `127.0.0.1`，token 随进程退出失效。
3. 端点默认目录与 Reveric debug 包一致（`%APPDATA%\ai.reveric.debug\Reveric`）。自定义位置可在插件配置里设置 `supportDirectory`。

## 工具

### `reveric_status`

读取作品清单、图像模型是否就绪、任务数量。只读，不花钱。

### `reveric_generate_avatars`

按角色生成头像并写回作品。参数：

- `workId`（必填）：作品 ID，例如 `scr_40YRGM`
- `names` / `characterIds`：指定角色；都不给时，给该作品内**还没有头像**的角色全部生成
- `style`：`cg3d`（默认，3D 半写实 CG）、`cinematic`、`illustration`、`eastern`、`minimal`，或直接给风格描述
- `dryRun`：只返回提示词与数量，不调用模型、不产生费用（建议先跑一次）
- `apply`：默认 `true`，生成成功后写回角色头像；`false` 时只入库

提示词由角色档案（年龄 / 性别 / 外貌 / 身份 / 性格）自动拼接，构图固定为「头肩特写」。

### `reveric_agent`

把一句自然语言任务交给 Reveric 内置智能体跑一轮，返回它的回答。参数：

- `workId`、`message`（必填）
- `mode`：`readOnly`（默认，seed 里明确「只读检查」）或 `write`
- `timeoutSeconds`：默认 180，最大 900

## 限制与注意

- **只在 Reveric 运行时可用**；未运行会直接报错并提示启动 debug 构建。
- 生图会**消耗模型额度**：先用 `dryRun` 确认提示词与数量，再真正执行。
- `readOnly` 是提示词层面的约束，不是硬沙箱：需要硬隔离时用 DSH 自己的工具策略或在 `write` 前人工确认。
- 批量能力目前覆盖：单张/批量头像、只读检查与智能体任务。剧本批量写、批量检查报告、视频批量生成属于后续阶段，尚未在此插件里提供。
- 端点文件被其他进程替换（例如 Reveric 重启）后，下一次调用会读取新端口与 token，无需重装插件。

### `reveric_check`

批量体检一段剧本，只读、不花钱。检查项：同一集内 `sort_order` 重复、每场是否恰好一个场头、空场、场次统计（页数/台词数/字数）是否与元素不一致、对白/括注缺少角色提示、角色提示未进本场出场名单。

参数：`workId`（必填）、`episodeNumbers`（可选，省略=全部）。

### `reveric_screenplay_replace`

在一段剧本的**正文元素**（动作、对白、括注、字幕）里做字面文本批量替换。

参数：`workId`、`find`（必填）、`replace`、`episodeNumbers`（可选）、`apply`（默认 `false`）。

- 默认 dry-run：返回命中条数、按场的命中数量与前后文片段。
- `apply: true` 才会写入；写入走 Reveric 的 `ScreenplayService.writeElements`（重算统计与出场名单），**写前用 `VACUUM INTO` 备份内容库**，返回备份路径。
