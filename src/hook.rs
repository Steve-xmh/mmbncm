use rust_macios::{
    core_graphics::{CGPoint, CGSize},
    objective_c_runtime::{declare::MethodImplementation, runtime::*, *},
};
use std::ffi::CString;

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
