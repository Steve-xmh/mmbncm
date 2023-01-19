export interface InjectFile {
	file: string;
}

export interface HijackOperation {
	type: string;
}

export interface HijackReplaceOrRegexOperation extends HijackOperation {
	type: "replace" | "regex";
	from: string;
	to: string;
}

export interface HijackAppendOrPrependOperation extends HijackOperation {
	type: "append" | "prepend";
	code: string;
}

export interface PluginManifest {
	manifest_version: number;
	name: string;
	version: string;
	slug: string;
	/** 是否禁用自带的开发重载功能，适用于那些需要自制热重载的插件开发者们，默认不禁用 */
	noDevReload?: boolean;
	loadAfter?: string[];
	loadBefore?: string[];
	injects: { [pageType: string]: InjectFile[] };
	hijacks: {
		[versionRange: string]: {
			[matchUrlPath: string]:
				| HijackReplaceOrRegexOperation
				| HijackAppendOrPrependOperation;
		};
	};
}

export class NCMPlugin extends EventTarget {
	pluginPath: string = "";
	injects: NCMInjectPlugin[] = [];
	manifest: PluginManifest;
	finished: boolean = false;
	#haveConfigEle: boolean | null = null;
	devMode: boolean = false;
	constructor(manifest: PluginManifest, pluginPath: string, devMode: boolean) {
		super();
		this.devMode = devMode;
		this.manifest = manifest;
		this.pluginPath = pluginPath;
		this.addEventListener("load", (evt: CustomEvent) => {
			this.injects.forEach((inject) => {
				inject.dispatchEvent(evt);
			});
		});
		this.addEventListener("allpluginsloaded", (evt: CustomEvent) => {
			this.injects.forEach((inject) => {
				inject.dispatchEvent(evt);
			});
		});
	}
	haveConfigElement() {
		if (this.#haveConfigEle == null)
			this.#haveConfigEle =
				this.injects.reduce<HTMLElement | null>(
					(previous, plugin) => previous ?? plugin._getConfigElement(),
					null,
				) !== null;
		return this.#haveConfigEle;
	}
}

namespace configToolBox {
	export function makeBtn(
		text: string,
		onClick: () => void,
		smaller = false,
		args = {},
	) {
		return dom("a", {
			class: ["u-ibtn5", smaller && "u-ibtnsz8"],
			style: { margin: ".2em .5em" },
			innerText: text,
			onclick: onClick,
			...args,
		});
	}

	export function makeCheckbox(args = {}) {
		return dom("input", { type: "checkbox", ...args });
	}

	export function makeInput(value, args = {}) {
		return dom("input", {
			value,
			style: { margin: ".2em .5em", borderRadius: ".5em" },
			class: ["u-txt", "sc-flag"],
			...args,
		});
	}
}

export class NCMInjectPlugin extends EventTarget {
	pluginPath: string = "";
	manifest: PluginManifest;
	configViewElement: HTMLElement | null = null;
	mainPlugin: NCMPlugin;
	loadError: Error | null = null;
	finished: boolean = false;
	constructor(mainPlugin: NCMPlugin, public readonly filePath: string) {
		super();
		this.mainPlugin = mainPlugin;
		this.manifest = mainPlugin.manifest;
		this.pluginPath = mainPlugin.pluginPath;
	}

	onLoad(fn: (selfPlugin: NCMPlugin, evt: CustomEvent) => void) {
		this.addEventListener("load", (evt: CustomEvent) => {
			try {
				fn.call(this, evt.detail, evt);
			} catch (e) {
				this.loadError = e;
			}
		});
	}
	// rome-ignore lint/suspicious/noExplicitAny: TODO: 工具类参数
	onConfig(fn: (toolsBox: any) => HTMLElement) {
		this.addEventListener("config", (evt: CustomEvent) => {
			this.configViewElement = fn.call(this, evt.detail);
		});
	}
	onAllPluginsLoaded(
		fn: (loadedPlugins: typeof window.loadedPlugins, evt: CustomEvent) => void,
	) {
		this.addEventListener("allpluginsloaded", function (evt: CustomEvent) {
			fn.call(this, evt.detail, evt);
		});
	}
	getConfig<T>(key: string): T | undefined;
	getConfig<T>(key: string, defaultValue: T): T;
	getConfig<T>(key: string, defaultValue?: T): T | undefined {
		try {
			const config = JSON.parse(
				localStorage.getItem(`config.betterncm.${this.manifest.slug}`) || "{}",
			);
			if (config[key] !== undefined) return config[key];
		} catch {}
		return defaultValue;
	}
	setConfig<T>(key: string, value: T) {
		let config = JSON.parse(
			localStorage.getItem(`config.betterncm.${this.manifest.slug}`) || "{}",
		);
		if (!config || typeof config !== "object") {
			config = Object.create(null);
		}
		config[key] = value;
		localStorage[`config.betterncm.${this.manifest.slug}`] =
			JSON.stringify(config);
	}
	_getConfigElement() {
		if (!this.configViewElement)
			this.dispatchEvent(new CustomEvent("config", { detail: configToolBox }));
		return this.configViewElement;
	}
}
