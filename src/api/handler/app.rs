use rust_macios::objective_c_runtime::{runtime::*, *};

use crate::{protocol::CallHandlerCtx, utils::DynResult};

pub fn show_console(ctx: CallHandlerCtx) -> DynResult<String> {
    unsafe {
        let webview = dbg!(ctx.get_webview());
        println!("正在显示检查器");

        let inspector: id = dbg!(msg_send![webview, _inspector]);
        dbg!(&*inspector);

        // println!("正在脱离调试器");
        let _: () = dbg!(msg_send![inspector, detach]);
        let _: BOOL = dbg!(msg_send![inspector, isVisible]);
        let c: BOOL = dbg!(msg_send![inspector, isConnected]);
        if c == NO {
            let _: BOOL = dbg!(msg_send![inspector, connect]);
        }
        println!("正在显示调试器");
        let _: () = dbg!(msg_send![inspector, show]);
        let _: () = dbg!(msg_send![inspector, showResources]);
        let _c: BOOL = dbg!(msg_send![inspector, isVisible]);
        let _c: BOOL = dbg!(msg_send![inspector, isConnected]);
        let _: id = dbg!(msg_send![inspector, webView]);
        let _: id = dbg!(msg_send![inspector, inspectorWebView]);
    }

    Ok("".into())
}
