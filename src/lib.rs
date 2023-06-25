use rust_macios::{
    appkit::{NSMenu, NSMenuItem},
    foundation::{NSString, NSURL},
    objective_c_runtime::{runtime::*, traits::*, *},
};

use crate::hook::CGRect;

pub(crate) mod api;
pub(crate) mod hook;
pub(crate) mod http;
pub mod plugins;
pub(crate) mod protocol;
pub(crate) mod utils;

#[macro_export]
macro_rules! nslog {
    ($format:expr) => {
        #[allow(unused_unsafe)]
        unsafe {
            rust_macios::foundation::NSLog($format.into());
        }
    };
    ($format:expr, $($arg:expr),+) => {
        #[allow(unused_unsafe)]
        unsafe {
            rust_macios::foundation::NSLog($format.into(), $($arg),+);
        }
    };
}

fn dump_cookie(cookies: id) {
    unsafe {
        #[derive(serde::Serialize)]
        struct CookieObj {
            #[serde(rename = "Creation")]
            creation: f64,
            #[serde(rename = "Domain")]
            domain: String,
            #[serde(rename = "Expires")]
            expires: f64,
            #[serde(rename = "HasExpires")]
            has_expires: f64,
            #[serde(rename = "Httponly")]
            http_only: f64,
            #[serde(rename = "LastAccess")]
            last_access: f64,
            #[serde(rename = "Name")]
            name: String,
            #[serde(rename = "Path")]
            path: String,
            #[serde(rename = "Secure")]
            secure: f64,
            #[serde(rename = "Url")]
            url: String,
            #[serde(rename = "Value")]
            value: String,
        }

        let cookies_len: usize = msg_send![cookies, count];
        let mut out_cookies: Vec<CookieObj> = Vec::with_capacity(cookies_len);

        for i in 0..cookies_len {
            let cookie: id = msg_send![cookies, objectAtIndex: i];
            let expires: id = msg_send![cookie, expiresDate];
            out_cookies.push(CookieObj {
                creation: 0.0,
                domain: NSString::from_id(msg_send![cookie, domain]).to_string(),
                expires: msg_send![expires, timeIntervalSince1970],
                has_expires: 0.,
                http_only: if msg_send![cookie, isHTTPOnly] {
                    1.
                } else {
                    0.
                },
                last_access: 0.,
                name: NSString::from_id(msg_send![cookie, name]).to_string(),
                path: NSString::from_id(msg_send![cookie, path]).to_string(),
                secure: if msg_send![cookie, isSecure] { 1. } else { 0. },
                url: "".into(),
                value: NSString::from_id(msg_send![cookie, value]).to_string(),
            });
        }

        let _ = std::fs::write(
            "cookies.json",
            serde_json::to_string_pretty(&out_cookies).unwrap(),
        );
    }
}

