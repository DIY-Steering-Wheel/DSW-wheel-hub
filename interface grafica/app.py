from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile

import webview

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from backend import WebApi, WheelController
else:
    from backend import WebApi, WheelController


TAB_ORDER = [
    "connection",
    "about",
    "wheel",
    "ffb",
    "pedals",
    "shifter",
    "serial",
]


def build_ui(root: Path) -> Path:
    ui_root = root / "interface grafica" / "ui"
    # When frozen by cx_Freeze the layout may place resource files next to the
    # executable instead of under the package lib folder. Try a few fallbacks
    # so the app can find the UI files both in source and in the frozen bundle.
    if not ui_root.exists():
        exe_parent = Path(sys.executable).resolve().parent
        alt1 = exe_parent / "interface grafica" / "ui"
        alt2 = exe_parent.parent / "interface grafica" / "ui"
        if alt1.exists():
            ui_root = alt1
        elif alt2.exists():
            ui_root = alt2

    template = (ui_root / "template.html").read_text(encoding="utf-8")

    for tab_name in TAB_ORDER:
        placeholder = f"<!-- TAB:{tab_name} -->"
        fragment = (ui_root / "tabs" / f"{tab_name}.html").read_text(encoding="utf-8")
        template = template.replace(placeholder, fragment)

    target = ui_root / "index.html"
    target.write_text(template, encoding="utf-8")
    return target


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    controller = WheelController(root)
    api = WebApi(controller)
    index_path = build_ui(root)
    storage_path = Path(tempfile.gettempdir()) / "DSW-Wheel-Hub-webview"
    storage_path.mkdir(parents=True, exist_ok=True)
    preferred_gui = os.environ.get("BRWHEEL_WEBVIEW_GUI", "").strip().lower()

    if not preferred_gui:
        preferred_gui = "edgechromium"

    window_options = {
        "title": "DSW Wheel Hub By Valdemir",
        "url": index_path.as_uri(),
        "js_api": api,
        "width": 1440,
        "height": 980,
        "min_size": (800, 600),
        "maximized": True,
        "confirm_close": True,
        "text_select": False,
    }

    print(f"[DSW Wheel Hub] Iniciando backend: {preferred_gui}")
    webview.create_window(**window_options)
    webview.start(
        gui=preferred_gui,
        debug=False,
        private_mode=False,
        storage_path=str(storage_path),
    )


if __name__ == "__main__":
    main()
