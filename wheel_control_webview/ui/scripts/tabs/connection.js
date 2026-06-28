(function () {
  var module = {};

  module.bind = function (app) {
    app.byId("connectionRefreshPorts").onclick = function () {
      app.callApi("refresh_ports");
    };

    app.byId("connectionRefreshSnapshot").onclick = function () {
      app.callApi("load_device_snapshot");
    };

    app.byId("connectionPortSelect").onchange = function () {
      app.byId("dockPortSelect").value = this.value;
    };

    app.byId("connectionOpenFirmware").onclick = function () {
      app.getModal("firmwareModal").show();
    };
  };

  module.render = function (snapshot, app) {
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
      snapshot.connected ? "Base conectada. As abas do app foram habilitadas conforme os recursos presentes na firmware atual." : "Conecte a base para habilitar os setores modulares do app.",
      ""
    );
    app.setText(
      "connectionPortHint",
      snapshot.ports.length ? snapshot.ports.length + " porta(s) candidata(s) encontrada(s). A melhor opcao costuma vir marcada com * no seletor." : "Nenhuma porta candidata encontrada no momento.",
      ""
    );
    app.byId("connectionOpenFirmware").disabled = !(app.state.staticData && app.state.staticData.firmware_catalog && app.state.staticData.firmware_catalog.length);
  };

  window.BRWheelApp.registerTab("connection", module);
}());
