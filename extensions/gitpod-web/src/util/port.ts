/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { PortsStatus, PortAutoExposure, PortVisibility } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { URL } from 'url';

export type IconStatus = 'Served' | 'NotServed' | 'Detecting' | 'ExposureFailed';

// From vscode TunnelDescription, decouple it from vscode API for unit tests
export interface TunnelInfo {
	remoteAddress: { port: number; host: string };
	localAddress: { port: number; host: string } | string;
	public?: boolean;
}

export interface PortInfo {
	label: string;
	tooltip: string;
	description: string;
	iconStatus: IconStatus;
	contextValue: string;
	localUrl: string;
}

export class GitpodWorkspacePort {
	public info: PortInfo;
	public status: PortsStatus.AsObject;

	constructor(
		readonly portNumber: number,
		private portStatus: PortsStatus,
		private tunnel?: TunnelInfo,
	) {
		this.status = portStatus.toObject();
		this.portStatus = portStatus;
		this.tunnel = tunnel;
		this.info = this.parsePortInfo(portStatus, tunnel);
	}

	update(portStatus: PortsStatus, tunnel?: TunnelInfo) {
		this.status = portStatus.toObject();
		this.portStatus = portStatus;
		this.tunnel = tunnel;
		this.info = this.parsePortInfo(portStatus, tunnel);
	}

	private parsePortInfo(portStatus: PortsStatus, tunnel?: TunnelInfo) {
		const currentStatus = portStatus.toObject();
		const { name, localPort, description, exposed, served } = currentStatus;
		// const prevStatus = port.status;
		const port: PortInfo = {
			label: '',
			tooltip: '',
			description: '',
			contextValue: '',
			iconStatus: 'NotServed',
			localUrl: 'http://localhost:' + localPort,
		};
		port.label = name ? `${name}: ${localPort}` : `${localPort}`;
		if (description) {
			port.tooltip = name ? `${name} - ${description}` : description;
		}

		if (this.remotePort && this.remotePort !== localPort) {
			port.label += ':' + this.remotePort;
		}

		const accessible = exposed || tunnel;

		// We use .public here because https://github.com/gitpod-io/openvscode-server/pull/360#discussion_r882953586
		const isPortTunnelPublic = !!tunnel?.public;
		if (!served) {
			port.description = 'not served';
			port.iconStatus = 'NotServed';
		} else if (!accessible) {
			if (portStatus.getAutoExposure() === PortAutoExposure.FAILED) {
				port.description = 'failed to expose';
				port.iconStatus = 'ExposureFailed';
			} else {
				port.description = 'detecting...';
				port.iconStatus = 'Detecting';
			}
		} else {
			port.description = 'open';
			if (tunnel) {
				port.description += ` on ${isPortTunnelPublic ? 'all interfaces' : 'localhost'}`;
			}
			if (exposed) {
				port.description += ` ${exposed.visibility === PortVisibility.PUBLIC ? '(public)' : '(private)'}`;
			}
			port.iconStatus = 'Served';
		}

		port.contextValue = 'port';
		if (served) {
			port.contextValue = 'served-' + port.contextValue;
		}
		if (exposed) {
			port.contextValue = 'exposed-' + port.contextValue;
			port.contextValue = (exposed.visibility === PortVisibility.PUBLIC ? 'public-' : 'private-') + port.contextValue;
		}
		if (tunnel) {
			port.contextValue = 'tunneled-' + port.contextValue;
			port.contextValue = (isPortTunnelPublic ? 'network-' : 'host-') + port.contextValue;
		}
		if (!accessible && portStatus.getAutoExposure() === PortAutoExposure.FAILED) {
			port.contextValue = 'failed-' + port.contextValue;
		}
		return port;
	}

	toSvelteObject() {
		return {
			info: this.info,
			status: {
				...this.status,
				remotePort: this.remotePort,
			},
		};
	}

	get localUrl(): string {
		return 'http://localhost:' + this.portStatus.getLocalPort();
	}

	get externalUrl(): string {
		if (this.tunnel) {
			const localAddress = typeof this.tunnel.localAddress === 'string' ? this.tunnel.localAddress : this.tunnel.localAddress.host + ':' + this.tunnel.localAddress.port;
			return localAddress.startsWith('http') ? localAddress : `http://${localAddress}`;
		}
		return this.status?.exposed?.url || this.localUrl;
	}

	get remotePort(): number | undefined {
		if (this.tunnel) {
			if (typeof this.tunnel.localAddress === 'string') {
				try {
					return Number(new URL(this.tunnel.localAddress).port);
				} catch {
					return undefined;
				}
			}
			return this.tunnel.localAddress.port;
		}
		return undefined;
	}
}
