use rust_macios::{
    foundation::NSString,
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
        nslog!("正在注册 WKWebView Handler");
        protocol::init_handler();

        let wkwebview = class!(WKWebView);

        let wkinit_hook = sel!(wkWebViewInitWithFrame:configuration:);
        let wkloadreq_hook = sel!(wkWebViewLoadRequest:);

        extern "C" fn webview_init(
            this: &mut Object,
            _: Sel,
            frame: CGRect,
            configuration: id,
        ) -> id {
            unsafe {
                println!("已创建 WebView! {:?} {:?}", frame, (*configuration));

                if !this.class().name().starts_with("YYY") {
                    return msg_send![this, wkWebViewInitWithFrame: frame configuration: configuration];
                }

                hook::dump_class_methods(this.class());
                hook::dump_class_methods(class!(WKWebView));
                // let pref: id = msg_send![configuration, preferences];

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
                ",
                        protocol::API_PATH
                    ),
                );
                dbg!(framework_data.split('\n').take(2).collect::<Vec<_>>());
                add_user_script(user_ctl, framework_data.as_str());

                // let _: id = msg_send![pref, setDeveloperExtrasEnabled: YES];

                // let inspector: id = dbg!(msg_send![class!(WebInspector), alloc]);

                let r: id = dbg!(
                    msg_send![this, wkWebViewInitWithFrame: frame configuration: configuration]
                );

                // let s: BOOL = msg_send![inspector, respondsToSelector: sel!(initWithWebView:)];

                // println!("正在初始化 Handler");

                // println!("正在初始化调试器");
                // if s == YES {
                //     let _: id = dbg!(msg_send![inspector, initWithWebView: this as *mut _]);
                // } else {
                //     let _: id = dbg!(msg_send![
                //         inspector,
                //         initWithInspectedWebView: this as *mut _
                //     ]);
                // }

                let _inspector: id = msg_send![this, _inspector];
                dbg!(&*_inspector);

                let _delegate: id = dbg!(msg_send![_inspector, setDelegate: this as id]);

                hook::dump_class_methods((*_inspector).class());

                // println!("正在脱离调试器");
                // let _: id = dbg!(msg_send![_inspector, attach]);
                // let _: id = dbg!(msg_send![_inspector, detach]);
                // let _: id = dbg!(msg_send![_inspector, connect]);
                // let c: BOOL = dbg!(msg_send![_inspector, isVisible]);
                // let c: BOOL = dbg!(msg_send![_inspector, isConnected]);
                // println!("正在显示调试器");
                // let _: id = dbg!(msg_send![_inspector, show]);
                // let _: id = dbg!(msg_send![_inspector, showConsole]);
                // let c: BOOL = dbg!(msg_send![_inspector, isVisible]);
                // let c: BOOL = dbg!(msg_send![_inspector, isConnected]);

                let _: id = msg_send![this, _setAllowsRemoteInspection: YES];
                let _: id = msg_send![this, disableWebSecurity];

                r
            }
        }

        extern "C" fn webview_load_request(this: &mut Object, _: Sel, req: id) -> id {
            unsafe {
                let url: id = msg_send![req, URL];
                let href: NSString = NSString::from_id(msg_send![url, absoluteString]);

                // extern "C" fn js_callback(value: id, err: id) {
                //     unsafe {
                //         println!("脚本执行完成: {:?} {:?}", (*value), (*err));
                //     }
                // }

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

        extern "C" fn inspector_fully_loaded(_this: &mut Object, _: Sel, inspector: id) {
            unsafe {
                // inspectorFrontendLoaded:
                println!("检查器加载完成！");
                let _: BOOL = msg_send![inspector, show];
            }
        }

        hook::add_method(
            wkwebview,
            sel!(inspectorFrontendLoaded:),
            inspector_fully_loaded as extern "C" fn(&mut Object, Sel, id),
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
                protocol::init_protocol();
            }
        }

        hook::hook_method(
            wkwebview,
            sel!(initWithFrame:configuration:),
            wkinit_hook,
            webview_init as extern "C" fn(&mut Object, Sel, CGRect, id) -> id,
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
    }
    nslog!("初始化完成！");
}

#[ctor::dtor]
fn uninit() {
    nslog!("ThisIsMyMacNCM 正在退出！");
}
