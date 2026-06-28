(function () {
  var module = {};

  module.bind = function (app) {
    bindPair("wheelRotationDeg", "wheelRotationDegRange");

    app.byId("wheelApplyBasic").onclick = function () {
      app.callApi("update_basic_settings", [collectBasic()]);
    };
    app.byId("wheelCenter").onclick = function () {
      app.callApi("run_action", ["center"]);
    };
    app.byId("wheelCalibrate").onclick = function () {
      app.callApi("run_action", ["recalibrate_wheel"]);
    };
    app.byId("wheelResetZ").onclick = function () {
      app.callApi("run_action", ["reset_zindex"]);
    };
  };

  module.render = function (snapshot, app) {
    app.idleSet("wheelRotationDeg", snapshot.settings.rotation_deg);
    app.idleSet("wheelRotationDegRange", snapshot.settings.rotation_deg);
    app.idleSet("wheelEncoderCpr", snapshot.settings.encoder_cpr);
    app.idleSet("wheelBrakePressure", snapshot.settings.brake_pressure);
    app.idleSet("wheelOutputResolution", snapshot.settings.output_resolution);
    app.setText("wheelBrakePressureLabel", app.text(snapshot.settings.brake_pressure_label, "Brake scaling"), "Brake scaling");

    app.byId("wheelApplyBasic").disabled = !snapshot.connected;
    app.byId("wheelCenter").disabled = !snapshot.connected;
    app.byId("wheelCalibrate").disabled = !snapshot.connected;
    app.byId("wheelResetZ").disabled = !snapshot.connected || !snapshot.capabilities.supports_z_reset;
  };

  function bindPair(numberId, rangeId) {
    var numberInput = window.BRWheelApp.byId(numberId);
    var rangeInput = window.BRWheelApp.byId(rangeId);
    numberInput.oninput = function () {
      rangeInput.value = numberInput.value;
    };
    rangeInput.oninput = function () {
      numberInput.value = rangeInput.value;
    };
  }

  function collectBasic() {
    return {
      rotation_deg: Number(window.BRWheelApp.byId("wheelRotationDeg").value),
      encoder_cpr: Number(window.BRWheelApp.byId("wheelEncoderCpr").value),
      brake_pressure: Number(window.BRWheelApp.byId("wheelBrakePressure").value)
    };
  }

  window.BRWheelApp.registerTab("wheel", module);
}());
