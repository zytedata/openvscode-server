<!-----------------------------------------------------------------------------------------------
	Copyright (c) Gitpod. All rights reserved.
------------------------------------------------------------------------------------------------>
<script lang="ts">
	import "@vscode/codicons/dist/codicons.css";
	import { vscode } from "./utils/vscode";
	import PortTable from "./porttable/PortTable.svelte";
	import type { GitpodPortObject } from "./protocol/gitpod";

	let ports: GitpodPortObject[] = [];

	window.addEventListener("message", (event) => {
		console.log('on.message', '============hwen.p.2', + new Date());
		if (event.data.command === "updatePorts") {
			ports = event.data.ports;
		}
	});
	console.log('queryData', '============hwen.p.3', + new Date());
	vscode.postMessage({ command: "queryPortData" });
</script>

<main>
	<PortTable {ports} />
</main>
