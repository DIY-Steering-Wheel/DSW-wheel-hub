(function () {
  var module = {};
  var pedals = ["brake", "accel", "clutch", "hbrake"];

  module.state = {
    draft: null,
    timer: null,
    brakePressureDraft: null
  };

  module.bind = function (app) {
    app.byId("pedalsRecalibrate").onclick = function () {
      app.callApi("run_action", ["recalibrate_pedals"]);
    };
    app.byId("pedalsResetDraft").onclick = function () {
      module.state.draft = null;
      if (module.state.timer) {
        window.clearTimeout(module.state.timer);
        module.state.timer = null;
      }
      if (app.state.snapshot) {
        module.render(app.state.snapshot, app);
      }
    };

    pedals.forEach(function (pedal) {
      bindDualRange(pedal);
    });
    bindBrakePressure();
  };

  module.render = function (snapshot, app) {
    var title = "Aguardando conexao";
    var text = "Conecte a serial para descobrir o mapa de pedal atual.";
    if (!snapshot.connected) {
      module.state.draft = null;
      module.state.brakePressureDraft = null;
      if (module.state.timer) {
        window.clearTimeout(module.state.timer);
        module.state.timer = null;
      }
    }
    var values = module.state.draft || snapshot.manual_calibration;

    if (snapshot.connected) {
      title = snapshot.capabilities.pedal_calibration === "Automatica" ? "Pedais em autocalibracao" : "Pedais em calibracao manual";
      text = "Brake scaling atual: " + snapshot.settings.brake_pressure + ". ";
      if (snapshot.capabilities.has_load_cell) {
        text += "Firmware com load cell HX711 no freio. ";
      } else {
        text += "Firmware sem load cell; o comando B atua como balanceamento de PWM. ";
      }
      if (snapshot.capabilities.has_ads1015) {
        text += "ADS1015 detectado.";
      } else if (snapshot.capabilities.has_averaging) {
        text += "Media analogica habilitada.";
      } else {
        text += "Leituras analogicas diretas na placa.";
      }
    }

    app.setText("pedalsModeTitle", title, "");
    app.setText("pedalsModeText", text, "");
    app.setText("pedalsBrakePressureLabel", app.text(snapshot.settings.brake_pressure_label, "Brake scaling"), "Brake scaling");
    app.setText("pedalsBrakePressureFieldLabel", app.text(snapshot.settings.brake_pressure_label, "Brake scaling"), "Brake scaling");
    app.setText(
      "pedalsBrakePressureHint",
      snapshot.capabilities.has_load_cell
        ? "Em load cell, esse controle ajusta a escala/pressao do freio e muda o quanto de forca fisica vira sinal util."
        : "Em PWM balance, esse controle corrige o equilibrio entre os lados da saida PWM para compensar diferencas do driver ou do motor.",
      ""
    );
    app.setText("pedalsBrakePressure", app.text(snapshot.settings.brake_pressure, "-"), "-");
    app.setText("pedalsCalibration", app.text(snapshot.capabilities.pedal_calibration, "-"), "-");
    app.setText("pedalsLoadCell", app.boolText(snapshot.capabilities.has_load_cell), "-");
    app.setText("pedalsAds", app.boolText(snapshot.capabilities.has_ads1015), "-");
    app.idleSet("pedalsBrakePressureInput", module.state.brakePressureDraft !== null ? module.state.brakePressureDraft : snapshot.settings.brake_pressure);
    app.idleSet("pedalsBrakePressureRange", module.state.brakePressureDraft !== null ? module.state.brakePressureDraft : snapshot.settings.brake_pressure);
    app.byId("pedalsBrakePressureInput").max = "255";
    app.byId("pedalsBrakePressureRange").max = "255";
    app.toggleHidden(app.byId("pedalsBrakePressureField"), !snapshot.capabilities.supports_brake_scaling);

    app.toggleHidden(app.byId("pedalsManualCard"), !snapshot.manual_calibration.available);
    renderDualRange("brake", values.brake_min, values.brake_max);
    renderDualRange("accel", values.accel_min, values.accel_max);
    renderDualRange("clutch", values.clutch_min, values.clutch_max);
    renderDualRange("hbrake", values.hbrake_min, values.hbrake_max);

    app.byId("pedalsRecalibrate").disabled = !snapshot.connected || !snapshot.capabilities.supports_pedal_reset;
  };

  function ensureDraft() {
    if (!module.state.draft && window.BRWheelApp.state.snapshot) {
      module.state.draft = {
        brake_min: window.BRWheelApp.state.snapshot.manual_calibration.brake_min,
        brake_max: window.BRWheelApp.state.snapshot.manual_calibration.brake_max,
        accel_min: window.BRWheelApp.state.snapshot.manual_calibration.accel_min,
        accel_max: window.BRWheelApp.state.snapshot.manual_calibration.accel_max,
        clutch_min: window.BRWheelApp.state.snapshot.manual_calibration.clutch_min,
        clutch_max: window.BRWheelApp.state.snapshot.manual_calibration.clutch_max,
        hbrake_min: window.BRWheelApp.state.snapshot.manual_calibration.hbrake_min,
        hbrake_max: window.BRWheelApp.state.snapshot.manual_calibration.hbrake_max
      };
    }
  }

  function bindDualRange(prefix) {
    var minNumber = window.BRWheelApp.byId("pedals" + cap(prefix) + "Min");
    var maxNumber = window.BRWheelApp.byId("pedals" + cap(prefix) + "Max");
    var minRange = window.BRWheelApp.byId("pedals" + cap(prefix) + "MinRange");
    var maxRange = window.BRWheelApp.byId("pedals" + cap(prefix) + "MaxRange");

    function updateFromNumbers() {
      ensureDraft();
      syncPair(prefix, Number(minNumber.value), Number(maxNumber.value));
    }

    function updateFromRanges() {
      ensureDraft();
      syncPair(prefix, Number(minRange.value), Number(maxRange.value));
    }

    minNumber.oninput = updateFromNumbers;
    maxNumber.oninput = updateFromNumbers;
    minRange.oninput = updateFromRanges;
    maxRange.oninput = updateFromRanges;
  }

  function syncPair(prefix, minValue, maxValue) {
    var lower = Math.max(0, Math.min(minValue, maxValue));
    var upper = Math.min(4095, Math.max(minValue, maxValue));
    module.state.draft[prefix + "_min"] = lower;
    module.state.draft[prefix + "_max"] = upper;
    renderDualRange(prefix, lower, upper);
    queueSend();
  }

  function queueSend() {
    if (module.state.timer) {
      window.clearTimeout(module.state.timer);
    }
    module.state.timer = window.setTimeout(function () {
      window.BRWheelApp.callApi("update_manual_calibration", [collectManual()]).then(function (result) {
        if (result && result.ok) {
          module.state.draft = null;
        }
      });
    }, 220);
  }

  function bindBrakePressure() {
    var numberInput = window.BRWheelApp.byId("pedalsBrakePressureInput");
    var rangeInput = window.BRWheelApp.byId("pedalsBrakePressureRange");

    function submit(value) {
      var nextValue = Math.max(1, Math.min(255, Number(value || 0)));
      module.state.brakePressureDraft = nextValue;
      numberInput.value = nextValue;
      rangeInput.value = nextValue;
      window.BRWheelApp.callApi("update_basic_settings", [{ brake_pressure: nextValue }]).then(function (result) {
        if (result && result.ok) {
          module.state.brakePressureDraft = null;
        }
      });
    }

    numberInput.oninput = function () {
      rangeInput.value = numberInput.value;
      submit(numberInput.value);
    };
    rangeInput.oninput = function () {
      numberInput.value = rangeInput.value;
      submit(rangeInput.value);
    };
  }

  function renderDualRange(prefix, minValue, maxValue) {
    var analogLimit = currentAnalogLimit();
    var start = Math.max(0, Math.min(Number(minValue), Number(maxValue)));
    var end = Math.min(analogLimit, Math.max(Number(minValue), Number(maxValue)));
    var title = "pedals" + cap(prefix);
    var fill = window.BRWheelApp.byId(title + "Fill");
    window.BRWheelApp.byId(title + "Min").max = String(analogLimit);
    window.BRWheelApp.byId(title + "Max").max = String(analogLimit);
    window.BRWheelApp.byId(title + "MinRange").max = String(analogLimit);
    window.BRWheelApp.byId(title + "MaxRange").max = String(analogLimit);
    window.BRWheelApp.idleSet(title + "Min", start);
    window.BRWheelApp.idleSet(title + "Max", end);
    window.BRWheelApp.idleSet(title + "MinRange", start);
    window.BRWheelApp.idleSet(title + "MaxRange", end);
    window.BRWheelApp.setText(title + "RangeLabel", start + " - " + end, "");

    if (fill) {
      fill.style.left = (start / analogLimit * 100) + "%";
      fill.style.width = Math.max(0, ((end - start) / analogLimit * 100)) + "%";
    }
  }

  function collectManual() {
    return {
      brake_min: Number(window.BRWheelApp.byId("pedalsBrakeMin").value),
      brake_max: Number(window.BRWheelApp.byId("pedalsBrakeMax").value),
      accel_min: Number(window.BRWheelApp.byId("pedalsAccelMin").value),
      accel_max: Number(window.BRWheelApp.byId("pedalsAccelMax").value),
      clutch_min: Number(window.BRWheelApp.byId("pedalsClutchMin").value),
      clutch_max: Number(window.BRWheelApp.byId("pedalsClutchMax").value),
      hbrake_min: Number(window.BRWheelApp.byId("pedalsHbrakeMin").value),
      hbrake_max: Number(window.BRWheelApp.byId("pedalsHbrakeMax").value)
    };
  }

  function cap(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function currentAnalogLimit() {
    var snapshot = window.BRWheelApp.state.snapshot;
    return snapshot && snapshot.capabilities && snapshot.capabilities.analog_resolution ? Number(snapshot.capabilities.analog_resolution) : 1023;
  }

  window.BRWheelApp.registerTab("pedals", module);
}());
