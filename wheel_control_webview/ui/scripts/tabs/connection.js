(function () {
  var module = {};

  module.bind = function (app) {
    app.byId("connectionRefreshSnapshot").onclick = function () {
      app.callApi("load_device_snapshot");
    };

    app.byId("connectionOpenFirmware").onclick = function () {
      app.getModal("firmwareModal").show();
    };
  };

  module.render = function (snapshot, app) {
    app.setText("connectionFirmware", app.text(snapshot.firmware.version, "-"), "-");
    app.setText("connectionBoard", app.text(snapshot.capabilities.board_family, "-"), "-");
    app.setText("connectionActivePort", app.text(snapshot.connection.port, "-"), "-");
    app.setText("connectionState", app.text(snapshot.diagnostics.controller_state_label, "-"), "-");
    app.setText("connectionEncoder", app.text(snapshot.capabilities.encoder, "-"), "-");
    app.setText("connectionOutput", app.text(snapshot.capabilities.output, "-"), "-");
    app.setText("connectionButtons", app.text(snapshot.capabilities.button_capacity, "-"), "-");
    if (snapshot.connection.vid && snapshot.connection.pid) {
      app.setText("connectionVidPid", app.hex4(snapshot.connection.vid) + ":" + app.hex4(snapshot.connection.pid), "-");
    } else {
      app.setText("connectionVidPid", "-", "-");
    }
    app.setText(
      "connectionHint",
      snapshot.connected ? "Base conectada. Este lobby resume a firmware, o hardware detectado e as ferramentas disponiveis para esta placa." : "Use o botao do rodape para conectar a base e preencher os dados desta tela.",
      ""
    );
    renderDetails(snapshot, app);
    renderTools(app);
    app.byId("connectionOpenFirmware").disabled = !(app.state.staticData && app.state.staticData.firmware_catalog && app.state.staticData.firmware_catalog.length);
  };

  function renderDetails(snapshot, app) {
    var wrap = app.byId("connectionDetails");
    var details = [
      "Descricao USB: " + app.text(snapshot.connection.description, "-"),
      "Fabricante: " + app.text(snapshot.connection.manufacturer, "-"),
      "Produto: " + app.text(snapshot.connection.product, "-"),
      "Calibracao de pedais: " + app.text(snapshot.capabilities.pedal_calibration, "-"),
      "Shifter XY: " + app.boolText(snapshot.capabilities.supports_xy_shifter),
      "2 eixos FFB: " + app.boolText(snapshot.capabilities.has_two_ffb_axis),
      "Selecao de eixo xFFB: " + app.boolText(snapshot.capabilities.supports_axis_select),
      "Flags detectadas: " + ((snapshot.capabilities.flag_titles || []).length ? snapshot.capabilities.flag_titles.join(", ") : "-")
    ];
    var index;
    app.clearChildren(wrap);
    for (index = 0; index < details.length; index += 1) {
      var note = document.createElement("div");
      note.className = "note";
      note.textContent = details[index];
      wrap.appendChild(note);
    }
  }

  function renderTools(app) {
    var wrap = app.byId("connectionTools");
    var programs = (app.state.staticData && app.state.staticData.misc_programs) || [];
    var index;
    app.clearChildren(wrap);
    for (index = 0; index < programs.length; index += 1) {
      wrap.appendChild(buildToolCard(programs[index], app));
    }
    if (!programs.length) {
      var note = document.createElement("div");
      note.className = "note-panel";
      note.textContent = "Nenhum utilitario auxiliar encontrado na pasta local.";
      wrap.appendChild(note);
    }
  }

  function buildToolCard(tool, app) {
    var card = document.createElement("button");
    var title = document.createElement("strong");
    var desc = document.createElement("small");
    card.type = "button";
    card.className = "tool-card";
    title.textContent = tool.title;
    desc.textContent = tool.description;
    card.appendChild(title);
    card.appendChild(desc);
    card.onclick = function () {
      app.callApi("launch_misc_program", [tool.file]);
    };
    return card;
  }

  window.BRWheelApp.registerTab("connection", module);
}());
