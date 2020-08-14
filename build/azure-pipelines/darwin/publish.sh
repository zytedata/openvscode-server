#!/usr/bin/env bash
set -e

# publish the build
node build/azure-pipelines/common/createAsset.js \
	darwin \
	archive \
	"VSCode-darwin-$VSCODE_QUALITY-$VSCODE_ARCH.zip" \
	../VSCode-darwin-$VSCODE_ARCH.zip

# package Remote Extension Host
pushd .. && mv vscode-reh-darwin-$VSCODE_ARCH vscode-server-darwin-$VSCODE_ARCH \
	&& zip -Xry vscode-server-darwin-$VSCODE_ARCH.zip vscode-server-darwin-$VSCODE_ARCH && popd

# publish Remote Extension Host
node build/azure-pipelines/common/createAsset.js \
	server-darwin \
	archive-unsigned \
	"vscode-server-darwin-$VSCODE_ARCH.zip" \
	../vscode-server-darwin-$VSCODE_ARCH.zip
