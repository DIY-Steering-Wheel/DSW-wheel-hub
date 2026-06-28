(function () {
  var module = {};

  module.state = {
    draft: null,
    timer: null
  };

  module.bind = function (app) {
    bindPair("wheelRotationDeg", "wheelRotationDegRange", "rotation_deg");
    bindPair("wheelGeneralGain", "wheelGeneralGainRange", "general_gain");
    bindInput("wheelEncoderCpr", "encoder_cpr");

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
    var values;
    if (!snapshot.connected) {
      module.state.draft = null;
      if (module.state.timer) {
        window.clearTimeout(module.state.timer);
        module.state.timer = null;
      }
    }

    values = module.state.draft || snapshot.settings;
    app.idleSet("wheelRotationDeg", values.rotation_deg);
    app.idleSet("wheelRotationDegRange", values.rotation_deg);
    app.idleSet("wheelGeneralGain", values.general_gain);
    app.idleSet("wheelGeneralGainRange", values.general_gain);
    app.idleSet("wheelEncoderCpr", values.encoder_cpr);
    app.idleSet("wheelOutputResolution", snapshot.settings.output_resolution);
    app.toggleHidden(app.byId("wheelOutputResolutionBox"), !snapshot.capabilities.supports_output_setup);

    app.byId("wheelCenter").disabled = !snapshot.connected;
    app.byId("wheelCalibrate").disabled = !snapshot.connected;
    app.toggleHidden(app.byId("wheelResetZ"), !snapshot.capabilities.supports_z_reset);
    app.byId("wheelResetZ").disabled = !snapshot.connected || !snapshot.capabilities.supports_z_reset;
  };

  function ensureDraft() {
    if (!module.state.draft && window.BRWheelApp.state.snapshot) {
      module.state.draft = {
        rotation_deg: window.BRWheelApp.state.snapshot.settings.rotation_deg,
        encoder_cpr: window.BRWheelApp.state.snapshot.settings.encoder_cpr,
        general_gain: window.BRWheelApp.state.snapshot.settings.general_gain
      };
    }
  }

  function queueSend() {
    if (module.state.timer) {
      window.clearTimeout(module.state.timer);
    }
    module.state.timer = window.setTimeout(function () {
      var payload;
      if (!module.state.draft) {
        return;
      }
      payload = {
        rotation_deg: Number(module.state.draft.rotation_deg),
        encoder_cpr: Number(module.state.draft.encoder_cpr)
      };
      window.BRWheelApp.callApi("update_basic_settings", [payload]).then(function (result) {
        if (!(result && result.ok)) {
          return;
        }
        return window.BRWheelApp.callApi("update_ffb_settings", [{ general_gain: Number(module.state.draft.general_gain) }]).then(function (ffbResult) {
          if (ffbResult && ffbResult.ok) {
            module.state.draft = null;
          }
        });
      });
    }, 220);
  }

  function bindPair(numberId, rangeId, key) {
    var numberInput = window.BRWheelApp.byId(numberId);
    var rangeInput = window.BRWheelApp.byId(rangeId);
    numberInput.oninput = function () {
      ensureDraft();
      module.state.draft[key] = Number(numberInput.value);
      rangeInput.value = numberInput.value;
      queueSend();
    };
    rangeInput.oninput = function () {
      ensureDraft();
      module.state.draft[key] = Number(rangeInput.value);
      numberInput.value = rangeInput.value;
      queueSend();
    };
  }

  function bindInput(id, key) {
    var input = window.BRWheelApp.byId(id);
    input.oninput = function () {
      ensureDraft();
      module.state.draft[key] = Number(input.value);
      queueSend();
    };
  }

  window.BRWheelApp.registerTab("wheel", module);
}());
