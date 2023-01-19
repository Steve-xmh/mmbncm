export const Button: React.FC<
	React.PropsWithChildren<React.HTMLAttributes<HTMLAnchorElement>>
> = (props) => {
	const { children, className, ...other } = props;
	return (
		<a className={`u-ibtn5 bncm-btn u-ibtnsz8 ${className || ""}`} {...other}>
			{children}
		</a>
	);
};
