# Reveric 0.10.1 Windows 开发版安装清单

将完整项目复制到另一台 Windows x64 电脑时，保留 [run-windows.cmd](run-windows.cmd)、[.fvmrc](.fvmrc)、`pubspec.lock` 和 `third/`。如果原电脑已经成功构建，可一并复制下文列出的三个原生依赖。其中，深度估计运行时的原下载地址在本次配置时返回了 404。

以下版本和步骤来自 2026 年 11 月 19 日成功启动的 Windows 环境。这套流程尚未在另一台电脑上完整复测。

## 工具和补装清单

| 工具或组件 | 本次配置 | 新电脑上的操作 |
| --- | --- | --- |
| Windows 开发人员模式 | 本次开启 | 在 Windows 设置中搜索并开启，供 Flutter 创建插件符号链接。[微软说明](https://learn.microsoft.com/zh-cn/windows/advanced-settings/developer-mode) |
| Git for Windows | 原有，实测 `2.49.0` | 安装 x64 版，确认 PowerShell 能执行 `git --version`。[下载](https://git-scm.com/download/win) |
| Python | 原有，实测 `3.12.8` | 按项目建议安装 Python `3.12.x`，安装时添加到 PATH。[下载](https://www.python.org/downloads/windows/) |
| Visual Studio 2022 Build Tools | 原有，实测 `17.14`，Windows SDK 为 `10.0.26100.0`，CMake 为 `3.31.6` | 在 Visual Studio Installer 中选择 **使用 C++ 的桌面开发**，确认包含 **MSVC v143 x86/x64、Windows SDK、C++ CMake 工具**。[VS 2022 下载](https://learn.microsoft.com/en-us/visualstudio/releases/2022/release-history) |
| C++ ATL | 本次补装 | 在 Visual Studio Installer 的「单个组件」中勾选 **C++ v14.44 (17.14) ATL for v143 build tools (x86 & x64)**。组件 ID 为 `Microsoft.VisualStudio.Component.VC.14.44.17.14.ATL`。[微软组件清单](https://learn.microsoft.com/en-us/visualstudio/install/workload-component-id-vs-build-tools?view=vs-2022) |
| FVM | 本次安装 `4.3.2` | 下载 `fvm-4.3.2-windows-x64.zip`，解压到 `%LOCALAPPDATA%\FVM`。确认可执行文件位于 `%LOCALAPPDATA%\FVM\fvm\fvm.exe`，启动脚本会查找这个位置。[FVM 发布页](https://github.com/btwld/fvm/releases/tag/4.3.2) |
| Flutter 和 Dart | 本次通过 FVM 安装 | Flutter 固定为 `.fvmrc` 中的提交 `0b771a584214b44aa1f94f9707f2756207356f41`。Dart 随 Flutter SDK 安装。[项目开发指南](DEVELOPMENT.md#环境与版本) |
| Rustup 和 Rust | 本次安装 Rust `1.99.1` 和 `1.97.1` | 安装 Windows x64 版 Rustup。下文通过 Rustup 安装项目指定的两个版本，分别用于 FJS 原生库和剪贴板插件 `super_native_extensions`。[Rustup 下载](https://rustup.rs/) |

启动脚本已包含 MSVC 的 `/utf-8` 编译参数，用于解决中文 Windows 上的源码编码报错。迁移时复制当前版本的 `.cmd` 即可带上这项修正。

## 新电脑安装顺序

### 1. 安装系统工具

按清单安装工具、补齐 ATL 并开启开发人员模式。重新打开 PowerShell，进入包含 `.fvmrc` 和 `run-windows.cmd` 的项目根目录。

### 2. 安装项目锁定的 SDK 和依赖

```powershell
$env:Path = "$env:LOCALAPPDATA\FVM\fvm;$env:USERPROFILE\.cargo\bin;$env:Path"

fvm install --skip-pub-get
fvm use --skip-pub-get
fvm flutter --version

rustup toolchain install 1.99.1 --profile minimal
rustup toolchain install 1.97.1 --profile minimal

fvm flutter doctor -v
fvm flutter devices
fvm flutter pub get
```

确认 `fvm flutter --version` 显示的 Framework revision 以 `0b771a5842` 开头，`doctor` 的 Windows 和 Visual Studio 项通过，`devices` 列出了 Windows。[Flutter Windows 环境验证](https://docs.flutter.dev/platform-integration/windows/setup)

### 3. 为剪贴板插件指定 Rust 1.97.1

等 `fvm flutter pub get` 成功后，在项目根目录执行以下命令。覆盖设置只对插件的缓存目录生效，可避免 Windows 构建下载插件为其他平台声明的 Rust 目标。

```powershell
$config = Get-Content -Raw '.dart_tool\package_config.json' | ConvertFrom-Json
$plugin = $config.packages | Where-Object name -eq 'super_native_extensions'
$pluginRust = Join-Path ([uri]$plugin.rootUri).LocalPath 'rust'
rustup override set 1.97.1 --path $pluginRust
```

### 4. 放好原生依赖并启动开发版

将下表的文件或目录从已构建成功的旧电脑复制到新电脑项目中的同一相对路径。

| 项目内相对路径 | 用途 |
| --- | --- |
| `build/depth-native/product-windows/` 整个目录 | 深度估计运行时，包含 `reveric-depth-native.exe`、ONNX Runtime `1.31.0` 的 DLL 和许可证。本次原 ZIP 下载失败后，使用 Microsoft 同版本的 NuGet 包构建并测试了此目录。 |
| `build/windows/x64/plugins/ffmpeg_kit_flutter_new/ffmpeg-kit/` 整个目录 | FFmpegKit `8.1.2 full-gpl`。复制时保留 `bin/.ffmpegkit_variant`，构建可复用已校验的包。[FFmpegKit 发布页](https://github.com/sk3llo/ffmpeg_kit_flutter/releases/tag/8.1.2-full-gpl) |
| `third/fvp/windows/mdk-sdk-windows-x64-vs2026.7z` | 视频播放插件的 MDK SDK `0.39.0`。构建会校验并解压该文件。[MDK 发布页](https://github.com/wang-bin/mdk-sdk/releases/tag/v0.39.0) |

在新电脑上重新生成 `.fvm/`、`.dart_tool/`、`windows/flutter/ephemeral/` 和 `build/windows/x64/CMakeCache.txt`，这些文件可能记录了旧电脑的绝对路径。Dart 包、Cargo 包、Flutter Windows 引擎和 SQLite 原生库会在安装或首次构建时下载。

双击 [run-windows.cmd](run-windows.cmd)。启动成功后会打开标题为「幻界」的窗口。以后修改 Flutter 代码，可在启动终端按 `r` 进行热重载。

如果 Flutter 引擎下载超时，可在项目根目录的 PowerShell 中临时设置镜像，再从同一窗口启动。本次 Windows 引擎下载使用了这个镜像。[Flutter 镜像说明](https://docs.flutter.dev/community/china)

```powershell
$env:FLUTTER_STORAGE_BASE_URL = 'https://storage.flutter-io.cn'
.\run-windows.cmd
```
