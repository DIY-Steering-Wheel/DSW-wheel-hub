(function () {
  var module = {};

  module.bind = function (app) {
    app.byId("pedalsRecalibrate").onclick = function () {
      app.callApi("run_action", ["recalibrate_pedals"]);
    };
    app.byId("pedalsApplyManual").onclick = function () {
      app.callApi("update_manual_calibration", [collectManual()]);
    };
  };

  module.render = function (snapshot, app) {
    var title = "Aguardando conexao";
    var text = "Conecte a serial para descobrir o mapa de pedal atual.";

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
    app.setText("pedalsBrakePressure", app.text(snapshot.settings.brake_pressure, "-"), "-");
    app.setText("pedalsCalibration", app.text(snapshot.capabilities.pedal_calibration, "-"), "-");
    app.setText("pedalsLoadCell", app.boolText(snapshot.capabilities.has_load_cell), "-");
    app.setText("pedalsAds", app.boolText(snapshot.capabilities.has_ads1015), "-");

    app.toggleHidden(app.byId("pedalsManualCard"), !snapshot.manual_calibration.available);
    app.idleSet("pedalsBrakeMin", snapshot.manual_calibration.brake_min);
    app.idleSet("pedalsBrakeMax", snapshot.manual_calibration.brake_max);
    app.idleSet("pedalsAccelMin", snapshot.manual_calibration.accel_min);
    app.idleSet("pedalsAccelMax", snapshot.manual_calibration.accel_max);
    app.idleSet("pedalsClutchMin", snapshot.manual_calibration.clutch_min);
    app.idleSet("pedalsClutchMax", snapshot.manual_calibration.clutch_max);
    app.idleSet("pedalsHbrakeMin", snapshot.manual_calibration.hbrake_min);
    app.idleSet("pedalsHbrakeMax", snapshot.manual_calibration.hbrake_max);

    app.byId("pedalsRecalibrate").disabled = !snapshot.connected || !snapshot.capabilities.supports_pedal_reset;
    app.byId("pedalsApplyManual").disabled = !snapshot.connected || !snapshot.manual_calibration.available;
  };

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

  window.BRWheelApp.registerTab("pedals", module);
}());
