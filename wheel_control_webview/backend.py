from __future__ import annotations

import copy
import json
import re
import subprocess
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import serial
from serial.tools import list_ports


SERIAL_BAUDRATE = 115200
SERIAL_TIMEOUT = 0.35
HISTORY_LIMIT = 120
PROFILE_LIMIT = 24
PORT_SCAN_INTERVAL = 2.5
STATE_POLL_INTERVAL = 1.0
SHIFTER_POLL_INTERVAL = 0.75
TRAFFIC_WINDOW_SECONDS = 1.0
BACKGROUND_TICK_SECONDS = 0.3
BOOTLOADER_DETECT_TIMEOUT = 12.0
AVRDUDE_TIMEOUT = 180.0

KNOWN_VID_PID = {
    (0x2341, 0x8036),  # Arduino Leonardo
    (0x2341, 0x8037),  # Arduino Micro
    (0x2A03, 0x8036),  # Arduino.org Leonardo
    (0x2A03, 0x8037),  # Arduino.org Micro
    (0x1B4F, 0x9205),  # SparkFun Pro Micro 5V
    (0x1B4F, 0x9206),  # SparkFun Pro Micro 3.3V
    (0x1B4F, 0x9208),  # LilyPad USB / related ATmega32U4 variants
}

FLAG_DETAILS: dict[str, dict[str, str]] = {
    "a": {"title": "Autocalib", "description": "Auto calibracao dos pedais habilitada."},
    "b": {"title": "2 FFB Axis", "description": "Suporte a dois eixos FFB fisicos."},
    "c": {"title": "Center Button", "description": "Botao fisico de recentro habilitado."},
    "d": {"title": "Analog X", "description": "Sem encoder optico; eixo principal por leitura analogica."},
    "e": {"title": "Extra Buttons", "description": "Dois botoes digitais extras ocupando entradas analogicas."},
    "f": {"title": "XY Shifter", "description": "Shifter H analogico XY habilitado."},
    "g": {"title": "DAC", "description": "Saida FFB analogica por MCP4725."},
    "h": {"title": "Hat Switch", "description": "Primeiros botoes reservados para D-pad/HAT."},
    "i": {"title": "Averaging", "description": "Media das entradas analogicas habilitada."},
    "k": {"title": "Split Axis", "description": "Split axis para acelerador/freio combinado."},
    "l": {"title": "Load Cell", "description": "Freio com HX711 / load cell."},
    "m": {"title": "Pro Micro", "description": "Pinagem de Arduino Pro Micro."},
    "n": {"title": "Button Box", "description": "Caixa externa de botoes via Arduino Nano/registradores."},
    "p": {"title": "No EEPROM", "description": "Sem persistencia em EEPROM."},
    "r": {"title": "24 Buttons", "description": "Shift registers SN74ALS166N/SN74HC165N."},
    "s": {"title": "ADS1015", "description": "ADC externo para entradas analogicas."},
    "t": {"title": "Button Matrix", "description": "Matriz 4x4 de botoes."},
    "u": {"title": "TCA9548A", "description": "Multiplexador i2C para segundo AS5600."},
    "w": {"title": "AS5600", "description": "Encoder magnetico AS5600."},
    "x": {"title": "FFB Axis Select", "description": "Selecao de qual eixo analogico dirige o xFFB."},
    "z": {"title": "Z Index", "description": "Encoder optico com Z-index."},
}

AXIS_LABELS = {
    0: "X",
    1: "Y",
    2: "Z",
    3: "RX",
    4: "RY",
    5: "RZ",
}

FFB_COMMANDS = {
    "general_gain": "FG",
    "constant_gain": "FC",
    "damper_gain": "FD",
    "friction_gain": "FF",
    "periodic_gain": "FS",
    "spring_gain": "FM",
    "inertia_gain": "FI",
    "center_gain": "FA",
    "stop_gain": "FB",
    "min_torque_percent_x10": "FJ",
}

PROFILE_SCHEMA_VERSION = 1

FIRMWARE_TRANSLATIONS = [
    ("the same as", "igual a"),
    ("but has", "mas tem"),
    ("but does not have", "mas nao tem"),
    ("without support for", "sem suporte para"),
    ("with support for", "com suporte para"),
    ("instead of", "em vez de"),
    ("pedal autocalibration", "autocalibracao dos pedais"),
    ("pedal autocalib", "autocalibracao dos pedais"),
    ("manual pedal axis calibration", "calibracao manual dos eixos dos pedais"),
    ("manual calibration", "calibracao manual"),
    ("load cell support with hx711", "suporte a load cell com HX711"),
    ("support for ads1015 external adc for pedals", "suporte a ADC externo ADS1015 para os pedais"),
    ("analog ffb output", "saida FFB analogica"),
    ("hardware wheel recenter button", "botao fisico de recentro do volante"),
    ("hat switch support", "suporte a hat switch"),
    ("button matrix support", "suporte a matriz de botoes"),
    ("shift register", "shift register"),
    ("xy analog shifter support", "suporte a cambio XY analogico"),
    ("magnetic encoder", "encoder magnetico"),
    ("optical encoder", "encoder optico"),
    ("button pin mapping fixes", "correcoes de pinagem dos botoes"),
    ("with 2 ffb axis and 4 channel pwm output", "com 2 eixos FFB e saida PWM de 4 canais"),
]


@dataclass
class CommandResult:
    ok: bool
    command: str
    response: str = ""
    message: str = ""


def _now() -> str:
    return time.strftime("%H:%M:%S")


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _sanitize_profile_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._ -]+", "", (name or "").strip())
    cleaned = cleaned.strip(" .")
    return cleaned[:64]


def _extract_firmware_code(name: str) -> str:
    match = re.search(r"_v([0-9a-z]+)\.hex$", (name or "").lower())
    return match.group(1) if match else ""


def _translate_firmware_description(text: str) -> str:
    translated = (text or "").strip()
    lower = translated.lower()
    for source, target in FIRMWARE_TRANSLATIONS:
        if source in lower:
            pattern = re.compile(re.escape(source), re.IGNORECASE)
            translated = pattern.sub(target, translated)
            lower = translated.lower()
    return translated


