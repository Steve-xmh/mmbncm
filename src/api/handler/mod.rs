mod app;
mod fs;

use crate::{protocol::CallHandlerCtx, utils::DynResult};

pub const REGISTERED_API: &[(&str, fn(CallHandlerCtx) -> DynResult<String>)] = &[
    ("/fs/write_file", fs::write_file),
    ("/app/show_console", app::show_console),
];
