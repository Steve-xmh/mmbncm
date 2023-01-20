use core::ffi::c_ulong;

use anyhow::Context;
use rust_macios::{
    foundation::{NSNumber, NSString},
    objective_c_runtime::{
        declare::ClassDecl,
        runtime::*,
        traits::{FromId, ToId},
        *,
    },
};

use crate::{
    http::URLRequest,
    utils::{DynResult, NSObjectUtils},
};

pub const API_PATH: &str = "orpheus://orpheus/betterncm";

#[derive(serde::Serialize)]
struct WebKitResult {
    error: Option<String>,
    result: String,
}

pub struct CallHandlerCtx {
    wkwebview: id,
    args: id,
}

// https://developer.apple.com/documentation/webkit/wkscriptmessage/1417901-body?language=objc
impl CallHandlerCtx {
    unsafe fn from_id(wkwebview: id, args: id) -> Self {
        Self { wkwebview, args }
    }

    pub unsafe fn get_webview(&self) -> id {
        self.wkwebview
    }

    pub unsafe fn get_arg_raw(&self, index: usize) -> id {
        msg_send![self.args, objectAtIndex: index as c_ulong]
    }

    pub fn get_arg_string(&self, index: usize) -> DynResult<String> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSString))?;
            Ok(NSString::from_id(arg).to_string())
        }
    }

    pub fn get_arg_data(&self, index: usize) -> DynResult<&[u8]> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSString))?;
            let data = NSString::from_id(arg);
            let len = data.length() as usize;
            let data = core::mem::transmute(data.bytes());
            Ok(core::slice::from_raw_parts(data, len))
        }
    }

    pub fn get_arg_bool(&self, index: usize) -> DynResult<bool> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).bool_value())
        }
    }

    pub fn get_arg_i8(&self, index: usize) -> DynResult<i8> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).char_value())
        }
    }

    pub fn get_arg_i16(&self, index: usize) -> DynResult<i16> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).short_value())
        }
    }

    pub fn get_arg_i32(&self, index: usize) -> DynResult<i32> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).int_value())
        }
    }

    pub fn get_arg_i64(&self, index: usize) -> DynResult<i64> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).long_value())
        }
    }

    pub fn get_arg_u8(&self, index: usize) -> DynResult<u8> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).unsigned_char_value())
        }
    }

    pub fn get_arg_u16(&self, index: usize) -> DynResult<u16> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).unsigned_short_value())
        }
    }

    pub fn get_arg_u32(&self, index: usize) -> DynResult<u32> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).unsigned_int_value())
        }
    }

    pub fn get_arg_u64(&self, index: usize) -> DynResult<u64> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).unsigned_long_value())
        }
    }

    pub fn get_arg_f32(&self, index: usize) -> DynResult<f32> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).float_value())
        }
    }

    pub fn get_arg_f64(&self, index: usize) -> DynResult<f64> {
        unsafe {
            let arg = self.get_arg_raw(index);
            arg.ensure_kind_of_class(class!(NSNumber))?;
            Ok(NSNumber::from_id(arg).double_value())
        }
    }
}

fn process_handler(body: id, wkwebview: id) -> DynResult<String> {
    unsafe {
        body.ensure_kind_of_class(class!(NSDictionary))
            .with_context(|| format!("警告：Handler 接收到了类型不正确的信息: {:?}", body))?;

        let return_id: id = msg_send![body, objectForKey: NSString::from("returnId").to_id()];
        let call_type: id = msg_send![body, objectForKey: NSString::from("type").to_id()];
        let arguments: id = msg_send![body, objectForKey: NSString::from("arguments").to_id()];
        return_id
            .ensure_kind_of_class(class!(NSString))
            .with_context(|| {
                format!(
                    "警告：Handler 接收到了 returnId 类型不正确的信息: {:?}",
                    return_id
                )
            })?;
        call_type
            .ensure_kind_of_class(class!(NSString))
            .with_context(|| {
                format!(
                    "警告：Handler 接收到了 type 类型不正确的信息: {:?}",
                    call_type
                )
            })?;
        arguments
            .ensure_kind_of_class(class!(NSArray))
            .with_context(|| {
                format!(
                    "警告：Handler 接收到了 arguments 类型不正确的信息: {:?}",
                    body
                )
            })?;
        let return_id = NSString::from_id(return_id).to_string();
        let call_type = NSString::from_id(call_type).to_string();

        println!("returnId: {}", return_id);
        println!("type: {}", call_type);
        println!("arguments: {:?}", &*arguments);

        let return_id = serde_json::to_string(&return_id)?;

        for (api_type, api) in crate::api::handler::REGISTERED_API {
            if &call_type == api_type {
                let ctx = CallHandlerCtx::from_id(wkwebview, arguments);
                match (api)(ctx) {
                    Ok(result) => {
                        let result = WebKitResult {
                            error: None,
                            result,
                        };
                        let result_js_code = format!(
                            "window.betterncmBridgeCallbacks && \
                        window.betterncmBridgeCallbacks.get({})({})",
                            return_id,
                            serde_json::to_string(&result)?
                        );
                        return Ok(result_js_code);
                    }
                    Err(error) => {
                        let error = error.to_string();
                        let result = WebKitResult {
                            error: Some(error),
                            result: "undefined".into(),
                        };
                        let result_js_code = format!(
                            "window.betterncmBridgeCallbacks && \
                        window.betterncmBridgeCallbacks.get({})({})",
                            return_id,
                            serde_json::to_string(&result)?
                        );
                        return Ok(result_js_code);
                    }
                }
            }
        }

        let result_js_code = format!(
            "window.betterncmBridgeCallbacks && \
        window.betterncmBridgeCallbacks.get({})({})",
            return_id, ""
        );

        Ok(result_js_code)
    }
}

