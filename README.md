# OpenVSCode Server

[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-908a85?logo=gitpod)](https://gitpod.io/from-referrer)
[![GitHub](https://img.shields.io/github/license/gitpod-io/openvscode-server)](https://github.com/gitpod-io/openvscode-server/blob/main/LICENSE.txt)
[![Discord](https://img.shields.io/discord/816244985187008514)](https://www.gitpod.io/chat)

## What is this?

This project provides a version of VS Code that runs a server on a remote machine and allows access through a modern web browser. It's based on the very same architecture used by [Gitpod](https://www.gitpod.io) or [GitHub Codespaces](https://github.com/features/codespaces) at scale.

<img width="1624" alt="Screenshot 2021-09-02 at 08 39 26" src="https://user-images.githubusercontent.com/372735/131794918-d6602646-4d67-435b-88fe-620a3cc0a3aa.png">

## Why?

VS Code has traditionally been a desktop IDE built with web technologies. A few years back, people started patching it in order to run it in a remote context and to make it accessible through web browsers. These efforts have been complex and error prone, because many changes had to be made across the large code base of VS Code.

Luckily, in 2019 the VS Code team started to refactor its architecture to support a browser-based working mode. While this architecture has been adopted by Gitpod and GitHub, the important bits have not been open-sourced, until now. As a result, many people in the community still use the old, hard to maintain and error-prone approach.

At Gitpod, we've been asked a lot about how we do it. So we thought we might as well share the minimal set of changes needed so people can rely on the latest version of VS Code, have a straightforward upgrade path and low maintenance effort.

## Getting started

### Docker

- Start the server:
```bash
docker run -it --init -p 3000:3000 -v "$(pwd):/home/workspace:cached" gitpod/openvscode-server
```
- Visit the URL printed in your terminal.


_Note_: Feel free to use the `nightly` tag to test the latest version, i.e. `gitpod/openvscode-server:nightly`.

#### Custom Environment
- If you want to add dependencies to this Docker image, here is a template to help:
	```Dockerfile

	FROM gitpod/openvscode-server:latest

	USER root # to get permissions to install packages and such
	RUN # the installation process for software needed
	USER openvscode-server # to restore permissions for the web interface

	```
- For additional possibilities, please consult the `Dockerfile` for OpenVSCode Server at https://github.com/gitpod-io/openvscode-releases/

#### Pre-installing VSCode extensions

You can pre-install vscode extensions in such a way:

```dockerfile
FROM gitpod/openvscode-server:latest

ENV OPENVSCODE_SERVER_ROOT="/home/.openvscode-server"
ENV OPENVSCODE="${OPENVSCODE_SERVER_ROOT}/bin/openvscode-server"

SHELL ["/bin/bash", "-c"]
RUN \
    # Direct download links to external .vsix not available on https://open-vsx.org/
    # The two links here are just used as example, they are actually available on https://open-vsx.org/
    urls=(\
        https://github.com/rust-lang/rust-analyzer/releases/download/2022-12-26/rust-analyzer-linux-x64.vsix \
        https://github.com/VSCodeVim/Vim/releases/download/v1.24.3/vim-1.24.3.vsix \
    )\
    # Create a tmp dir for downloading
    && tdir=/tmp/exts && mkdir -p "${tdir}" && cd "${tdir}" \
    # Download via wget from $urls array.
    && wget "${urls[@]}" && \
    # List the extensions in this array
    exts=(\
        # From https://open-vsx.org/ registry directly
        gitpod.gitpod-theme \
        # From filesystem, .vsix that we downloaded (using bash wildcard '*')
        "${tdir}"/* \
    )\
    # Install the $exts
    && for ext in "${exts[@]}"; do ${OPENVSCODE} --install-extension "${ext}"; done
```

### Linux

- [Download the latest release](https://github.com/gitpod-io/openvscode-server/releases/latest)
- Untar and run the server
	```bash
	tar -xzf openvscode-server-v${OPENVSCODE_SERVER_VERSION}.tar.gz
	cd openvscode-server-v${OPENVSCODE_SERVER_VERSION}
	./bin/openvscode-server # you can add arguments here, use --help to list all of the possible options
	```

  From the possible entrypoint arguments, the most notable ones are
	- `--port` - the port number to start the server on, this is 3000 by default
	- `--without-connection-token` - used by default in the docker image
	- `--connection-token` & `--connection-token-file` for securing access to the IDE, you can read more about it in [Securing access to your IDE](#securing-access-to-your-ide).
	-  `--host` - determines the host the server is listening on. It defaults to `localhost`, so for accessing remotely it's a good idea to add `--host 0.0.0.0` to your launch arguments.

- Visit the URL printed in your terminal.

_Note_: You can use [pre-releases](https://github.com/gitpod-io/openvscode-server/releases) to test nightly changes.

### Securing access to your IDE

Since OpenVSCode Server v1.64, you can access the Web UI without authentication (anyone can access the IDE using just the hostname and port), if you need some kind of basic authentication then you can start the server with `--connection-token YOUR_TOKEN`, the provided `YOUR_TOKEN` will be used and the authenticated URL will be displayed in your terminal once you start the server. You can also create a plaintext file with the desired token as its contents and provide it to the server with `--connection-token-file YOUR_SECRET_TOKEN_FILE`.

If you want to use a connection token and are working with OpenVSCode Server via [the Docker image](https://hub.docker.com/r/gitpod/openvscode-server), you will have to edit the `ENTRYPOINT` in [the Dockerfile](https://github.com/gitpod-io/openvscode-releases/blob/main/Dockerfile) or modify it with the [`entrypoint` option](https://docs.docker.com/compose/compose-file/compose-file-v3/#entrypoint) when working with `docker-compose`.

### Deployment guides

Please refer to [Guides](https://github.com/gitpod-io/openvscode-server/tree/docs/guides) to learn how to deploy OpenVSCode Server to your cloud provider of choice.

## The scope of this project

This project only adds minimal bits required to run VS Code in a server scenario. We have no intention of changing VS Code in any way or to add additional features to VS Code itself. Please report feature requests, bug fixes, etc. in the upstream repository.

> **For any feature requests, bug reports, or contributions that are not specific to running VS Code in a server context, please go to [Visual Studio Code - Open Source "OSS"](https://github.com/microsoft/vscode)**

## Documentation

All documentation is available in [the `docs` branch](https://github.com/gitpod-io/openvscode-server/tree/docs) of this project.

## Supporters

The project is supported by companies such as [GitLab](https://gitlab.com/), [VMware](https://www.vmware.com/), [Uber](https://www.uber.com/), [SAP](https://www.sap.com/), [Sourcegraph](https://sourcegraph.com/), [RStudio](https://www.rstudio.com/), [SUSE](https://rancher.com/), [Tabnine](https://www.tabnine.com/), [Render](https://render.com/) and [TypeFox](https://www.typefox.io/).

## Contributing

Thanks for your interest in contributing to the project 🙏. You can start a development environment with the following button:

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/from-referrer)

To learn about the code structure and other topics related to contributing, please refer to the [development docs](https://github.com/gitpod-io/openvscode-server/blob/docs/development.md).

## Bundled Extensions

VS Code includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (code completion, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

## Development Container

This repository includes a Visual Studio Code Dev Containers / GitHub Codespaces development container.

- For [Dev Containers](https://aka.ms/vscode-remote/download/containers), use the **Dev Containers: Clone Repository in Container Volume...** command which creates a Docker volume for better disk I/O on macOS and Windows.
     - If you already have VS Code and Docker installed, you can also click [here](https://vscode.dev/redirect?url=vscode://ms-vscode-remote.remote-containers/cloneInVolume?url=https://github.com/microsoft/vscode) to get started. This will cause VS Code to automatically install the Dev Containers extension if needed, clone the source code into a container volume, and spin up a dev container for use.
- For Codespaces, install the [GitHub Codespaces](https://marketplace.visualstudio.com/items?itemName=GitHub.codespaces) extension in VS Code, and use the **Codespaces: Create New Codespace** command.

Docker / the Codespace should have at least **4 Cores and 6 GB of RAM (8 GB recommended)** to run full build. See the [development container README](.devcontainer/README.md) for more information.

## Legal
This project is not affiliated with Microsoft Corporation.
