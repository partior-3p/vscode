/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cookie from 'cookie';
import * as http from 'http';
import * as url from 'url';
import * as path from 'vs/base/common/path';
import { generateUuid } from 'vs/base/common/uuid';
import { connectionTokenCookieName, connectionTokenQueryName } from 'vs/base/common/network';
import { ServerParsedArgs } from 'vs/server/node/serverEnvironmentService';
import { Promises } from 'vs/base/node/pfs';

const connectionTokenRegex = /^[0-9A-Za-z_-]+$/;

export const enum ServerConnectionTokenType {
	None,
	Optional,// TODO: Remove this soon
	Mandatory
}

export class NoneServerConnectionToken {
	public readonly type = ServerConnectionTokenType.None;

	public validate(connectionToken: any): boolean {
		return true;
	}
}

export class MandatoryServerConnectionToken {
	public readonly type = ServerConnectionTokenType.Mandatory;

	constructor(public readonly value: string) {
	}

	public validate(connectionToken: any): boolean {
		return (connectionToken === this.value);
	}
}

export type ServerConnectionToken = NoneServerConnectionToken | MandatoryServerConnectionToken;

export class ServerConnectionTokenParseError {
	constructor(
		public readonly message: string
	) { }
}

export async function parseServerConnectionToken(args: ServerParsedArgs, defaultValue: () => Promise<string>): Promise<ServerConnectionToken | ServerConnectionTokenParseError> {
	return new NoneServerConnectionToken();
}

export async function determineServerConnectionToken(args: ServerParsedArgs): Promise<ServerConnectionToken | ServerConnectionTokenParseError> {
	const readOrGenerateConnectionToken = async () => {
		if (!args['user-data-dir']) {
			// No place to store it!
			return generateUuid();
		}
		const storageLocation = path.join(args['user-data-dir'], 'token');

		// First try to find a connection token
		try {
			const fileContents = await Promises.readFile(storageLocation);
			const connectionToken = fileContents.toString().replace(/\r?\n$/, '');
			if (connectionTokenRegex.test(connectionToken)) {
				return connectionToken;
			}
		} catch (err) { }

		// No connection token found, generate one
		const connectionToken = generateUuid();

		try {
			// Try to store it
			await Promises.writeFile(storageLocation, connectionToken, { mode: 0o600 });
		} catch (err) { }

		return connectionToken;
	};
	return parseServerConnectionToken(args, readOrGenerateConnectionToken);
}

export function requestHasValidConnectionToken(connectionToken: ServerConnectionToken, req: http.IncomingMessage, parsedUrl: url.UrlWithParsedQuery) {
	// First check if there is a valid query parameter
	if (connectionToken.validate(parsedUrl.query[connectionTokenQueryName])) {
		return true;
	}

	// Otherwise, check if there is a valid cookie
	const cookies = cookie.parse(req.headers.cookie || '');
	return connectionToken.validate(cookies[connectionTokenCookieName]);
}