pub unsafe fn init_handler() {
    let mut script_handler_decl =
        ClassDecl::new("BetterNCMScriptHandler", class!(NSObject)).unwrap();

    extern "C" fn did_recv_script_msg(_: &Object, _: Sel, _user_content_controller: id, msg: id) {
        unsafe {
            println!("接收到信息");
            let wv: id = msg_send![msg, webView];
            let body: id = msg_send![msg, body];

            println!("wv: {:?} body: {:?}", &*wv, &*body);

            let result_code = process_handler(body, wv);
            if let Ok(result_code) = result_code {
                if !result_code.is_empty() {
                    // evaluateJavaScript:completionHandler
                    let result_code = NSString::from(result_code).to_id();
                    let _: () =
                        msg_send![wv, evaluateJavaScript: result_code completionHandler: nil];
                }
            }
        }
    }

    script_handler_decl.add_method(
        sel!(userContentController:didReceiveScriptMessage:),
        did_recv_script_msg as extern "C" fn(&Object, Sel, id, id),
    );

    script_handler_decl.add_protocol(Protocol::get("WKScriptMessageHandler").unwrap());

    script_handler_decl.register();
}

pub unsafe fn setup_handler(conf: id) {
    let handler: id = msg_send![class!(BetterNCMScriptHandler), alloc];
    let name = NSString::from("BetterNCM").to_id();
    let _: () = msg_send![conf, addScriptMessageHandler: handler name: name];
}

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
                println!("接收到原生请求：{}", full_url);
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
            let raw_req: id = msg_send![this, request];
            let method = NSString::from_id(msg_send![raw_req, HTTPMethod]);
            let req: id = msg_send![raw_req, mutableCopy];

            let key = NSString::from("betterNCMURLProtocolKey").to_id();
            let yes: id = msg_send![class!(NSNumber), numberWithBool: YES];
            let _: () = msg_send![this.class(), setProperty: yes forKey: key inRequest: req];

            let url: id = msg_send![req, URL];

            let path = NSString::from_id(msg_send![url, absoluteString]);

            println!("{} {}", method, path);

            if let Ok(path) = path.as_str() {
                if let Some(path) = path.strip_prefix(API_PATH) {
                    // println!("接收到 BetterNCM 请求：{}", path);
                    // 在这里判断需要返回什么数据
                    for (api_path, callback) in crate::api::protocol::REGISTERED_API {
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

                    println!("警告：无法找到匹配的 API 回调：{}", path);
                }
            }

            let (res, data) = URLRequest::from_id(req)
                .make_res()
                .with_status(404)
                .build_to_ids();

            let client: id = msg_send![this, client];

            let policy = NSString::from("NSURLCacheStorageNotAllowed");
            let _: id = msg_send![client, URLProtocol: this as id didReceiveResponse:res cacheStoragePolicy:policy.to_id()];
            let _: id = msg_send![client, URLProtocol: this as id didLoadData: data];
            let _: id = msg_send![client, URLProtocolDidFinishLoading: this as id];
        }
    }

    extern "C" fn stop_loading(_this: &mut Object, _: Sel) {}

    extern "C" fn canonical_req_for_req(_: &Class, _: Sel, req: id) -> id {
        unsafe {
            let stream: id = msg_send![req, HTTPBodyStream];
            dbg!(&*stream);
            req
        }
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
