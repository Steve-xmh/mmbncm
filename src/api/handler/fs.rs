use crate::{
    protocol::CallHandlerCtx,
    utils::{decode_url_data, DynResult},
};

pub fn write_file(ctx: CallHandlerCtx) -> DynResult<String> {
    let path = ctx.get_arg_string(0)?;
    let data = ctx.get_arg_string(1)?;
    let data = decode_url_data(data.as_str());

    println!("正在写入大小 {} 字节的数据到文件路径 {}", data.len(), path,);

    std::fs::write(path, data)?;

    Ok("".into())
}
