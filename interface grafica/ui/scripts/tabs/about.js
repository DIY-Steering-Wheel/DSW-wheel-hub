(function () {
  var module = {};
  var version = "1.0.0";
  var githubUrl = "https://github.com/DIY-Steering-Wheel/DSW-wheel-hub";
  var creators = [
    {
      title: "Milos Rankovic",
      meta: "Evolucao principal do firmware BR Wheel entre 2018 e 2025.",
      links: [{ label: "GitHub", href: "https://github.com/ranenbg" }]
    },
    {
      title: "Fernando Igor",
      meta: "Base BRWheel de 2017 citada nos cabecalhos do firmware.",
      links: [{ label: "GitHub", href: "https://github.com/fernandoigor" }]
    },
    {
      title: "Etienne Saint-Paul",
      meta: "Base historica do firmware Arduino Leonardo FFB Wheel.",
      links: []
    }
  ];
  var usefulLinks = [
    {
      title: "Repositorio oficial",
      meta: "Codigo-fonte, historico e documentacao do projeto.",
      href: githubUrl,
      label: "Abrir GitHub"
    },
    {
      title: "Issues e melhorias",
      meta: "Reporte bugs, acompanhe ajustes e novas ideias.",
      href: githubUrl + "/issues",
      label: "Abrir issues"
    },
    {
      title: "Comunidade Discord",
      meta: "Canal rapido para apoio e troca com outros usuarios.",
      href: "https://discord.gg/4C7a9R4Azw",
      label: "Entrar no Discord"
    }
  ];

  module.render = function (snapshot, app) {
    app.setText("aboutVersionBadge", "v" + version, "");
    renderSummary(snapshot, app);
    renderLinks(app);
    renderProjectInfo(snapshot, app);
    renderCreators(app);
  };

  function renderSummary(snapshot, app) {
    var wrap = app.byId("aboutSummaryMeta");
    var metrics = [
      { label: "Versao", value: "v" + version },
      { label: "Firmware", value: app.text(snapshot.firmware.version, "-") },
      { label: "Placa", value: app.text(snapshot.capabilities.board_family, "-") },
      { label: "Conexao", value: snapshot.connected ? "Online" : "Offline" }
    ];
    app.clearChildren(wrap);
    metrics.forEach(function (metric) {
      var box = document.createElement("div");
      var span = document.createElement("span");
      var strong = document.createElement("strong");
      box.className = "metric-box";
      span.textContent = metric.label;
      strong.textContent = metric.value;
      box.appendChild(span);
      box.appendChild(strong);
      wrap.appendChild(box);
    });
  }

  function renderLinks(app) {
    var wrap = app.byId("aboutLinks");
    app.clearChildren(wrap);
    usefulLinks.forEach(function (item) {
      var card = document.createElement("div");
      var title = document.createElement("strong");
      var meta = document.createElement("small");
      var anchor = document.createElement("a");
      card.className = "tool-card";
      title.textContent = item.title;
      meta.textContent = item.meta;
      anchor.href = item.href;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.className = "app-btn secondary about-link-btn mt-3";
      anchor.textContent = item.label;
      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(anchor);
      wrap.appendChild(card);
    });
  }

  function renderProjectInfo(snapshot, app) {
    var wrap = app.byId("aboutProjectInfo");
    var info = [
      "Repositorio: " + githubUrl,
      "Firmware atual: " + app.text(snapshot.firmware.version, "nao identificado"),
      "Flags detectadas: " + ((snapshot.capabilities.flag_titles || []).length ? snapshot.capabilities.flag_titles.join(", ") : "nenhuma"),
      "Saida FFB: " + app.text(snapshot.capabilities.output, "-"),
      "Encoder: " + app.text(snapshot.capabilities.encoder, "-")
    ];
    app.clearChildren(wrap);
    info.forEach(function (item) {
      var note = document.createElement("div");
      note.className = "note";
      note.textContent = item;
      wrap.appendChild(note);
    });
  }

  function renderCreators(app) {
    var wrap = app.byId("aboutCreators");
    app.clearChildren(wrap);
    creators.forEach(function (item) {
      wrap.appendChild(buildCreator(item));
    });
  }

  function buildCreator(item) {
    var card = document.createElement("div");
    var title = document.createElement("strong");
    var meta = document.createElement("div");
    card.className = "note about-creator";
    title.textContent = item.title;
    meta.className = "about-creator-meta";
    meta.textContent = item.meta;
    card.appendChild(title);
    card.appendChild(meta);
    if (item.links && item.links.length) {
      var links = document.createElement("div");
      links.className = "about-creator-links";
      item.links.forEach(function (linkItem) {
        var anchor = document.createElement("a");
        anchor.href = linkItem.href;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.className = "app-btn secondary about-link-btn";
        anchor.textContent = linkItem.label;
        links.appendChild(anchor);
      });
      card.appendChild(links);
    }
    return card;
  }

  window.BRWheelApp.registerTab("about", module);
}());
