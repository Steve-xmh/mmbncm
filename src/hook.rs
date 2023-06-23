use rust_macios::{
    core_graphics::{CGPoint, CGSize},
    objective_c_runtime::{declare::MethodImplementation, runtime::*, *},
};
use std::{ffi::CString, path::Path};

use crate::nslog;

#[link(name = "objc", kind = "dylib")]
extern "C" {
    fn class_getClassMethod(cls: *const Class, sel: Sel) -> *const Method;
}

/// A structure that contains a rectangle in a two-dimensional coordinate system.
#[derive(Debug, Default, Copy, Clone, PartialEq)]
#[repr(C)]
pub struct CGRect {
    /// A point that specifies the coordinates of the rectangle’s origin.
    pub origin: CGPoint,
    /// A size that specifies the height and width of the rectangle.
    pub size: CGSize,
}

unsafe impl Encode for CGRect {
    fn encode() -> Encoding {
        unsafe { Encoding::from_str("{CGRect={CGPoint=dd}{CGSize=dd}}") }
    }
}

fn method_type_encoding(ret: &Encoding, args: &[Encoding]) -> CString {
    let mut types = ret.as_str().to_owned();
    // First two arguments are always self and the selector
    // types.push_str(<*mut Object>::encode().as_str());
    // types.push_str(Sel::encode().as_str());
    types.extend(args.iter().map(|e| e.as_str()));
    CString::new(types).unwrap()
}

#[derive(serde::Serialize)]
pub struct MethodDump {
    pub sel: String,
    pub enc: String,
    pub addr: String,
}

#[derive(serde::Serialize)]
pub struct ClassDump {
    pub name: String,
    pub methods: Vec<String>,
    pub super_class: Option<Box<ClassDump>>,
}

pub unsafe fn dump_class_to_file(cls: *const Class, out_file: impl AsRef<Path>) {
    let result = dump_class_methods(cls);
    let _ = serde_yaml::to_writer(
        std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(out_file)
            .unwrap(),
        &result,
    );
}

pub unsafe fn dump_class_methods(cls: *const Class) -> ClassDump {
    let mut count = 0;
    let methods = class_copyMethodList(cls, &mut count);
    let methods = core::slice::from_raw_parts(methods, count as _);
    let mut result = ClassDump {
        name: (*cls).name().to_owned(),
        methods: Vec::with_capacity(methods.len()),
        super_class: None,
    };
    for method in methods {
        let method = &**method;
        let sel = method.name().name().to_owned();
        let argn = method.arguments_count();
        let mut argv = Vec::with_capacity(argn);
        let ret = method.return_type();
        for i in 0..argn {
            argv.push(method.argument_type(i).unwrap());
        }
        let enc = method_type_encoding(&ret, &argv)
            .to_string_lossy()
            .to_string();
        result
            .methods
            .push(format!("{:?} {} {}", method.implementation(), enc, sel));
    }
    if let Some(superclass) = (*cls).superclass() {
        if superclass.name() != "NSObject" {
            result.super_class = Some(Box::new(dump_class_methods(superclass)));
        }
    }
    result
}

pub unsafe fn add_method<F>(original_cls: *const Class, selector: Sel, hook_func: F)
where
    F: MethodImplementation,
{
    println!(
        "正在向 {} 添加实例函数 [{} {}]",
        (*original_cls).name(),
        (*original_cls).name(),
        selector.name()
    );

    let ret = F::Ret::encode();
    let args = F::Args::encodings();
    let args = args.as_ref();
    let types = method_type_encoding(&ret, args);

    class_addMethod(original_cls as _, selector, hook_func.imp(), types.as_ptr());
}

