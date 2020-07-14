/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PushErrorHandler, GitErrorCodes, Repository, Remote } from './typings/git';
import { window, ProgressLocation } from 'vscode';
import * as nls from 'vscode-nls';
import { getOctokit } from './auth';

const localize = nls.loadMessageBundle();

async function handlePushError(repository: Repository, remote: Remote, refspec: string, owner: string, repo: string, error: Error & { gitErrorCode: GitErrorCodes }): Promise<void> {
	const yes = localize('create a fork', "Create Fork");
	const no = localize('no', "No");

	const answer = await window.showInformationMessage(localize('fork', "You don't have permissions to push to '{0}/{1}' on GitHub. Would you like to create a fork and push to it instead?", owner, repo), yes, no);

	if (answer === no) {
		return;
	}

	const match = /^([^:]*):([^:]*)$/.exec(refspec);
	const localName = match ? match[1] : refspec;
	const remoteName = match ? match[2] : refspec;

	const octokit = await getOctokit();

	const githubRepository = await window.withProgress({ location: ProgressLocation.Notification, cancellable: false, title: 'Publish to GitHub' }, async progress => {
		progress.report({ message: localize('forking', "Forking '{0}/{1}'...", owner, repo), increment: 25 });

		const res = await octokit.repos.createFork({ owner, repo });

		const createdGithubRepository = res.data;

		progress.report({ message: localize('pushing', "Pushing changes..."), increment: 25 });

		await repository.renameRemote(remote.name, 'upstream');
		await repository.addRemote('origin', createdGithubRepository.clone_url);
		await repository.setBranchUpstream(localName, `upstream/${remoteName}`);
		await repository.push('origin', 'master', true);

		return createdGithubRepository;
	});

	console.log(githubRepository);

}

export class GithubPushErrorHandler implements PushErrorHandler {

	handlePushError(repository: Repository, remote: Remote, refspec: string, error: Error & { gitErrorCode: GitErrorCodes }): boolean {
		if (error.gitErrorCode !== GitErrorCodes.PermissionDenied) {
			return false;
		}

		if (!remote.pushUrl) {
			return false;
		}

		const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\.git/i.exec(remote.pushUrl)
			|| /^git@github\.com:([^/]+)\/([^/]+)\.git/i.exec(remote.pushUrl);

		if (!match) {
			return false;
		}

		if (/^:/.test(refspec)) {
			return false;
		}

		const [, owner, repo] = match;
		handlePushError(repository, remote, refspec, owner, repo, error);

		return true;
	}
}
