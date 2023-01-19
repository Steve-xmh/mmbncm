var vConsole = new window.VConsole();
vConsole.hideSwitch();
window.betterncm_native = {
    app: {
        version() {
            return "macOS";
        }
    }
}
document.body.style.backgroundColor = "transparent"
window.addEventListener("keypress", (evt) => {
    if (evt.key === "p" && evt.metaKey) {
        vConsole.show()
    }
})