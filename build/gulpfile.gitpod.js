/*!--------------------------------------------------------
* Copyright (C) Gitpod. All rights reserved.
*--------------------------------------------------------*/

// @ts-check
'use strict';
require('./gulpfile.server').defineTasks({
	qualifier: 'gitpod',
	header: [
		'/*!--------------------------------------------------------',
		' * Copyright (C) Gitpod. All rights reserved.',
		' *--------------------------------------------------------*/'
	].join('\n')
});
