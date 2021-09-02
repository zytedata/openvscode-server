/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { handleVerification } from 'vs/server/node/auth-http';
import { registerRemoteTerminal } from 'vs/server/node/remote-terminal';
import { main } from 'vs/server/node/server.main';

main({
	start: (services, channelServer) => {
		registerRemoteTerminal(services, channelServer);
	},
	verifyRequest: (req, res, accessor): Promise<boolean> => {
		const logService = accessor.get(ILogService);
		return handleVerification(req, res, logService);
	}
});

