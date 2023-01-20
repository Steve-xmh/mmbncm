import { createElement, Fragment } from "react";
import { NCMPlugin } from "../plugin";
import BetterNCM from "../betterncm-api";

declare global {
	/** 一个由 C++ 侧设置的访问密钥，以免出现非法调用 */
	const BETTERNCM_API_KEY: string;
	const BETTERNCM_API_PATH: string;
	const BETTERNCM_FILES_PATH: string;
	const BETTERNCM_API_PORT: number;
	// rome-ignore lint/suspicious/noExplicitAny: 网易云自带IPC对象，因为量比较大所以不做类型限定了
	const channel: any;
	const h: typeof createElement;
	const f: typeof Fragment;
	const dom: typeof BetterNCM.utils.dom;
	const React: typeof import("react");
	const ReactDOM: typeof import("react-dom");
	// rome-ignore lint/suspicious/noExplicitAny: 云村自带的应用配置属性，因为量比较大所以不做类型限定了
	const APP_CONF: any;
	var betterncmBridgeCallbacks: Map<string, Function>;
	export namespace webkit {
		export namespace messageHandlers {
			export namespace BetterNCM {
				export function postMessage<T>(msg: T): void;
			}
		}
	}
	export namespace betterncm_native {
		export namespace fs {
			export function watchDirectory(
				watchDirPath: string,
				callback: (dirPath: string, filename: string) => void,
			): void;

			export function readFileText(filePath: string): string;

			export function readDir(filePath: string): string[];

			export function exists(filePath: string): boolean;
		}

		export namespace app {
			export function version(): string;
		}
	}
	interface Window {
		React: typeof import("react");
		ReactDOM: typeof import("react-dom");
		h: typeof createElement;
		f: typeof Fragment;
		loadedPlugins: { [pluginId: string]: NCMPlugin };
		loadFailedErrors: [string, Error][];
		dom: typeof BetterNCM.utils.dom;
		// rome-ignore lint/suspicious/noExplicitAny: 云村自带的应用配置属性，因为量比较大所以不做类型限定了
		APP_CONF: any;
		BETTERNCM_API_PATH: string;
		BETTERNCM_FILES_PATH: string;
	}
}
