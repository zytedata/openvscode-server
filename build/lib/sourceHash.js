"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const glob = require("glob");
const crypto = require("crypto");
const fs = require("fs");
/**
 * Gets a hash of the source code of VS Code itself, excluding all Gitpod built-in extensions
 */
async function getHashOfSourceCode() {
    const files = glob.sync('**/*', { ignore: [...fs.readFileSync('.gitignore', 'utf-8').split('\n'), 'extensions/gitpod-*/**'] });
    const hash = crypto.createHash('sha1');
    files.forEach(file => {
        if (fs.lstatSync(file).isFile()) {
            hash.update(Buffer.from(fs.readFileSync(file)));
        }
    });
    console.log(hash.digest('hex'));
}
getHashOfSourceCode();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic291cmNlSGFzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNvdXJjZUhhc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyw2QkFBOEI7QUFDOUIsaUNBQWtDO0FBQ2xDLHlCQUF5QjtBQUV6Qjs7R0FFRztBQUNILEtBQUssVUFBVSxtQkFBbUI7SUFDOUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSx3QkFBd0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVsSSxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDcEIsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ2hDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNoRDtJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUdELG1CQUFtQixFQUFFLENBQUMifQ==