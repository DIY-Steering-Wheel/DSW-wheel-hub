from __future__ import annotations

import os
from pathlib import Path
import sys

import webview

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from wheel_control_webview.controller import WebApi, WheelController
else:
    from .controller import WebApi, WheelController


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
    ui_root = root / "wheel_control_webview" / "ui"
    template = (ui_root / "template.html").read_text(encoding="utf-8")

    for tab_name in TAB_ORDER:
        placeholder = f"<!-- TAB:{tab_name} -->"
        fragment = (ui_root / "tabs" / f"{tab_name}.html").read_text(encoding="utf-8")
        template = template.replace(placeholder, fragment)

    build_dir = root / "wheel_control_webview" / ".webview"
    build_dir.mkdir(parents=True, exist_ok=True)
    target = build_dir / "index.html"
    target.write_text(template, encoding="utf-8")
    return target


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    controller = WheelController(root)
    api = WebApi(controller)
    index_path = build_ui(root)
    storage_path = root / "wheel_control_webview" / ".webview"
    storage_path.mkdir(parents=True, exist_ok=True)
    preferred_gui = os.environ.get("BRWHEEL_WEBVIEW_GUI", "").strip().lower()

    if not preferred_gui:
        preferred_gui = "edgechromium"

    window_options = {
        "title": "BR Wheel Control Aero",
        "url": index_path.as_uri(),
        "js_api": api,
        "width": 1440,
        "height": 980,
        "min_size": (800, 600),
        "maximized": True,
        "confirm_close": True,
        "text_select": False,
    }

    print(f"[BR Wheel Control Aero] Iniciando backend: {preferred_gui}")
    webview.create_window(**window_options)
    webview.start(
        gui=preferred_gui,
        debug=False,
        private_mode=False,
        storage_path=str(storage_path),
    )


if __name__ == "__main__":
    main()