#[ctor::ctor]
fn init() {
    nslog!("ThisIsMyMacNCM 正在启动！");

    if let Ok(path) = std::env::var("BETTERNCM_PATH") {
        let _ = std::env::set_current_dir(path);
    } else if let Some(path) = dirs::home_dir() {
        let _ = std::env::set_current_dir(path.join(".betterncm"));
    }

    nslog!(format!("当前数据目录：{:?}", std::env::current_dir()));

    plugins::unzip_plugins();

    unsafe {
        hook::dump_class_to_file(class!(WKWebView), "./WKWebView.original.yaml");
        nslog!("正在注册 WKWebView Handler");
        protocol::init_handler();

        let wkwebview = class!(WKWebView);
        let yyy_wkwebview = class!(YYYRedirectWebView);

        let wkinit_hook = sel!(wkWebViewInitWithFrame:configuration:);
        let wkloadreq_hook = sel!(wkWebViewLoadRequest:);

        extern "C" fn webview_init(
            this: &mut Object,
            _: Sel,
            frame: CGRect,
            configuration: id,
        ) -> id {
            unsafe {
                // 如果不是 YYY 开头的继承类则不做处理
                if !this.class().name().starts_with("YYY") {
                    return msg_send![this, wkWebViewInitWithFrame: frame configuration: configuration];
                }

                println!(
                    "已创建 WebView! {:?} {:?} {:?}",
                    this,
                    frame,
                    (*configuration)
                );

                let user_ctl: id = msg_send![configuration, userContentController];

                protocol::setup_handler(user_ctl as id);

                fn add_user_script(user_ctl: id, code: &str) {
                    unsafe {
                        let code: id = NSString::from(code).to_id();

                        let user_script: id = msg_send![class!(WKUserScript), alloc];
                        let user_script: id = msg_send![user_script, initWithSource: code injectionTime: 0 forMainFrameOnly: NO];
                        let _: () = msg_send![user_ctl, addUserScript: user_script];
                    }
                }

                let framework_data = include_str!(concat!(env!("OUT_DIR"), "/index.js"));
                let framework_data = framework_data.replace(
                    "/*INSERT_CONSTS_HERE*/",
                    &format!(
                        "\
                const BETTERNCM_API_KEY=\"\";\
                const BETTERNCM_API_PATH=\"{}\";\
                window.BETTERNCM_FILES_PATH=\"\";\
                ",
                        protocol::API_PATH
                    ),
                );

                add_user_script(user_ctl, framework_data.as_str());

                let r: id = dbg!(
                    msg_send![this, wkWebViewInitWithFrame: frame configuration: configuration]
                );

                let _: id = msg_send![this, disableWebSecurity];

                r
            }
        }

        extern "C" fn webview_load_request(this: &mut Object, _: Sel, req: id) -> id {
            unsafe {
                let url: id = msg_send![req, URL];
                let href: NSString = NSString::from_id(msg_send![url, absoluteString]);

                println!("正在加载请求：{:?} {}", (*req), href);

                let r = msg_send![this, wkWebViewLoadRequest: req];

                r
            }
        }

        extern "C" fn webview_set_ui_delegate(this: &mut Object, _: Sel, delegate: id) {
            unsafe {
                println!("正在加载设置 UI 代理：{:?}", (*delegate));

                let _: () = msg_send![this, wvSetUIDelegate: delegate];
            }
        }

        extern "C" fn sheared_cookie_storage_for_group_container_identifier(
            this: &mut Class,
            _: Sel,
            identifier: id,
        ) -> id {
            unsafe {
                // inspectorFrontendLoaded:
                println!("正在获取来自 {} 的 Cookies", NSString::from_id(identifier));
                msg_send![
                    this,
                    rawSharedCookieStorageForGroupContainerIdentifier: identifier
                ]
            }
        }

        hook::hook_class_method(
            class!(NSHTTPCookieStorage),
            sel!(sharedCookieStorageForGroupContainerIdentifier:),
            sel!(rawSharedCookieStorageForGroupContainerIdentifier:),
            sheared_cookie_storage_for_group_container_identifier
                as extern "C" fn(&mut Class, Sel, id) -> id,
        );

        extern "C" fn ns_url_protocol_register_class(
            this: &mut Class,
            _: Sel,
            protocol_class: *mut Class,
        ) {
            unsafe {
                println!("已注册 URL 协议：{:?}", (*protocol_class));
                // registerClass
                let _: id = msg_send![this, nsURLProtocolRegisterClass: protocol_class];
                nslog!("正在注册自定义 URL 协议");
                static mut registered: bool = false;
                if !registered {
                    registered = true;
                    protocol::init_protocol();
                }
            }
        }

        hook::hook_method(
            wkwebview,
            sel!(initWithFrame:configuration:),
            wkinit_hook,
            webview_init as extern "C" fn(&mut Object, Sel, CGRect, id) -> id,
        );
        hook::copy_method(
            class!(NSObject),
            class!(WKInspectorWKWebView),
            sel!(wkWebViewInitWithFrame:configuration:),
            sel!(initWithFrame:configuration:),
        );

        extern "C" fn enable_developer_extras_if_needed(this: &mut Object, _: Sel) {
            unsafe {
                let conf: id = msg_send![this, configuration];
                let pref: id = msg_send![conf, preferences];
                let _: BOOL = dbg!(msg_send![
                    pref,
                    respondsToSelector: sel!(_setDeveloperExtrasEnabled:)
                ]);
                let _: id = msg_send![pref, _setDeveloperExtrasEnabled: YES];
                let _: BOOL = dbg!(msg_send![
                    this,
                    respondsToSelector: sel!(_setAllowsRemoteInspection:)
                ]);
                let _: id = msg_send![this, _setAllowsRemoteInspection: YES];
                println!("已开启调试器");
            }
        }

        hook::add_method(
            yyy_wkwebview,
            sel!(enableDeveloperExtrasIfNeeded),
            enable_developer_extras_if_needed as extern "C" fn(&mut Object, Sel),
        );

        extern "C" fn load_html_string_base_url(this: &mut Object, _: Sel, html: id, base_url: id) {
            unsafe {
                // inspectorFrontendLoaded:
                let html = NSString::from_id(html);
                let base_url = NSURL::from_id(base_url);

                println!("正在设置 HTML 给 {this:?}");
                println!("内容: {html}");
                println!("url: {base_url}");

                let _: BOOL =
                    msg_send![this, wkLoadHTMLString: html.to_id() baseURL: base_url.to_id()];
            }
        }

        extern "C" fn load_url_string(this: &mut Object, _: Sel, url: id) {
            unsafe {
                // inspectorFrontendLoaded:
                let mut is_app_html = false;
                if url.is_null() {
                    println!("正在跳转到空对象链接");
                } else {
                    let url = NSString::from_id(url);
                    if let Ok(url) = url.as_str() {
                        is_app_html = url.starts_with("orpheus://orpheus/pub/app.html");
                    }
                    println!("正在跳转到链接 {url}");
                }

                let _: BOOL = msg_send![this, yyyLoadUrlString: url];
            }
        }

        extern "C" fn set_context_menu_delegate(this: &mut Object, _: Sel, delegate: id) {
            unsafe {
                // inspectorFrontendLoaded:
                if delegate.is_null() {
                    println!("正在移除上下文菜单代理");
                } else {
                    let delegate = &*delegate;
                    println!("正在设置上下文菜单代理 {delegate:?}");
                }

                let _: id = msg_send![this, yyySetContextMenuDelegate: delegate];
            }
        }

        hook::hook_method(
            yyy_wkwebview,
            sel!(loadUrlString:),
            sel!(yyyLoadUrlString:),
            load_url_string as extern "C" fn(&mut Object, Sel, id),
        );

        hook::hook_method(
            yyy_wkwebview,
            sel!(setContextMenuDelegate:),
            sel!(yyySetContextMenuDelegate:),
            set_context_menu_delegate as extern "C" fn(&mut Object, Sel, id),
        );

        hook::hook_method(
            wkwebview,
            sel!(loadHTMLString:baseURL:),
            sel!(wkLoadHTMLString:baseURL:),
            load_html_string_base_url as extern "C" fn(&mut Object, Sel, id, id),
        );

        hook::hook_class_method(
            class!(NSURLProtocol),
            sel!(registerClass:),
            sel!(nsURLProtocolRegisterClass:),
            ns_url_protocol_register_class as extern "C" fn(&mut Class, Sel, *mut Class),
        );

        hook::hook_method(
            wkwebview,
            sel!(loadRequest:),
            wkloadreq_hook,
            webview_load_request as extern "C" fn(&mut Object, Sel, id) -> id,
        );

        hook::hook_method(
            wkwebview,
            sel!(setUIDelegate:),
            sel!(wvSetUIDelegate:),
            webview_set_ui_delegate as extern "C" fn(&mut Object, Sel, id),
        );

        extern "C" fn right_click_menu_with_default_menu(
            _this: &mut Object,
            _: Sel,
            menu: id,
        ) -> id {
            menu
        }

        hook::hook_method(
            yyy_wkwebview,
            sel!(rightClickMenuWithDefaultMenu:),
            sel!(yyyRightClickMenuWithDefaultMenu:),
            right_click_menu_with_default_menu as extern "C" fn(&mut Object, Sel, id) -> id,
        );

        extern "C" fn will_open_context_menu_with_element(
            this: &mut Object,
            _: Sel,
            menu: id,
        ) -> id {
            unsafe {
                let menu = NSMenu::from_id(menu);
                println!("正在显示上下文菜单：{:?}", menu,);
                let menu = menu.to_id();
                let item: id = msg_send![menu, itemAtIndex: 1];
                let mut item = NSMenuItem::from_id(item);
                item.set_enabled(true);

                println!("{:?} {:?}", item, item.action());
                msg_send![this, hooked_rightClickMenuWithDefaultMenu: menu]
            }
        }
        hook::hook_method(
            class!(YYYRedirectWebView),
            sel!(rightClickMenuWithDefaultMenu:),
            sel!(hooked_rightClickMenuWithDefaultMenu:),
            will_open_context_menu_with_element as extern "C" fn(&mut Object, Sel, id) -> id,
        );

        hook::dump_class_to_file(class!(WKWebView), "./WKWebView.hooked.yaml");
    }
    nslog!("初始化完成！");
}

#[ctor::dtor]
fn uninit() {
    nslog!("ThisIsMyMacNCM 正在退出！");
}
