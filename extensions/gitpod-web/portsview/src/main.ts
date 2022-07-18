/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import App from './App.svelte';

console.log('main.init', '============hwen.p.1', + new Date());
const app = new App({
	target: document.body
});

console.log('main.init ok', '============hwen.p.1', + new Date());

export default app;
