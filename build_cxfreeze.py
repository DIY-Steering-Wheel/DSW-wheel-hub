from __future__ import annotations

from pathlib import Path
import sys

from cx_Freeze import Executable, setup


ROOT = Path(__file__).resolve().parent
APP_DIR = ROOT / "wheel_control_webview"
ICON_CANDIDATES = [
    ROOT / "resources" / "dsw-wheel-hub.ico",
    APP_DIR / "icon.ico",
]


def existing_icon() -> str | None:
    for path in ICON_CANDIDATES:
        if path.exists():
            return str(path)
    return None


include_files = [
    (str(APP_DIR / "bootstrap-5.3.0-dist"), "wheel_control_webview/bootstrap-5.3.0-dist"),
    (str(APP_DIR / "bootstrap-icons-1.13.1"), "wheel_control_webview/bootstrap-icons-1.13.1"),
    (str(APP_DIR / "ui"), "wheel_control_webview/ui"),
    (str(APP_DIR / "FFB_misc_programs"), "wheel_control_webview/FFB_misc_programs"),
    (str(APP_DIR / "promicro hex"), "wheel_control_webview/promicro hex"),
    (str(APP_DIR / "leonardo hex"), "wheel_control_webview/leonardo hex"),
    (str(APP_DIR / "profiles"), "wheel_control_webview/profiles"),
    (str(APP_DIR / "avrdude.exe"), "wheel_control_webview/avrdude.exe"),
    (str(APP_DIR / "avrdude.conf"), "wheel_control_webview/avrdude.conf"),
    (str(APP_DIR / "libusb0.dll"), "wheel_control_webview/libusb0.dll"),
]

for optional_dir in [ROOT / "resources", ROOT / "wirings"]:
    if optional_dir.exists():
        include_files.append((str(optional_dir), optional_dir.name))


build_exe_options = {
    "packages": ["wheel_control_webview", "serial", "webview"],
    "includes": ["ctypes", "json", "tempfile"],
    "include_files": include_files,
    "include_msvcr": True,
    "excludes": ["tkinter", "unittest"],
    "optimize": 1,
}

base = "Win32GUI" if sys.platform == "win32" else None

setup(
    name="DSW Wheel Hub",
    version="1.0.0",
    description="Hub de configuracao e firmware para bases DSW Wheel.",
    options={"build_exe": build_exe_options},
    executables=[
        Executable(
            script=str(APP_DIR / "app.py"),
            base=base,
            target_name="DSW Wheel Hub.exe",
            icon=existing_icon(),
        )
    ],
)