pub unsafe fn hook_method<F>(
    original_cls: *const Class,
    original_selector: Sel,
    swizzled_selector: Sel,
    hook_func: F,
) where
    F: MethodImplementation<Callee = Object>,
{
    println!(
        "正在 Hook 实例函数 [{} {}] -> [NSObject {}]",
        (*original_cls).name(),
        original_selector.name(),
        swizzled_selector.name()
    );
    let original_method = class_getInstanceMethod(original_cls, original_selector);

    assert!(!original_method.is_null(), "找不到原始方法");

    let ret = (*original_method).return_type();
    let args = (0..(*original_method).arguments_count())
        .map(|i| (*original_method).argument_type(i).unwrap())
        .collect::<Vec<_>>();
    let types = method_type_encoding(&ret, &args);

    let swizzled_class = class!(NSObject);

    runtime::class_addMethod(
        swizzled_class as *const _ as usize as *mut _,
        swizzled_selector,
        hook_func.imp(),
        types.as_ptr(),
    );

    let swizzled_method = class_getInstanceMethod(swizzled_class, swizzled_selector);
    if !(original_method.is_null() || swizzled_method.is_null()) {
        assert_eq!(
            (*original_method).arguments_count(),
            (*swizzled_method).arguments_count()
        );
        assert_eq!(
            (*original_method).return_type(),
            (*swizzled_method).return_type()
        );
        for i in 0..((*original_method).arguments_count()) {
            assert_eq!(
                (*original_method).argument_type(i).unwrap().as_str(),
                (*swizzled_method).argument_type(i).unwrap().as_str()
            );
        }
        method_exchangeImplementations(original_method as _, swizzled_method as _);
    }
}

pub unsafe fn copy_method(
    from_cls: *const Class,
    dest_cls: *const Class,
    from_sel: Sel,
    dest_sel: Sel,
) {
    println!(
        "正在复制实例函数 [{} {}] -> [{} {}]",
        (*from_cls).name(),
        from_sel.name(),
        (*from_cls).name(),
        from_sel.name(),
    );
    let from_method = class_getInstanceMethod(from_cls, from_sel);

    assert!(!from_method.is_null(), "原类不存在或未找到");

    let ret = (*from_method).return_type();
    let args = (0..(*from_method).arguments_count())
        .map(|i| (*from_method).argument_type(i).unwrap())
        .collect::<Vec<_>>();
    let types = method_type_encoding(&ret, &args);
    let imp = (*from_method).implementation();

    runtime::class_addMethod(dest_cls as _, dest_sel, imp, types.as_ptr());
}

pub unsafe fn hook_class_method<F>(
    original_cls: *const Class,
    original_selector: Sel,
    swizzled_selector: Sel,
    hook_func: F,
) where
    F: MethodImplementation<Callee = Class>,
{
    nslog!(
        "正在 Hook 类函数 [{} {}] -> [NSObject {}]",
        (*original_cls).name(),
        original_selector.name(),
        swizzled_selector.name()
    );
    let original_method = class_getClassMethod(original_cls, original_selector);

    let ret = (*original_method).return_type();
    let args = (0..(*original_method).arguments_count())
        .map(|i| (*original_method).argument_type(i).unwrap())
        .collect::<Vec<_>>();
    let types = method_type_encoding(&ret, &args);

    let swizzled_class = class!(NSObject);

    runtime::class_addMethod(
        swizzled_class as *const _ as usize as *mut _,
        swizzled_selector,
        hook_func.imp(),
        types.as_ptr(),
    );

    let swizzled_method = class_getClassMethod(swizzled_class, swizzled_selector);
    if !(original_method.is_null() || swizzled_method.is_null()) {
        assert_eq!(
            (*original_method).arguments_count(),
            (*swizzled_method).arguments_count()
        );
        assert_eq!(
            (*original_method).return_type(),
            (*swizzled_method).return_type()
        );
        for i in 0..((*original_method).arguments_count()) {
            assert_eq!(
                (*original_method).argument_type(i).unwrap().as_str(),
                (*swizzled_method).argument_type(i).unwrap().as_str()
            );
        }
        method_exchangeImplementations(original_method as _, swizzled_method as _);
    }
}
