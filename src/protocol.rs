use rust_macios::{
    foundation::{NSNumber, NSString},
    objective_c_runtime::{
        declare::ClassDecl,
        runtime::*,
        traits::{FromId, ToId},
        *,
    },
};

use crate::http::URLRequest;

pub unsafe fn setup_webview_url_scheme(_conf: id) {
    // let scheme = NSString::from("betterncm");
    // let handler: id = msg_send![class!(BetterNCMWKURLSchemeHandler), alloc];
    // let _: id = msg_send![conf, setURLSchemeHandler: handler forURLScheme: scheme.to_id()];

    // let scheme = NSString::from("orpheus");
    // let orpheus: id = msg_send![conf, urlSchemeHandlerForURLScheme: scheme.to_id()];
    // dbg!(&*orpheus);
}

pub const API_PATH: &str = "orpheus://orpheus/betterncm";

pub unsafe fn init_protocol() {
    let mut ptcl_decl = ClassDecl::new("BetterNCMURLProtocol", class!(NSURLProtocol)).unwrap();

    extern "C" fn can_init_with_request(this: &Class, _: Sel, req: id) -> BOOL {
        unsafe {
            let url: id = msg_send![req, URL];
            let mut should_accept: BOOL = if !(req.is_null() || url.is_null()) {
                YES
            } else {
                NO
            };

            if should_accept == YES {
                let key = NSString::from("betterNCMURLProtocolKey").to_id();
                let has_processed: id = msg_send![this, propertyForKey: key inRequest: req];
                if !has_processed.is_null() {
                    let has_processed = NSNumber::from_id(has_processed);
                    should_accept = if has_processed.bool_value() { NO } else { YES };
                }
            }

            if should_accept == YES {
                let full_url = NSString::from_id(msg_send![url, absoluteString]);
                // println!("接收到原生请求：{}", full_url);
                should_accept = if full_url.as_str().unwrap().starts_with(API_PATH) {
                    YES
                } else {
                    NO
                };
            }

            should_accept
        }
    }

    extern "C" fn start_loading(this: &mut Object, _: Sel) {
        unsafe {
            let req: id = msg_send![this, request];
            let req: id = msg_send![req, mutableCopy];

            let key = NSString::from("betterNCMURLProtocolKey").to_id();
            let yes: id = msg_send![class!(NSNumber), numberWithBool: YES];
            let _: () = msg_send![this.class(), setProperty: yes forKey: key inRequest: req];

            let url: id = msg_send![req, URL];

            let path = NSString::from_id(msg_send![url, absoluteString]);

            if let Ok(path) = path.as_str() {
                if let Some(path) = path.strip_prefix(API_PATH) {
                    // println!("接收到 BetterNCM 请求：{}", path);
                    // 在这里判断需要返回什么数据
                    for (api_path, callback) in crate::api::REGISTERED_API {
                        if let Some(api_path) = path.strip_prefix(api_path) {
                            let (res, data) =
                                callback(api_path, URLRequest::from_id(req)).build_to_ids();

                            let client: id = msg_send![this, client];

                            let policy = NSString::from("NSURLCacheStorageNotAllowed");
                            let _: id = msg_send![client, URLProtocol: this as id didReceiveResponse:res cacheStoragePolicy:policy.to_id()];
                            let _: id =
                                msg_send![client, URLProtocol: this as id didLoadData: data];
                            let _: id = msg_send![client, URLProtocolDidFinishLoading: this as id];

                            return;
                        }
                    }

                    // println!("警告：无法找到匹配的 API 回调：{}", path);
                }
            }

            let (res, data) = URLRequest::from_id(req)
                .make_res()
                .with_status(404)
                .build_to_ids();

            // let return_data = NSString::from("");
            // let mime_type = NSString::from("text/plain");

            // let data: id = msg_send![return_data.to_id(), dataUsingEncoding: 4];
            // let res: id = msg_send![class!(NSURLResponse), alloc];
            // let data_length: c_ulong = msg_send![data, length];
            // let res: id = msg_send![res, initWithURL: url MIMEType: mime_type expectedContentLength: data_length textEncodingName: nil];

            let client: id = msg_send![this, client];

            let policy = NSString::from("NSURLCacheStorageNotAllowed");
            let _: id = msg_send![client, URLProtocol: this as id didReceiveResponse:res cacheStoragePolicy:policy.to_id()];
            let _: id = msg_send![client, URLProtocol: this as id didLoadData: data];
            let _: id = msg_send![client, URLProtocolDidFinishLoading: this as id];
        }
    }

    extern "C" fn stop_loading(_this: &mut Object, _: Sel) {}

    extern "C" fn canonical_req_for_req(_: &Class, _: Sel, req: id) -> id {
        req
    }

    ptcl_decl.add_class_method(
        sel!(canInitWithRequest:),
        can_init_with_request as extern "C" fn(&Class, Sel, id) -> BOOL,
    );

    ptcl_decl.add_method(
        sel!(startLoading),
        start_loading as extern "C" fn(&mut Object, Sel),
    );

    ptcl_decl.add_method(
        sel!(stopLoading),
        stop_loading as extern "C" fn(&mut Object, Sel),
    );

    ptcl_decl.add_class_method(
        sel!(canonicalRequestForRequest:),
        canonical_req_for_req as extern "C" fn(&Class, Sel, id) -> id,
    );

    let cls = ptcl_decl.register();

    let _: id = msg_send![class!(NSURLProtocol), nsURLProtocolRegisterClass: cls];

    // nslog!("正在注册 WK URL 协议接收器");

    // let mut wk_url_scheme_decl =
    //     ClassDecl::new("BetterNCMWKURLSchemeHandler", class!(NSObject)).unwrap();

    // extern "C" fn start_url_scheme_task(
    //     this: &mut Object,
    //     _: Sel,
    //     webview: id,
    //     url_scheme_task: id,
    // ) {
    //     unsafe {
    //         let req: id = msg_send![url_scheme_task, request];
    //         let req: id = msg_send![req, mutableCopy];

    //         let key = NSString::from("BetterNCMURLProtocolKey").to_id();
    //         let _: id = msg_send![this.class(), setProperty: YES forKey: key inRequest: req];

    //         let url: id = msg_send![req, URL];
    //         let path = NSString::from_id(msg_send![url, path]);

    //         println!("接收到 BetterNCM 请求：{}", path);

    //         // 在这里判断需要返回什么数据

    //         let return_data = NSString::from("Here's BetterNCM!");
    //         let mime_type = NSString::from("text/plain");

    //         let encoding = NSString::from("NSUTF8StringEncoding");
    //         let data: id = msg_send![return_data.to_id(), dataUsingEncoding: encoding.to_id()];
    //         let res: id = msg_send![class!(NSUrlResponse), alloc];
    //         let data_length: c_ulong = msg_send![data, length];
    //         let res: id = msg_send![res, initWithURL: url MIMEType: mime_type expectedContentLength: data_length textEncodingName: nil];

    //         let _: id = msg_send![url_scheme_task, didReceiveResponse: res];
    //         let _: id = msg_send![url_scheme_task, didReceiveData: data];
    //         let _: id = msg_send![url_scheme_task, didFinished];
    //     }
    // }

    // extern "C" fn stop_url_scheme_task(
    //     _this: &mut Object,
    //     _: Sel,
    //     _webview: id,
    //     _url_scheme_task: id,
    // ) {
    // }

    // wk_url_scheme_decl.add_method(
    //     sel!(webView:startURLSchemeTask:),
    //     start_url_scheme_task as extern "C" fn(&mut Object, Sel, id, id),
    // );

    // wk_url_scheme_decl.add_method(
    //     sel!(webView:stopURLSchemeTask:),
    //     stop_url_scheme_task as extern "C" fn(&mut Object, Sel, id, id),
    // );

    // wk_url_scheme_decl.register();
}
