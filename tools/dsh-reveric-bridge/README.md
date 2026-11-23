# dsh-reveric-bridge

把 Reveric（桌面写作工作台）应用内的**本地调试端点**接进 DeepSeek Harness，让 Harness 里的智能体能直接操作 Reveric 项目：

- `reveric_status` — 读作品清单、图像模型状态
- `reveric_generate_avatars` — 批量生成角色头像并写回作品
- `reveric_check` — 剧本结构/统计一致性体检（只读）
- `reveric_screenplay_replace` — 正文字面批量替换（默认 dry-run，写前自动备份）
- `reveric_agent` — 让 Reveric 内置智能体跑一轮任务（默认只读）

## 前置条件（很重要）

1. **对方必须有一份含调试端点的 Reveric**。端点代码在 Reveric 仓库的 `lib/debug/control_server.dart`，只在 **debug 构建**里启动；正式发布包没有这个端点，插件会直接报「端点未运行」。
2. Reveric 以 debug 构建运行后，会在下面位置写端点描述文件（含随机端口与 token）：
   - Windows：`%APPDATA%\ai.reveric.debug\Reveric\debug\control.json`
   - macOS：`~/Library/Application Support/ai.reveric.debug/Reveric/debug/control.json`
3. 端点只监听 `127.0.0.1`，token 随 Reveric 进程退出失效；插件每次调用都会重新读取该文件。

## 安装

**方式 A：Plugins 页面安装本地目录（推荐）**

1. 解压本包到任意目录（路径不要有空格问题，保持整个目录一起）。
2. 打开 DSH → **Plugins** → **Add plugin** → 选择这个目录（含 `package.json` 的那层）。
3. 安装后插件行应显示 `dsh-reveric-bridge`，版本 `0.2.1`；新工具通常在**新会话**中可用。

**方式 B：命令行 / 让 Harness 自己装**

```text
plugin_manager action=install_bundle target=<解压后的绝对目录>
```

如果之前装过旧版本，需先 `remove_bundle` 再 `install_bundle`，否则返回 `already-installed`、不会加载新的 JS 模块。

## 使用

装好后直接对 Harness 说：

- 「Reveric 里有哪些作品？」
- 「体检一下双未来第 1–10 集」
- 「把第 4 集的『苏主管』统一改成『苏工』」（会先 dry-run 给你看命中项）
- 「用 3D 半写实 CG 给刘工和魏师傅生成头像」（生图会花钱，先 dryRun）

## 安全与限制

- 这些工具能**修改对方的 Reveric 项目数据**、并**消耗模型额度**；生图/批量操作前请先 dry-run。
- `reveric_agent` 的 `readOnly` 是提示词层面的约束，不是硬沙箱。
- 替换是字面匹配（不支持正则），只改正文元素文本，不改场头地点/时间和人物姓名。
- 端点未运行、Reveric 未启动调试构建时，工具会返回明确错误，不会静默失败。
