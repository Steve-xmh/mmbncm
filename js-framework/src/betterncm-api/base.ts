export const betterncmFetch = (
	relPath: string,
	option?: RequestInit & {
		ignoreApiKey?: boolean;
	},
) => {
	if (option) {
		option.headers = option.headers ?? {};
		if (!option.ignoreApiKey)
			option.headers["BETTERNCM_API_KEY"] = BETTERNCM_API_KEY;
	} else {
		option = {
			headers: { BETTERNCM_API_KEY },
		};
	}
	return fetch(BETTERNCM_API_PATH + relPath, option);
};

namespace uid {
	let IDX = 256;
	const HEX: string[] = [];
	const SIZE = 256;
	let BUFFER: string;
	while (IDX--) HEX[IDX] = (IDX + 256).toString(16).substring(1);

	export function uid(len: number) {
		let i = 0;
		let tmp = len || 11;
		if (!BUFFER || IDX + tmp > SIZE * 2) {
			for (BUFFER = "", IDX = 0; i < SIZE; i++) {
				BUFFER += HEX[(Math.random() * 256) | 0];
			}
		}

		return BUFFER.substring(IDX, IDX++ + tmp);
	}
}

// rome-ignore lint/suspicious/noExplicitAny: <explanation>
interface WebKitMessage<Args extends any[]> {
	type: string;
	arguments: Args;
	returnId: string;
}

interface WebKitResult<T> {
	error?: string;
	result: string;
}

// rome-ignore lint/suspicious/noExplicitAny: <explanation>
export function webkitPostMessage<Args extends any[], R = undefined>(
	callType: string,
	...args: Args
): Promise<R> {
	if (APP_CONF.isOSX) {
		window.betterncmBridgeCallbacks ??= new Map<string, Function>();
		return new Promise((resolve, reject) => {
			const id = uid.uid(32);
			betterncmBridgeCallbacks.set(id, (result: WebKitResult<R>) => {
				betterncmBridgeCallbacks.delete(id);
				console.log(result);
				if (result) {
					if (result.error) {
						reject(result.error);
					} else if (result.result.length > 0) {
						try {
							resolve(JSON.parse(result.result));
						} catch (err) {
							reject(err);
						}
					} else {
						resolve(undefined as R);
					}
				} else {
					reject(new TypeError("接收到了不正确的回调信息"));
				}
			});
			webkit?.messageHandlers?.BetterNCM?.postMessage<WebKitMessage<Args>>({
				type: callType,
				arguments: args,
				returnId: id,
			});
		});
	} else {
		return Promise.reject(
			new TypeError("不可在非 WebKit 环境下发送信息给原生端"),
		);
	}
}
