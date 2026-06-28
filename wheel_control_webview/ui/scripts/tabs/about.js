(function () {
  var module = {};
  var licenses = [
    "pywebview: janela nativa embutindo HTML local.",
    "pyserial: comunicacao serial com a controladora.",
    "Bootstrap 5.3 e Bootstrap Icons: componentes visuais e iconografia locais.",
    "avrdude: gravacao de firmware AVR109 para placas ATmega32U4."
  ];
  var warnings = [
    "A gravacao de firmware deve ser feita com a placa correta e com energia estavel.",
    "Perfis aplicam configuracoes diretamente no hardware conectado.",
    "Nao desconecte o cabo USB durante a gravacao.",
    "Sempre confira encoder, saida FFB, pedais e cambio apos trocar de firmware."
  ];
  var creators = [
    {
      title: "Milos Rankovic",
      meta: "Evolucao principal do firmware BR Wheel entre 2018 e 2025.",
      links: [
        { label: "GitHub", href: "https://github.com/ranenbg" }
      ]
    },
    {
      title: "Fernando Igor",
      meta: "Base BRWheel de 2017 citada nos cabecalhos do firmware.",
      links: [
        { label: "GitHub", href: "https://github.com/fernandoigor" }
      ]
    },
    {
      title: "Etienne Saint-Paul",
      meta: "Contribuicoes do firmware Arduino Leonardo FFB Wheel em 2015.",
      links: []
    },
    {
      title: "Tero Loimuneva e Saku Kekkonen",
      meta: "Autores listados nos modulos historicos do Force Feedback Wheel.",
      links: []
    }
  ];

  module.render = function (snapshot, app) {
    fillSimple(app.byId("aboutLicenses"), licenses, app);
    fillSimple(app.byId("aboutWarnings"), warnings, app);
    fillCreators(app.byId("aboutCreators"), app);
  };

  function fillSimple(wrap, items, app) {
    var index;
    app.clearChildren(wrap);
    for (index = 0; index < items.length; index += 1) {
      appendNote(wrap, items[index]);
    }
  }

  function fillCreators(wrap, app) {
    var index;
    app.clearChildren(wrap);
    for (index = 0; index < creators.length; index += 1) {
      wrap.appendChild(buildCreator(creators[index]));
    }
  }

  function buildCreator(item) {
    var card = document.createElement("div");
    var title = document.createElement("strong");
    var meta = document.createElement("div");
    var links = document.createElement("div");
    var index;

    card.className = "note about-creator";
    title.textContent = item.title;
    meta.className = "about-creator-meta";
    meta.textContent = item.meta;
    card.appendChild(title);
    card.appendChild(meta);

    if (item.links && item.links.length) {
      links.className = "about-creator-links";
      for (index = 0; index < item.links.length; index += 1) {
        var anchor = document.createElement("a");
        anchor.href = item.links[index].href;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.className = "app-btn secondary about-link-btn";
        anchor.textContent = item.links[index].label;
        links.appendChild(anchor);
      }
      card.appendChild(links);
    }

    return card;
  }

  function appendNote(wrap, message) {
    var note = document.createElement("div");
    note.className = "note";
    note.appendChild(document.createTextNode(message));
    wrap.appendChild(note);
  }

  window.BRWheelApp.registerTab("about", module);
}());