class WheelController:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.app_dir = root / "wheel_control_webview"
        self.profile_dir = root / "wheel_control_webview" / "profiles"
        self.profile_dir.mkdir(parents=True, exist_ok=True)
        self.firmware_root = self.app_dir / "promicro hex"
        self.avrdude_path = self.app_dir / "avrdude.exe"
        self.avrdude_conf_path = self.app_dir / "avrdude.conf"

        self._lock = threading.RLock()
        self._serial: serial.Serial | None = None
        self._history: deque[dict[str, Any]] = deque(maxlen=HISTORY_LIMIT)
        self._traffic_history: deque[dict[str, Any]] = deque(maxlen=256)
        self._ports: list[dict[str, Any]] = []
        self._last_port_scan = 0.0
        self._last_state_poll = 0.0
        self._last_shifter_poll = 0.0

        self.connection: dict[str, Any] = {
            "connected": False,
            "port": "",
            "description": "",
            "manufacturer": "",
            "product": "",
            "vid": None,
            "pid": None,
        }
        self.firmware: dict[str, Any] = {
            "version": "",
            "code": "",
            "flags": [],
            "flag_details": [],
        }
        self.capabilities: dict[str, Any] = self._empty_capabilities()
        self.settings: dict[str, Any] = self._default_settings()
        self.shifter: dict[str, Any] = {
            "available": False,
            "cal": [0, 255, 511, 767, 1023],
            "cfg": 0,
            "cfg_flags": {
                "reverse_inverted": False,
                "gear8_mode": False,
                "invert_x": False,
                "invert_y": False,
            },
            "live": {"x": 0, "y": 0},
        }
        self.manual_calibration: dict[str, Any] = {
            "available": False,
            "brake_min": 0,
            "brake_max": 1023,
            "accel_min": 0,
            "accel_max": 1023,
            "clutch_min": 0,
            "clutch_max": 1023,
            "hbrake_min": 0,
            "hbrake_max": 1023,
        }
        self.diagnostics: dict[str, Any] = {
            "controller_state": None,
            "controller_state_label": "Desconectado",
        }
        self.serial_stats: dict[str, Any] = {
            "baudrate": SERIAL_BAUDRATE,
            "tx_bytes_total": 0,
            "rx_bytes_total": 0,
            "tx_usage_percent": 0.0,
            "rx_usage_percent": 0.0,
            "commands_total": 0,
        }
        self.last_error = ""
        self.notes: list[str] = []
        self.flash_state: dict[str, Any] = {
            "baseline_ports": [],
            "bootloader_port": "",
            "selected_firmware": "",
            "last_log": "",
            "busy": False,
        }
        self.firmware_catalog = self._load_firmware_catalog()
        self.firmware_feature_options = self._build_firmware_feature_options()
        self._stop_event = threading.Event()
        self._refresh_requested = threading.Event()
        self._worker_thread = threading.Thread(target=self._background_loop, name="BRWheelBackground", daemon=True)
        self._worker_thread.start()

    def _empty_capabilities(self) -> dict[str, Any]:
        return {
            "board_family": "Desconhecido",
            "encoder": "Desconhecido",
            "output": "PWM digital",
            "pedal_calibration": "Manual",
            "supports_xy_shifter": False,
            "supports_manual_calibration": True,
            "supports_pedal_reset": False,
            "supports_z_reset": False,
            "supports_output_setup": True,
            "supports_save": True,
            "supports_brake_scaling": True,
            "supports_axis_select": False,
            "has_load_cell": False,
            "has_two_ffb_axis": False,
            "has_hat_switch": False,
            "has_button_matrix": False,
            "has_button_box": False,
            "has_shift_register": False,
            "has_extra_buttons": False,
            "has_ads1015": False,
            "has_averaging": False,
            "has_tca9548": False,
            "has_split_axis": False,
            "button_capacity": "Dinamico",
            "flag_titles": [],
        }

    def _default_settings(self) -> dict[str, Any]:
        desktop = self._decode_desktop_effects(0, supports_axis_select=False)
        output = self._decode_output_state(9, uses_dac=False)
        return {
            "rotation_deg": 1080,
            "general_gain": 100,
            "damper_gain": 50,
            "friction_gain": 50,
            "constant_gain": 100,
            "periodic_gain": 100,
            "spring_gain": 100,
            "inertia_gain": 50,
            "center_gain": 70,
            "stop_gain": 0,
            "min_torque_raw": 0,
            "min_torque_percent_x10": 0,
            "brake_pressure": 45,
            "brake_pressure_label": "Brake scaling",
            "desktop_effects": 0,
            "desktop": desktop,
            "output_resolution": 500,
            "encoder_cpr": 2400,
            "pwm_state": 9,
            "output": output,
        }

    def _background_loop(self) -> None:
        while not self._stop_event.wait(BACKGROUND_TICK_SECONDS):
            try:
                self.refresh_ports(force=False)
                if self._refresh_requested.is_set():
                    self._refresh_requested.clear()
                    if self._is_connected():
                        self.load_device_snapshot()
                elif self._is_connected():
                    self._poll_runtime_state()
                else:
                    with self._lock:
                        self.diagnostics["controller_state"] = None
                        self.diagnostics["controller_state_label"] = "Desconectado"
                        self.serial_stats["tx_usage_percent"] = 0.0
                        self.serial_stats["rx_usage_percent"] = 0.0
            except Exception as exc:
                with self._lock:
                    self._set_error(str(exc))

    def request_snapshot_refresh(self) -> None:
        self._refresh_requested.set()

    def _parse_ver_info(self) -> dict[str, dict[str, Any]]:
        target = self.firmware_root / "ver_info_promicro.txt"
        if not target.exists():
            return {}

        metadata: dict[str, dict[str, Any]] = {}
        required_version = ""
        for raw_line in target.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if not line:
                continue

            header_match = re.match(
                r"- firmware hex versions bellow require wheel control v(?P<version>[0-9.]+) or newer",
                line.lower(),
            )
            if header_match:
                required_version = f"v{header_match.group('version')}"
                continue

            parts = re.split(r"\t+|\s{2,}", raw_line.strip(), maxsplit=1)
            if len(parts) < 2:
                continue
            code = parts[0].strip().lower()
            if not re.match(r"^\d+[a-z]+$", code):
                continue
            metadata[code] = {
                "minimum_app_version": required_version,
                "description_en": parts[1].strip(),
                "description_pt": _translate_firmware_description(parts[1].strip()),
            }
        return metadata

    def _load_firmware_catalog(self) -> list[dict[str, Any]]:
        metadata = self._parse_ver_info()
        catalog: list[dict[str, Any]] = []

        if not self.firmware_root.exists():
            return catalog

        for path in sorted(self.firmware_root.rglob("*.hex")):
            code = _extract_firmware_code(path.name)
            if not code:
                continue

            code_match = re.match(r"(?P<series>\d+)(?P<flags>[a-z]+)", code)
            series = int(code_match.group("series")) if code_match else 0
            flags = list(code_match.group("flags")) if code_match else []
            details = [
                {
                    "flag": flag,
                    "title": FLAG_DETAILS.get(flag, {}).get("title", flag.upper()),
                    "description": FLAG_DETAILS.get(flag, {}).get("description", "Recurso de firmware."),
                }
                for flag in flags
            ]
            info = metadata.get(code, {})
            catalog.append(
                {
                    "id": path.name,
                    "name": path.name,
                    "code": code,
                    "series": series,
                    "flags": flags,
                    "flag_titles": [item["title"] for item in details],
                    "flag_details": details,
                    "minimum_app_version": info.get("minimum_app_version", ""),
                    "description_en": info.get("description_en", ""),
                    "description_pt": info.get("description_pt", ""),
                    "folder": path.parent.name,
                    "path": str(path),
                }
            )

        catalog.sort(key=lambda item: (item["series"], len(item["flags"]), item["code"]), reverse=True)
        return catalog

    def _build_firmware_feature_options(self) -> list[dict[str, str]]:
        flags = sorted({flag for item in self.firmware_catalog for flag in item["flags"]})
        return [
            {
                "flag": flag,
                "title": FLAG_DETAILS.get(flag, {}).get("title", flag.upper()),
                "description": FLAG_DETAILS.get(flag, {}).get("description", "Recurso de firmware."),
            }
            for flag in flags
        ]

    def _build_profile_payload(self, name: str) -> dict[str, Any]:
        safe_name = _sanitize_profile_name(name)
        return {
            "schema_version": PROFILE_SCHEMA_VERSION,
            "name": safe_name,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "firmware_version": self.firmware["version"],
            "firmware_flags": self.firmware["flags"],
            "settings": self.settings,
            "shifter": self.shifter,
            "manual_calibration": self.manual_calibration,
        }

    def _push_history(self, direction: str, command: str, response: str, ok: bool) -> None:
        self._history.appendleft(
            {
                "time": _now(),
                "direction": direction,
                "command": command,
                "response": response,
                "ok": ok,
            }
        )

    def _set_error(self, message: str) -> None:
        self.last_error = message

    def _clear_error(self) -> None:
        self.last_error = ""

    def _record_traffic(self, tx_bytes: int = 0, rx_bytes: int = 0) -> None:
        tx_bytes = max(0, tx_bytes)
        rx_bytes = max(0, rx_bytes)
        now = time.time()
        self._traffic_history.append(
            {
                "time": now,
                "tx_bytes": tx_bytes,
                "rx_bytes": rx_bytes,
            }
        )
        self.serial_stats["tx_bytes_total"] += tx_bytes
        self.serial_stats["rx_bytes_total"] += rx_bytes
        if tx_bytes > 0:
            self.serial_stats["commands_total"] += 1

        while self._traffic_history and now - self._traffic_history[0]["time"] > TRAFFIC_WINDOW_SECONDS:
            self._traffic_history.popleft()

        tx_recent = sum(item["tx_bytes"] for item in self._traffic_history)
        rx_recent = sum(item["rx_bytes"] for item in self._traffic_history)
        divisor = max(float(SERIAL_BAUDRATE), 1.0)
        self.serial_stats["tx_usage_percent"] = min(100.0, round((tx_recent * 10.0 / divisor) * 100.0, 2))
        self.serial_stats["rx_usage_percent"] = min(100.0, round((rx_recent * 10.0 / divisor) * 100.0, 2))

    def _port_to_dict(self, port: Any) -> dict[str, Any]:
        description = port.description or ""
        manufacturer = getattr(port, "manufacturer", "") or ""
        product = getattr(port, "product", "") or ""
        hwid = getattr(port, "hwid", "") or ""
        score = 0
        text = " ".join([description, manufacturer, product, hwid, port.device]).lower()

        if (port.vid, port.pid) in KNOWN_VID_PID:
            score += 5
        if "arduino" in text or "leonardo" in text or "micro" in text or "sparkfun" in text:
            score += 2
        if "pro micro" in text or "promicro" in text:
            score += 2
        if "usb serial" in text or "cdc" in text:
            score += 1

        return {
            "device": port.device,
            "description": description,
            "manufacturer": manufacturer,
            "product": product,
            "hwid": hwid,
            "vid": port.vid,
            "pid": port.pid,
            "likely": score > 0,
            "score": score,
        }

    def refresh_ports(self, force: bool = False) -> list[dict[str, Any]]:
        with self._lock:
            now = time.time()
            if not force and now - self._last_port_scan < PORT_SCAN_INTERVAL:
                return self._ports

            ports = [self._port_to_dict(port) for port in list_ports.comports()]
            ports.sort(key=lambda item: (-item["score"], item["device"]))
            self._ports = ports
            self._last_port_scan = now
            return self._ports

    def _is_connected(self) -> bool:
        return bool(self._serial and self._serial.is_open)

    def _close_serial(self) -> None:
        if self._serial:
            try:
                if self._serial.is_open:
                    self._serial.close()
            except serial.SerialException:
                pass
        self._serial = None
        self.connection.update(
            {
                "connected": False,
                "port": "",
                "description": "",
                "manufacturer": "",
                "product": "",
                "vid": None,
                "pid": None,
            }
        )

    def disconnect(self) -> dict[str, Any]:
        with self._lock:
            self._close_serial()
            self.diagnostics["controller_state"] = None
            self.diagnostics["controller_state_label"] = "Desconectado"
            self.serial_stats["tx_usage_percent"] = 0.0
            self.serial_stats["rx_usage_percent"] = 0.0
            self.flash_state["bootloader_port"] = ""
            return {"ok": True, "message": "Porta serial fechada."}

    def _open_port(self, port_name: str) -> serial.Serial:
        ser = serial.Serial()
        ser.port = port_name
        ser.baudrate = SERIAL_BAUDRATE
        ser.timeout = SERIAL_TIMEOUT
        ser.write_timeout = SERIAL_TIMEOUT
        ser.inter_byte_timeout = SERIAL_TIMEOUT
        ser.rtscts = False
        ser.dsrdtr = False
        ser.exclusive = False
        ser.open()
        try:
            ser.setDTR(False)
            ser.setRTS(False)
        except serial.SerialException:
            pass
        ser.reset_input_buffer()
        ser.reset_output_buffer()
        return ser

    def _read_response_line(self, ser: serial.Serial, timeout: float = SERIAL_TIMEOUT) -> str:
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = ser.readline()
            if not raw:
                continue
            text = raw.decode("utf-8", errors="ignore").strip()
            if text:
                return text
        return ""

    def _identify_port(self, ser: serial.Serial) -> str:
        for _ in range(2):
            ser.reset_input_buffer()
            ser.write(b"V\r")
            ser.flush()
            response = self._read_response_line(ser, 0.55)
            if response.lower().startswith("fw-v"):
                return response
        return ""

    def connect(self, port_name: str = "") -> dict[str, Any]:
        with self._lock:
            self.refresh_ports(force=True)
            candidate_names: list[str] = []

            if port_name:
                candidate_names.append(port_name)
            else:
                candidate_names.extend([item["device"] for item in self._ports if item["likely"]])
                candidate_names.extend([item["device"] for item in self._ports if item["device"] not in candidate_names])

            if not candidate_names:
                self._set_error("Nenhuma porta serial encontrada.")
                return {"ok": False, "message": self.last_error}

            self._close_serial()

            for candidate in candidate_names:
                try:
                    ser = self._open_port(candidate)
                    version = self._identify_port(ser)
                    if not version:
                        ser.close()
                        continue

                    info = next((item for item in self._ports if item["device"] == candidate), None)
                    self._serial = ser
                    self.connection.update(
                        {
                            "connected": True,
                            "port": candidate,
                            "description": (info or {}).get("description", ""),
                            "manufacturer": (info or {}).get("manufacturer", ""),
                            "product": (info or {}).get("product", ""),
                            "vid": (info or {}).get("vid"),
                            "pid": (info or {}).get("pid"),
                        }
                    )
                    self._push_history("tx", "V", version, True)
                    self._clear_error()
                    self._apply_firmware_version(version)
                    self.load_device_snapshot()
                    self.request_snapshot_refresh()
                    return {"ok": True, "message": f"Conectado em {candidate}."}
                except (serial.SerialException, OSError) as exc:
                    self._set_error(f"Falha ao abrir {candidate}: {exc}")
                    continue

            return {"ok": False, "message": self.last_error or "Nao foi possivel validar a firmware em nenhuma porta."}

    def _require_connection(self) -> None:
        if not self._is_connected():
            raise RuntimeError("Nenhuma conexao serial ativa.")

    def _send_command(self, command: str, expect_response: bool = True, timeout: float = SERIAL_TIMEOUT) -> CommandResult:
        with self._lock:
            try:
                self._require_connection()
                assert self._serial is not None
                payload = command.strip()
                payload_bytes = (payload + "\r").encode("ascii", errors="ignore")
                self._serial.reset_input_buffer()
                self._serial.write(payload_bytes)
                self._serial.flush()
                response = self._read_response_line(self._serial, timeout) if expect_response else ""
                response_bytes = len(response.encode("utf-8", errors="ignore")) + (2 if response else 0)
                self._record_traffic(tx_bytes=len(payload_bytes), rx_bytes=response_bytes)
                ok = True
                self._push_history("tx", payload, response or ("(sem resposta)" if not expect_response else ""), ok)
                self._clear_error()
                return CommandResult(ok=True, command=payload, response=response)
            except (serial.SerialException, OSError, RuntimeError) as exc:
                self._set_error(str(exc))
                self._push_history("tx", command.strip(), str(exc), False)
                return CommandResult(ok=False, command=command.strip(), response="", message=str(exc))

    def _decode_desktop_effects(self, value: int, supports_axis_select: bool) -> dict[str, Any]:
        axis_index = (value >> 5) & 0x07
        return {
            "auto_center": bool(value & 0b00000001),
            "damper": bool(value & 0b00000010),
            "inertia": bool(value & 0b00000100),
            "friction": bool(value & 0b00001000),
            "monitor": bool(value & 0b00010000),
            "axis_index": axis_index,
            "axis_label": AXIS_LABELS.get(axis_index, f"Axis {axis_index}"),
            "supports_axis_select": supports_axis_select,
        }

    def _decode_output_state(self, value: int, uses_dac: bool) -> dict[str, Any]:
        if uses_dac:
            mode_code = (value >> 5) & 0x03
            mode_label = {
                0: "dac+-",
                1: "dac0-50-100",
                2: "dac+dir",
                3: "reservado",
            }.get(mode_code, "desconhecido")
            return {
                "uses_dac": True,
                "enabled": bool((value >> 7) & 0x01),
                "mode_code": mode_code,
                "mode_label": mode_label,
                "phase_correct": False,
                "frequency_index": 0,
                "frequency_label": "N/A",
            }

        phase_correct = bool(value & 0b00000001)
        mode_bits = ((value >> 6) & 0x01, (value >> 1) & 0x01)
        mode_label = {
            (0, 0): "pwm+-",
            (1, 0): "pwm0-50-100",
            (0, 1): "pwm+dir",
            (1, 1): "rcm",
        }.get(mode_bits, "desconhecido")
        frequency_index = (value >> 2) & 0x0F
        return {
            "uses_dac": False,
            "enabled": True,
            "mode_code": 0,
            "mode_label": mode_label,
            "phase_correct": phase_correct,
            "frequency_index": frequency_index,
            "frequency_label": f"Index {frequency_index}",
        }

    def _decode_shifter_cfg(self, cfg: int) -> dict[str, bool]:
        return {
            "reverse_inverted": bool(cfg & 0b00000001),
            "gear8_mode": bool(cfg & 0b00000010),
            "invert_x": bool(cfg & 0b00000100),
            "invert_y": bool(cfg & 0b00001000),
        }

    def _controller_state_label(self, value: int | None) -> str:
        return {
            0: "Sem calibracao / sem Z-index",
            1: "Pronto / calibrado",
            2: "Erro de calibracao",
            None: "Desconectado",
        }.get(value, "Estado desconhecido")

    def _apply_firmware_version(self, version: str) -> None:
        version = (version or "").strip()
        match = re.match(r"fw-v(?P<code>\d+)(?P<flags>[a-z]*)", version.lower())
        code = match.group("code") if match else ""
        flags = list(match.group("flags")) if match else []
        flag_details = [
            {
                "flag": flag,
                "title": FLAG_DETAILS.get(flag, {}).get("title", flag.upper()),
                "description": FLAG_DETAILS.get(flag, {}).get("description", "Opcao de firmware."),
            }
            for flag in flags
        ]
        self.firmware = {
            "version": version,
            "code": code,
            "flags": flags,
            "flag_details": flag_details,
        }

        caps = self._empty_capabilities()
        caps["board_family"] = "Pro Micro" if "m" in flags else "Leonardo / Micro"
        if "w" in flags:
            caps["encoder"] = "AS5600 magnetico"
        elif "d" in flags:
            caps["encoder"] = "Analogico / sem encoder optico"
        elif "z" in flags:
            caps["encoder"] = "Encoder optico com Z-index"
        else:
            caps["encoder"] = "Encoder optico"

        caps["output"] = "DAC analogico" if "g" in flags else "PWM digital"
        caps["pedal_calibration"] = "Automatica" if "a" in flags else "Manual"
        caps["supports_xy_shifter"] = "f" in flags
        caps["supports_manual_calibration"] = "a" not in flags
        caps["supports_pedal_reset"] = "a" in flags
        caps["supports_z_reset"] = "z" in flags
        caps["supports_output_setup"] = "p" not in flags
        caps["supports_save"] = "p" not in flags
        caps["supports_brake_scaling"] = True
        caps["supports_axis_select"] = "x" in flags
        caps["has_load_cell"] = "l" in flags
        caps["has_two_ffb_axis"] = "b" in flags
        caps["has_hat_switch"] = "h" in flags
        caps["has_button_matrix"] = "t" in flags
        caps["has_button_box"] = "n" in flags
        caps["has_shift_register"] = "r" in flags
        caps["has_extra_buttons"] = "e" in flags
        caps["has_ads1015"] = "s" in flags
        caps["has_averaging"] = "i" in flags
        caps["has_tca9548"] = "u" in flags
        caps["has_split_axis"] = "k" in flags
        caps["flag_titles"] = [item["title"] for item in flag_details]

        if "r" in flags and "n" in flags and "f" in flags:
            caps["button_capacity"] = "16 botoes"
        elif "r" in flags and "n" in flags:
            caps["button_capacity"] = "24 botoes"
        elif "n" in flags or "t" in flags:
            caps["button_capacity"] = "16 botoes"
        else:
            caps["button_capacity"] = "Base dinamica"

        self.capabilities = caps
        self.shifter["available"] = caps["supports_xy_shifter"]
        self.manual_calibration["available"] = caps["supports_manual_calibration"]
        self.settings["brake_pressure_label"] = "Load cell / brake pressure" if caps["has_load_cell"] else "PWM balance"

        notes = [
            f"Firmware {version or 'desconhecida'} detectada.",
            f"Encoder: {caps['encoder']}.",
            f"Saida FFB: {caps['output']}.",
        ]
        if caps["has_two_ffb_axis"]:
            notes.append("Build com dois eixos FFB fisicos.")
        if caps["has_tca9548"]:
            notes.append("TCA9548A ativo para expandir sensores i2C.")
        if not caps["supports_save"]:
            notes.append("Este build nao salva configuracoes em EEPROM.")
        self.notes = notes

    def _parse_u_response(self, response: str) -> None:
        parts = response.split()
        if len(parts) < 16:
            raise ValueError(f"Resposta U incompleta: {response}")

        values = [_safe_int(item) for item in parts[:16]]
        output_resolution = max(values[13], 1)
        min_torque_percent_x10 = round((values[10] / output_resolution) * 1000)
        self.settings.update(
            {
                "rotation_deg": values[0],
                "general_gain": values[1],
                "damper_gain": values[2],
                "friction_gain": values[3],
                "constant_gain": values[4],
                "periodic_gain": values[5],
                "spring_gain": values[6],
                "inertia_gain": values[7],
                "center_gain": values[8],
                "stop_gain": values[9],
                "min_torque_raw": values[10],
                "min_torque_percent_x10": min_torque_percent_x10,
                "brake_pressure": values[11],
                "desktop_effects": values[12],
                "desktop": self._decode_desktop_effects(values[12], self.capabilities["supports_axis_select"]),
                "output_resolution": values[13],
                "encoder_cpr": values[14],
                "pwm_state": values[15],
                "output": self._decode_output_state(values[15], self.capabilities["output"] == "DAC analogico"),
            }
        )

    def _poll_runtime_state(self) -> None:
        if not self._is_connected():
            return
        now = time.time()
        if now - self._last_state_poll >= STATE_POLL_INTERVAL:
            state_result = self._send_command("S")
            if state_result.ok and state_result.response:
                value = _safe_int(state_result.response, None)
                self.diagnostics["controller_state"] = value
                self.diagnostics["controller_state_label"] = self._controller_state_label(value)
            self._last_state_poll = now

        if self.shifter["available"] and now - self._last_shifter_poll >= SHIFTER_POLL_INTERVAL:
            live_result = self._send_command("HR")
            if live_result.ok and live_result.response:
                parts = live_result.response.split()
                if len(parts) >= 2:
                    self.shifter["live"] = {"x": _safe_int(parts[0]), "y": _safe_int(parts[1])}
            self._last_shifter_poll = now

    def load_device_snapshot(self) -> dict[str, Any]:
        version_result = self._send_command("V")
        if version_result.ok and version_result.response:
            self._apply_firmware_version(version_result.response)

        summary_result = self._send_command("U")
        if not summary_result.ok:
            return {"ok": False, "message": summary_result.message or "Falha ao ler configuracoes."}

        try:
            self._parse_u_response(summary_result.response)
        except ValueError as exc:
            self._set_error(str(exc))
            return {"ok": False, "message": str(exc)}

        self._poll_runtime_state()

        if self.shifter["available"]:
            shifter_result = self._send_command("HG")
            if shifter_result.ok and shifter_result.response:
                parts = shifter_result.response.split()
                if len(parts) >= 6:
                    cal = [_safe_int(item) for item in parts[:5]]
                    cfg = _safe_int(parts[5])
                    self.shifter.update(
                        {
                            "available": True,
                            "cal": cal,
                            "cfg": cfg,
                            "cfg_flags": self._decode_shifter_cfg(cfg),
                        }
                    )

        if self.manual_calibration["available"]:
            calib_result = self._send_command("YR")
            if calib_result.ok and calib_result.response:
                parts = calib_result.response.split()
                if len(parts) >= 8:
                    values = [_safe_int(item) for item in parts[:8]]
                    self.manual_calibration.update(
                        {
                            "available": True,
                            "brake_min": values[0],
                            "brake_max": values[1],
                            "accel_min": values[2],
                            "accel_max": values[3],
                            "clutch_min": values[4],
                            "clutch_max": values[5],
                            "hbrake_min": values[6],
                            "hbrake_max": values[7],
                        }
                    )

        return {"ok": True, "message": "Snapshot carregado."}

    def update_basic_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        commands: list[str] = []
        if payload.get("rotation_deg") is not None:
            commands.append(f"G {_safe_int(payload['rotation_deg'])}")
        if payload.get("encoder_cpr") is not None:
            commands.append(f"O {_safe_int(payload['encoder_cpr'])}")
        if payload.get("brake_pressure") is not None:
            commands.append(f"B {_safe_int(payload['brake_pressure'])}")

        for command in commands:
            result = self._send_command(command, expect_response=not command.startswith("R"))
            if not result.ok:
                return {"ok": False, "message": result.message or f"Falha em {command}."}

        self.load_device_snapshot()
        return {"ok": True, "message": "Ajustes basicos aplicados."}

    def update_ffb_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        for key, command in FFB_COMMANDS.items():
            if key not in payload or payload.get(key) is None:
                continue
            value = _safe_int(payload[key])
            result = self._send_command(f"{command} {value}")
            if not result.ok:
                return {"ok": False, "message": result.message or f"Falha em {command}."}

        self.load_device_snapshot()
        return {"ok": True, "message": "Ganhos FFB atualizados."}

    def update_desktop_effects(self, payload: dict[str, Any]) -> dict[str, Any]:
        value = 0
        if payload.get("auto_center"):
            value |= 1 << 0
        if payload.get("damper"):
            value |= 1 << 1
        if payload.get("inertia"):
            value |= 1 << 2
        if payload.get("friction"):
            value |= 1 << 3
        if payload.get("monitor"):
            value |= 1 << 4

        axis_index = _safe_int(payload.get("axis_index", 0))
        axis_index = max(0, min(axis_index, 7))
        value |= axis_index << 5

        result = self._send_command(f"E {value}")
        if not result.ok:
            return {"ok": False, "message": result.message or "Falha ao atualizar efeitos de desktop."}

        self.load_device_snapshot()
        return {"ok": True, "message": "Efeitos de desktop atualizados."}

    def update_output_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.capabilities["supports_output_setup"]:
            return {"ok": False, "message": "Este build nao permite alterar saida em runtime."}

        uses_dac = self.capabilities["output"] == "DAC analogico"
        if uses_dac:
            enabled = 1 if payload.get("enabled") else 0
            mode_code = _safe_int(payload.get("mode_code", 0))
            mode_code = max(0, min(mode_code, 2))
            value = (enabled << 7) | (mode_code << 5)
        else:
            phase_correct = 1 if payload.get("phase_correct") else 0
            frequency_index = _safe_int(payload.get("frequency_index", 3))
            frequency_index = max(0, min(frequency_index, 12))
            mode = str(payload.get("mode_label", "pwm+-"))
            bit1, bit6 = {
                "pwm+-": (0, 0),
                "pwm0-50-100": (0, 1),
                "pwm+dir": (1, 0),
                "rcm": (1, 1),
            }.get(mode, (0, 0))
            value = phase_correct | (bit1 << 1) | (frequency_index << 2) | (bit6 << 6)

        result = self._send_command(f"W {value}")
        if not result.ok:
            return {"ok": False, "message": result.message or "Falha ao atualizar saida FFB."}

        self.load_device_snapshot()
        return {"ok": True, "message": "Configuracao de saida aplicada. Reinicie o Arduino se estiver usando PWM."}

    def update_shifter_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.shifter["available"]:
            return {"ok": False, "message": "Firmware atual nao possui XY shifter."}

        commands = []
        for index in range(5):
            key = f"cal_{index}"
            if key in payload and payload.get(key) is not None:
                commands.append(f"H{chr(ord('A') + index)} {_safe_int(payload[key])}")

        if payload.get("cfg") is not None:
            commands.append(f"HF {_safe_int(payload['cfg'])}")

        for command in commands:
            result = self._send_command(command)
            if not result.ok:
                return {"ok": False, "message": result.message or f"Falha em {command}."}

        self.load_device_snapshot()
        return {"ok": True, "message": "Calibracao do shifter atualizada."}

    def update_manual_calibration(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.manual_calibration["available"]:
            return {"ok": False, "message": "Este build usa autocalibracao."}

        order = [
            ("brake_min", "YA"),
            ("brake_max", "YB"),
            ("accel_min", "YC"),
            ("accel_max", "YD"),
            ("clutch_min", "YE"),
            ("clutch_max", "YF"),
            ("hbrake_min", "YG"),
            ("hbrake_max", "YH"),
        ]
        for key, command in order:
            if key not in payload or payload.get(key) is None:
                continue
            result = self._send_command(f"{command} {_safe_int(payload[key])}")
            if not result.ok:
                return {"ok": False, "message": result.message or f"Falha em {command}."}

        self.load_device_snapshot()
        return {"ok": True, "message": "Calibracao manual atualizada."}

    def run_action(self, action: str) -> dict[str, Any]:
        action = (action or "").strip().lower()
        mapping = {
            "refresh_device": ("U", True, "Snapshot atualizado."),
            "center": ("C", True, "Centro redefinido."),
            "recalibrate_wheel": ("R", False, "Rotina de calibracao iniciada."),
            "recalibrate_pedals": ("P", True, "Rotina de calibracao dos pedais acionada."),
            "reset_zindex": ("Z", True, "Offset de Z-index limpo."),
            "save_eeprom": ("A", True, "Configuracao salva na EEPROM."),
            "read_shifter": ("HG", True, "Leitura do shifter atualizada."),
            "read_manual_calibration": ("YR", True, "Leitura da calibracao manual atualizada."),
        }
        if action not in mapping:
            return {"ok": False, "message": "Acao desconhecida."}

        command, expect_response, message = mapping[action]
        result = self._send_command(command, expect_response=expect_response, timeout=0.6 if command == "R" else SERIAL_TIMEOUT)
        if not result.ok:
            return {"ok": False, "message": result.message or f"Falha ao executar {action}."}

        if action in {"refresh_device", "read_shifter", "read_manual_calibration"}:
            self.load_device_snapshot()
        else:
            self._poll_runtime_state()
        return {"ok": True, "message": message}

    def send_raw(self, command: str) -> dict[str, Any]:
        payload = (command or "").strip()
        if not payload:
            return {"ok": False, "message": "Digite um comando serial."}
        expect_response = payload[:1].upper() not in {"R"}
        result = self._send_command(payload, expect_response=expect_response, timeout=0.55)
        if not result.ok:
            return {"ok": False, "message": result.message or "Falha no comando bruto."}

        if payload[:1].upper() in {"U", "V", "S"}:
            self.load_device_snapshot()
        return {"ok": True, "message": result.response or "Comando enviado sem resposta.", "response": result.response}

    def list_profiles(self) -> list[dict[str, Any]]:
        profiles: list[dict[str, Any]] = []
        for path in sorted(self.profile_dir.glob("*.json"), reverse=True):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                profiles.append(
                    {
                        "name": payload.get("name", path.stem),
                        "file": path.name,
                        "firmware": payload.get("firmware_version", ""),
                        "created_at": payload.get("created_at", ""),
                    }
                )
            except (OSError, json.JSONDecodeError):
                continue
        return profiles[:PROFILE_LIMIT]

    def get_profile_detail(self, file_name: str) -> dict[str, Any]:
        target = self.profile_dir / Path(file_name).name
        if not target.exists():
            return {"ok": False, "message": "Perfil nao encontrado."}

        try:
            payload = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return {"ok": False, "message": f"Falha ao ler perfil: {exc}"}

        return {
            "ok": True,
            "message": "Perfil carregado.",
            "profile": {
                "file": target.name,
                "name": payload.get("name", target.stem),
                "json_text": json.dumps(payload, ensure_ascii=True, indent=2),
            },
        }

    def upsert_profile(self, original_file: str, name: str, json_text: str) -> dict[str, Any]:
        try:
            payload = json.loads(json_text)
        except json.JSONDecodeError as exc:
            return {"ok": False, "message": f"JSON invalido: {exc}"}

        if not isinstance(payload, dict):
            return {"ok": False, "message": "O perfil precisa ser um objeto JSON."}

        safe_name = _sanitize_profile_name(name or payload.get("name", ""))
        if not safe_name:
            return {"ok": False, "message": "Escolha um nome valido para o perfil."}

        previous_path = self.profile_dir / Path(original_file).name if original_file else None
        target = self.profile_dir / f"{safe_name}.json"
        created_at = payload.get("created_at") or time.strftime("%Y-%m-%d %H:%M:%S")
        payload.update(
            {
                "schema_version": PROFILE_SCHEMA_VERSION,
                "name": safe_name,
                "created_at": created_at,
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        )
        target.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
        if previous_path and previous_path.exists() and previous_path != target:
            previous_path.unlink()
        return {"ok": True, "message": f"Perfil {safe_name} salvo."}

    def save_profile(self, name: str) -> dict[str, Any]:
        safe_name = _sanitize_profile_name(name)
        if not safe_name:
            return {"ok": False, "message": "Escolha um nome valido para o perfil."}
        if not self._is_connected():
            return {"ok": False, "message": "Conecte a base antes de salvar um perfil."}

        self.load_device_snapshot()
        payload = self._build_profile_payload(safe_name)
        return self.upsert_profile("", safe_name, json.dumps(payload, ensure_ascii=True))

    def apply_profile(self, file_name: str) -> dict[str, Any]:
        target = self.profile_dir / Path(file_name).name
        if not target.exists():
            return {"ok": False, "message": "Perfil nao encontrado."}
        if not self._is_connected():
            return {"ok": False, "message": "Conecte a base antes de aplicar um perfil."}

        try:
            payload = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return {"ok": False, "message": f"Falha ao ler perfil: {exc}"}

        settings = payload.get("settings", {})
        manual = payload.get("manual_calibration", {})
        shifter = payload.get("shifter", {})

        basic_result = self.update_basic_settings(
            {
                "rotation_deg": settings.get("rotation_deg"),
                "encoder_cpr": settings.get("encoder_cpr"),
                "brake_pressure": settings.get("brake_pressure"),
            }
        )
        if not basic_result["ok"]:
            return basic_result

        ffb_result = self.update_ffb_settings(
            {
                key: settings.get(key)
                for key in FFB_COMMANDS
            }
        )
        if not ffb_result["ok"]:
            return ffb_result

        desktop = settings.get("desktop", {})
        desktop_result = self.update_desktop_effects(desktop)
        if not desktop_result["ok"]:
            return desktop_result

        if self.capabilities["supports_output_setup"]:
            output = settings.get("output", {})
            output_result = self.update_output_settings(output)
            if not output_result["ok"]:
                return output_result

        if self.shifter["available"] and shifter.get("available"):
            shifter_payload = {f"cal_{idx}": value for idx, value in enumerate(shifter.get("cal", []))}
            shifter_payload["cfg"] = shifter.get("cfg", 0)
            shifter_result = self.update_shifter_settings(shifter_payload)
            if not shifter_result["ok"]:
                return shifter_result

        if self.manual_calibration["available"] and manual.get("available"):
            manual_result = self.update_manual_calibration(manual)
            if not manual_result["ok"]:
                return manual_result

        self.load_device_snapshot()
        return {"ok": True, "message": f"Perfil {payload.get('name', target.stem)} aplicado."}

    def delete_profile(self, file_name: str) -> dict[str, Any]:
        target = self.profile_dir / Path(file_name).name
        if not target.exists():
            return {"ok": False, "message": "Perfil nao encontrado."}
        target.unlink()
        return {"ok": True, "message": "Perfil removido."}

    def recommend_firmwares(self, flags: list[str]) -> dict[str, Any]:
        desired = sorted({str(flag).strip().lower() for flag in (flags or []) if str(flag).strip()})
        matches = [
            item
            for item in self.firmware_catalog
            if all(flag in item["flags"] for flag in desired)
        ]
        matches.sort(key=lambda item: (item["series"], len(item["flags"]), item["code"]), reverse=True)
        return {
            "ok": True,
            "message": "Busca de firmware concluida." if matches else "Nenhum firmware bate com essa combinacao.",
            "desired_flags": desired,
            "best": matches[0] if matches else None,
            "matches": matches[:32],
        }

    def capture_bootloader_baseline(self) -> dict[str, Any]:
        ports = self.refresh_ports(force=True)
        baseline = [item["device"] for item in ports]
        with self._lock:
            self.flash_state["baseline_ports"] = baseline
            self.flash_state["bootloader_port"] = ""
            self.flash_state["last_log"] = ""
        return {"ok": True, "message": "Portas base capturadas.", "ports": ports, "baseline": baseline}

    def detect_bootloader_port(self) -> dict[str, Any]:
        baseline = set(self.flash_state.get("baseline_ports") or [])
        if not baseline:
            return {"ok": False, "message": "Capture as portas atuais antes de procurar o bootloader."}

        deadline = time.time() + BOOTLOADER_DETECT_TIMEOUT
        while time.time() < deadline:
            ports = self.refresh_ports(force=True)
            new_ports = [item for item in ports if item["device"] not in baseline]
            if new_ports:
                new_ports.sort(key=lambda item: (-item["score"], item["device"]))
                chosen = new_ports[0]
                with self._lock:
                    self.flash_state["bootloader_port"] = chosen["device"]
                return {
                    "ok": True,
                    "message": f"Bootloader detectado em {chosen['device']}.",
                    "bootloader_port": chosen["device"],
                    "ports": ports,
                }
            time.sleep(0.35)
        return {"ok": False, "message": "Nenhuma nova porta apareceu. Tente entrar no bootloader de novo."}

    def flash_firmware(self, firmware_name: str, bootloader_port: str = "") -> dict[str, Any]:
        target = next((item for item in self.firmware_catalog if item["name"] == firmware_name), None)
        if not target:
            return {"ok": False, "message": "Firmware nao encontrado no catalogo."}

        port = (bootloader_port or self.flash_state.get("bootloader_port") or "").strip()
        if not port:
            return {"ok": False, "message": "Nenhuma porta de bootloader selecionada."}
        if not self.avrdude_path.exists() or not self.avrdude_conf_path.exists():
            return {"ok": False, "message": "Arquivos do avrdude nao encontrados na pasta local."}

        self.disconnect()
        command = [
            str(self.avrdude_path),
            "-C",
            str(self.avrdude_conf_path),
            "-v",
            "-patmega32u4",
            "-cavr109",
            f"-P{port}",
            "-b57600",
            "-D",
            f"-Uflash:w:{target['path']}:i",
        ]

        with self._lock:
            self.flash_state["busy"] = True
            self.flash_state["selected_firmware"] = firmware_name
            self.flash_state["last_log"] = ""

        try:
            completed = subprocess.run(
                command,
                cwd=str(self.app_dir),
                capture_output=True,
                text=True,
                timeout=AVRDUDE_TIMEOUT,
                check=False,
            )
            log = (completed.stdout or "") + ("\n" if completed.stdout and completed.stderr else "") + (completed.stderr or "")
            with self._lock:
                self.flash_state["last_log"] = log.strip()
            if completed.returncode != 0:
                return {"ok": False, "message": "avrdude retornou erro durante a gravacao.", "log": log.strip()}
            self.refresh_ports(force=True)
            return {"ok": True, "message": f"Firmware {firmware_name} gravado com sucesso.", "log": log.strip()}
        except subprocess.TimeoutExpired as exc:
            log = ((exc.stdout or "") + "\n" + (exc.stderr or "")).strip()
            with self._lock:
                self.flash_state["last_log"] = log
            return {"ok": False, "message": "Tempo esgotado durante a gravacao do firmware.", "log": log}
        finally:
            with self._lock:
                self.flash_state["busy"] = False

    def get_snapshot(self) -> dict[str, Any]:
        with self._lock:
            return copy.deepcopy(
                {
                    "connected": self.connection["connected"],
                    "connection": self.connection,
                    "ports": self._ports,
                    "firmware": self.firmware,
                    "capabilities": self.capabilities,
                    "settings": self.settings,
                    "shifter": self.shifter,
                    "manual_calibration": self.manual_calibration,
                    "diagnostics": self.diagnostics,
                    "serial_stats": self.serial_stats,
                    "history": list(self._history),
                    "profiles": self.list_profiles(),
                    "last_error": self.last_error,
                    "notes": self.notes,
                    "flash_state": self.flash_state,
                }
            )

    def get_static_data(self) -> dict[str, Any]:
        with self._lock:
            return copy.deepcopy(
                {
                    "firmware_catalog": self.firmware_catalog,
                    "firmware_feature_options": self.firmware_feature_options,
                }
            )


class WebApi:
    def __init__(self, controller: WheelController) -> None:
        self.controller = controller

    def get_snapshot(self) -> dict[str, Any]:
        return self.controller.get_snapshot()

    def get_static_data(self) -> dict[str, Any]:
        return self.controller.get_static_data()

    def refresh_ports(self) -> dict[str, Any]:
        self.controller.refresh_ports(force=True)
        return {"ok": True, "message": "Portas atualizadas.", "data": self.controller.get_snapshot()}

    def connect(self, port_name: str = "") -> dict[str, Any]:
        result = self.controller.connect(port_name)
        return {**result, "data": self.controller.get_snapshot()}

    def disconnect(self) -> dict[str, Any]:
        result = self.controller.disconnect()
        return {**result, "data": self.controller.get_snapshot()}

    def load_device_snapshot(self) -> dict[str, Any]:
        result = self.controller.load_device_snapshot()
        return {**result, "data": self.controller.get_snapshot()}

    def update_basic_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = self.controller.update_basic_settings(payload)
        return {**result, "data": self.controller.get_snapshot()}

    def update_ffb_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = self.controller.update_ffb_settings(payload)
        return {**result, "data": self.controller.get_snapshot()}

    def update_desktop_effects(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = self.controller.update_desktop_effects(payload)
        return {**result, "data": self.controller.get_snapshot()}

    def update_output_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = self.controller.update_output_settings(payload)
        return {**result, "data": self.controller.get_snapshot()}

    def update_shifter_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = self.controller.update_shifter_settings(payload)
        return {**result, "data": self.controller.get_snapshot()}

    def update_manual_calibration(self, payload: dict[str, Any]) -> dict[str, Any]:
        result = self.controller.update_manual_calibration(payload)
        return {**result, "data": self.controller.get_snapshot()}

    def run_action(self, action: str) -> dict[str, Any]:
        result = self.controller.run_action(action)
        return {**result, "data": self.controller.get_snapshot()}

    def send_raw(self, command: str) -> dict[str, Any]:
        result = self.controller.send_raw(command)
        return {**result, "data": self.controller.get_snapshot()}

    def save_profile(self, name: str) -> dict[str, Any]:
        result = self.controller.save_profile(name)
        return {**result, "data": self.controller.get_snapshot()}

    def get_profile_detail(self, file_name: str) -> dict[str, Any]:
        result = self.controller.get_profile_detail(file_name)
        return {**result, "data": self.controller.get_snapshot()}

    def upsert_profile(self, original_file: str, name: str, json_text: str) -> dict[str, Any]:
        result = self.controller.upsert_profile(original_file, name, json_text)
        return {**result, "data": self.controller.get_snapshot()}

    def apply_profile(self, file_name: str) -> dict[str, Any]:
        result = self.controller.apply_profile(file_name)
        return {**result, "data": self.controller.get_snapshot()}

    def delete_profile(self, file_name: str) -> dict[str, Any]:
        result = self.controller.delete_profile(file_name)
        return {**result, "data": self.controller.get_snapshot()}

    def recommend_firmwares(self, flags: list[str]) -> dict[str, Any]:
        result = self.controller.recommend_firmwares(flags)
        return {**result, "data": self.controller.get_snapshot()}

    def capture_bootloader_baseline(self) -> dict[str, Any]:
        result = self.controller.capture_bootloader_baseline()
        return {**result, "data": self.controller.get_snapshot()}

    def detect_bootloader_port(self) -> dict[str, Any]:
        result = self.controller.detect_bootloader_port()
        return {**result, "data": self.controller.get_snapshot()}

    def flash_firmware(self, firmware_name: str, bootloader_port: str = "") -> dict[str, Any]:
        result = self.controller.flash_firmware(firmware_name, bootloader_port)
        return {**result, "data": self.controller.get_snapshot()}
