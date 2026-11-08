# CSCEC8B Audit Agent

English | [中文](README.zh.md)

CSCEC8B Audit Agent (八局审计智能体) is the internal audit assistant of China Construction Eighth Engineering Division Corp., Ltd. It reads the working papers and source records in a local folder, analyzes them with the DeepSeek model service, and helps auditors draft findings, check figures and organize evidence.

It is built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), an open-source agent harness developed by [DeepSeek AI](https://deepseek.com). Commands, packages and configuration directories keep the upstream `dsh` names.

## Before you use it

Conversations and the files you share with the agent are sent to the DeepSeek model service for analysis. Treat its conclusions as a starting point and verify them against working papers and source records before relying on them.

Review the [safety notice](SAFETY.md) before running the project.

<a id="run"></a>

## Run

<a id="desktop-app"></a>

### Desktop app

The desktop app runs on Windows and macOS. Install the package that your administrator distributes, open CSCEC8B Audit Agent, enter a DeepSeek API key on the welcome page, then choose a local folder as the workspace. Updates are distributed manually; automatic update is off.

<a id="command-line"></a>

### Command line

The desktop app can install the `dsh` command from its application menu. Run `dsh --help` to list the available profiles and options; [CLI help](docs/cli-help.md) records the full output.

<a id="run-from-source"></a>

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/wuwei3618/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm run start:desktop
```

`pnpm run build` prepares the repository artifacts. `pnpm run start:desktop` launches the desktop app from those artifacts without rebuilding.

<a id="package-the-desktop-app"></a>

### Package the desktop app

Build an unsigned internal package on the target platform:

```sh
pnpm run package:desktop:win:x64:unsigned
pnpm run package:desktop:mac:arm64:unsigned
pnpm run package:desktop:mac:x64:unsigned
```

The [desktop packaging guide](apps/desktop/packaging/README.md) lists the prerequisites and output locations.

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md). See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

`pnpm run dev:desktop` builds and launches the desktop app, and `make help` lists the matching Make targets; the guide's application commands section owns the full table.

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE). The license keeps the DeepSeek copyright notice of the upstream project.

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
