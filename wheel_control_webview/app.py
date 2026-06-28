from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys

import webview

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from wheel_control_webview.controller import WebApi, WheelController
else:
    from .controller import WebApi, WheelController


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    controller = WheelController(root)
    api = WebApi(controller)
    index_path = root / "wheel_control_webview" / "ui" / "index.html"
    storage_path = root / "wheel_control_webview" / ".webview"
    storage_path.mkdir(parents=True, exist_ok=True)
    preferred_gui = os.environ.get("BRWHEEL_WEBVIEW_GUI", "").strip().lower()

    if not preferred_gui:
        preferred_gui = "qt" if importlib.util.find_spec("qtpy") else "mshtml"

    window_options = {
        "title": "BR Wheel Control Aero",
        "url": index_path.as_uri(),
        "js_api": api,
        "width": 1440,
        "height": 980,
        "min_size": (1180, 760),
        "maximized": True,
        "confirm_close": True,
        "text_select": True,
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
