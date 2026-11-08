# 八局审计智能体

[English](README.md) | 中文

八局审计智能体（CSCEC8B Audit Agent）是中国建筑第八工程局有限公司的内部审计辅助工具。它读取本地文件夹中的审计底稿和原始资料，借助 DeepSeek 模型服务进行分析，帮助审计人员起草审计发现、核对数据和整理证据。

它基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 构建，这是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness。命令、软件包和配置目录沿用上游的 `dsh` 名称。

## 使用须知

对话内容和你提供给智能体的文件会发送到 DeepSeek 模型服务进行分析。智能体给出的结论仅供参考，请结合审计底稿和原始资料复核后再采用。

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

<a id="desktop-app"></a>

### 桌面应用

桌面应用支持 Windows 和 macOS。安装管理员分发的安装包，打开八局审计智能体，在欢迎页输入 DeepSeek API Key，然后选择一个本地文件夹作为工作区。更新通过人工分发，自动更新已关闭。

<a id="command-line"></a>

### 命令行

桌面应用可以从应用菜单安装 `dsh` 命令。运行 `dsh --help` 可列出可用的 profile 和选项；完整输出见 [CLI 帮助](docs/cli-help.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/wuwei3618/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm run start:desktop
```

`pnpm run build` 会准备仓库产物。`pnpm run start:desktop` 会直接用这些产物启动桌面应用，不会重新构建。

<a id="package-the-desktop-app"></a>

### 打包桌面应用

在目标平台上构建未签名的内部安装包：

```sh
pnpm run package:desktop:win:x64:unsigned
pnpm run package:desktop:mac:arm64:unsigned
pnpm run package:desktop:mac:x64:unsigned
```

前置条件和产物位置见[桌面打包指南](apps/desktop/packaging/README.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

`pnpm run dev:desktop` 会构建并启动桌面应用，`make help` 列出对应的 Make target。完整表格见开发指南的「应用命令」一节。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)。许可证保留上游项目的 DeepSeek 版权声明。

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
