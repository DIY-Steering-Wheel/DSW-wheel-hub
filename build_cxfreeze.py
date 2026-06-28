from __future__ import annotations

from pathlib import Path
import sys

from cx_Freeze import Executable, setup


ROOT = Path(__file__).resolve().parent
APP_DIR = ROOT / "interface grafica"
ICON_CANDIDATES = [
    ROOT / "resources" / "dsw-wheel-hub.ico",
    APP_DIR / "DSWDSW.ico",
    APP_DIR / "icon.ico",
]


def existing_icon() -> str | None:
    for path in ICON_CANDIDATES:
        if path.exists():
            return str(path)
    return None


include_files = [
    (str(APP_DIR / "bootstrap-5.3.0-dist"), "interface grafica/bootstrap-5.3.0-dist"),
    (str(APP_DIR / "bootstrap-icons-1.13.1"), "interface grafica/bootstrap-icons-1.13.1"),
    (str(APP_DIR / "ui"), "interface grafica/ui"),
    (str(APP_DIR / "FFB_misc_programs"), "interface grafica/FFB_misc_programs"),
    (str(APP_DIR / "promicro hex"), "interface grafica/promicro hex"),
    (str(APP_DIR / "leonardo hex"), "interface grafica/leonardo hex"),
    (str(APP_DIR / "profiles"), "interface grafica/profiles"),
    (str(APP_DIR / "avrdude.exe"), "interface grafica/avrdude.exe"),
    (str(APP_DIR / "avrdude.conf"), "interface grafica/avrdude.conf"),
    (str(APP_DIR / "libusb0.dll"), "interface grafica/libusb0.dll"),
]

for optional_dir in [ROOT / "resources", APP_DIR / "wirings", ROOT / "wirings"]:
    if optional_dir.exists():
        target_name = "interface grafica/wirings" if optional_dir.name == "wirings" else optional_dir.name
        if not any(existing[1] == target_name for existing in include_files):
            include_files.append((str(optional_dir), target_name))

# Also include top-level firmware folders if present (some repo layouts place
# hex files next to the project root rather than inside the UI folder).
for extra in [ROOT / "leonardo hex", ROOT / "promicro hex", ROOT / "FFB_misc_programs"]:
    if extra.exists():
        tgt = f"interface grafica/{extra.name}"
        if not any(existing[1] == tgt for existing in include_files):
            include_files.append((str(extra), tgt))


build_exe_options = {
    "packages": ["serial", "webview"],
    "includes": ["ctypes", "json", "tempfile", "webview.platforms", "webview.platforms.edgechromium", "backend"],
    "include_files": include_files,
    "include_msvcr": True,
    "excludes": ["tkinter", "unittest"],
    "optimize": 1,
}

base = "Win32GUI" if sys.platform == "win32" else None

# Ensure the application package directory is on sys.path so cx_Freeze
# can find local modules like `backend` during module analysis.
sys.path.insert(0, str(APP_DIR))

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
