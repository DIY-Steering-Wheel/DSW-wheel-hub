(function () {
  var module = {};
  var wiringState = {
    selectedFile: "",
    zoom: 1,
    imagesOnly: true,
    search: ""
  };

  module.bind = function (app) {
    app.byId("connectionRefreshSnapshot").onclick = function () {
      app.callApi("load_device_snapshot");
    };

    app.byId("connectionOpenFirmware").onclick = function () {
      app.getModal("firmwareModal").show();
    };

    app.byId("connectionOpenWirings").onclick = function () {
      ensureWiringSelection(app);
      renderWiringModal(app);
      app.getModal("wiringModal").show();
    };

    app.byId("wiringOpenExternal").onclick = function () {
      var selected = currentWiring(app);
      if (!selected) {
        return;
      }
      app.callApi("open_wiring_file", [selected.file]);
    };

    app.byId("wiringZoomIn").onclick = function () {
      updateZoom(0.1, app);
    };

    app.byId("wiringZoomOut").onclick = function () {
      updateZoom(-0.1, app);
    };

    app.byId("wiringZoomReset").onclick = function () {
      wiringState.zoom = 1;
      renderWiringPreview(app);
    };

    app.byId("wiringImagesOnly").onchange = function () {
      wiringState.imagesOnly = !!this.checked;
      ensureWiringSelection(app);
      renderWiringModal(app);
    };

    app.byId("wiringSearch").oninput = function () {
      wiringState.search = this.value || "";
      ensureWiringSelection(app);
      renderWiringModal(app);
    };

    app.byId("wiringModal").addEventListener("show.bs.modal", function () {
      ensureWiringSelection(app);
      renderWiringModal(app);
    });
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
    app.byId("connectionOpenWirings").disabled = !(((app.state.staticData && app.state.staticData.wiring_files) || []).length);
    if (isWiringModalOpen(app)) {
      ensureWiringSelection(app);
      renderWiringModal(app);
    }
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

  function isWiringModalOpen(app) {
    var modal = app.byId("wiringModal");
    return !!(modal && modal.classList.contains("show"));
  }

  function availableWirings(app) {
    var items = (app.state.staticData && app.state.staticData.wiring_files) || [];
    if (wiringState.imagesOnly) {
      items = items.filter(function (item) {
        return item.preview_type === "image";
      });
    }
    var query = (wiringState.search || "").trim().toLowerCase();
    if (!query) {
      return items;
    }
    return items.filter(function (item) {
      return item.title.toLowerCase().indexOf(query) !== -1 || item.file.toLowerCase().indexOf(query) !== -1;
    });
  }

  function currentWiring(app) {
    var items = availableWirings(app);
    var index;
    for (index = 0; index < items.length; index += 1) {
      if (items[index].file === wiringState.selectedFile) {
        return items[index];
      }
    }
    return items.length ? items[0] : null;
  }

  function ensureWiringSelection(app) {
    var items = availableWirings(app);
    if (!items.length) {
      wiringState.selectedFile = "";
      return;
    }
    if (!currentWiring(app)) {
      wiringState.selectedFile = items[0].file;
    }
    if (!wiringState.selectedFile) {
      wiringState.selectedFile = items[0].file;
    }
  }

  function updateZoom(delta, app) {
    wiringState.zoom = Math.max(0.5, Math.min(3, Number((wiringState.zoom + delta).toFixed(2))));
    renderWiringPreview(app);
  }

  function renderWiringModal(app) {
    window.BRWheelApp.idleCheck("wiringImagesOnly", wiringState.imagesOnly);
    window.BRWheelApp.idleSet("wiringSearch", wiringState.search);
    renderWiringList(app);
    renderWiringPreview(app);
  }

  function renderWiringList(app) {
    var wrap = app.byId("wiringList");
    var items = availableWirings(app);
    var index;
    var scrollTop = wrap ? wrap.scrollTop : 0;
    app.clearChildren(wrap);
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "note-panel";
      empty.textContent = "Nenhum diagrama foi encontrado na pasta wirings.";
      wrap.appendChild(empty);
      return;
    }

    for (index = 0; index < items.length; index += 1) {
      wrap.appendChild(buildWiringListItem(items[index], app));
    }
    if (wrap) {
      wrap.scrollTop = scrollTop;
    }
  }

  function buildWiringListItem(item, app) {
    var button = document.createElement("button");
    var title = document.createElement("strong");
    var meta = document.createElement("small");
    button.type = "button";
    button.className = "wiring-list-item" + (item.file === wiringState.selectedFile ? " active" : "");
    title.textContent = item.title;
    meta.textContent = (item.extension || "").replace(".", "").toUpperCase() + (item.preview_available ? " - preview interno" : " - abrir externo");
    if (item.extension === ".json") {
      meta.textContent = "JSON - abrir externamente";
    }
    button.appendChild(title);
    button.appendChild(meta);
    button.onclick = function () {
      wiringState.selectedFile = item.file;
      if (item.preview_type !== "image") {
        wiringState.zoom = 1;
      }
      renderWiringModal(app);
    };
    return button;
  }

  function renderWiringPreview(app) {
    var wrap = app.byId("wiringPreview");
    var title = app.byId("wiringPreviewTitle");
    var external = app.byId("wiringOpenExternal");
    var zoomIn = app.byId("wiringZoomIn");
    var zoomOut = app.byId("wiringZoomOut");
    var zoomReset = app.byId("wiringZoomReset");
    var selected = currentWiring(app);
    var shell;
    var media;
    var image;
    var frame;

    app.clearChildren(wrap);
    if (!selected) {
      wrap.className = "wiring-preview-empty";
      wrap.textContent = "Selecione um arquivo na lista para visualizar o diagrama aqui.";
      title.textContent = "Selecione um diagrama";
      external.disabled = true;
      zoomIn.disabled = true;
      zoomOut.disabled = true;
      zoomReset.disabled = true;
      zoomReset.textContent = "100%";
      return;
    }

    title.textContent = selected.title;
    external.disabled = false;
    zoomReset.textContent = Math.round(wiringState.zoom * 100) + "%";
    zoomIn.disabled = selected.preview_type !== "image";
    zoomOut.disabled = selected.preview_type !== "image";
    zoomReset.disabled = selected.preview_type !== "image";

    if (selected.preview_type === "image") {
      wrap.className = "wiring-preview-shell";
      shell = document.createElement("div");
      shell.className = "wiring-preview-media";
      shell.style.transform = "scale(" + wiringState.zoom + ")";
      image = document.createElement("img");
      image.src = selected.file_uri;
      image.alt = selected.title;
      shell.appendChild(image);
      wrap.appendChild(shell);
      return;
    }

    if (selected.preview_type === "pdf") {
      wrap.className = "wiring-preview-shell";
      media = document.createElement("div");
      media.className = "wiring-preview-media";
      frame = document.createElement("iframe");
      frame.src = selected.file_uri;
      frame.title = selected.title;
      media.appendChild(frame);
      wrap.appendChild(media);
      return;
    }

    wrap.className = "wiring-preview-message";
    wrap.innerHTML = "";
    wrap.appendChild(buildUnsupportedMessage(selected));
  }

  function buildUnsupportedMessage(selected) {
    var box = document.createElement("div");
    var title = document.createElement("strong");
    var text = document.createElement("div");
    title.textContent = "Sem preview interno para " + ((selected.extension || "").replace(".", "").toUpperCase() || "este formato") + ".";
    text.textContent = "Use o botao \"Abrir externamente\" para abrir o arquivo no programa padrao do Windows.";
    box.appendChild(title);
    box.appendChild(text);
    return box;
  }

  window.BRWheelApp.registerTab("connection", module);
}());
