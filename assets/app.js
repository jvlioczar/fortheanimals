// Interações do site: menu, busca, filtros do catálogo e copiar a resposta curta.
(function () {
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var base = document.body.dataset.base || '';
  var norm = function (s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };

  /* índice de busca (assets/busca.json): carregado uma vez, quando alguém abre ou usa uma busca */
  var dados = null, pedindo = null, esperando = [];
  var carrega = function (pronto) {
    if (dados) { pronto(); return; }
    esperando.push(pronto);
    if (pedindo) return;
    pedindo = fetch(base + 'assets/busca.json').then(function (r) { return r.json(); }).then(function (j) {
      // campos já normalizados: título, outras formas, subtítulo, descrição e palavras do conteúdo
      j.forEach(function (d) { d.n = [norm(d.t), norm(d.k), norm(d.s), norm(d.d), d.c || '']; });
      dados = j; esperando.forEach(function (f) { f(); }); esperando = [];
    }).catch(function () { pedindo = null; });   // se a rede falhar, a próxima tecla tenta de novo, em vez de travar a busca
  };
  // Ordem em três faixas, sempre nesta prioridade:
  //   1. todas as palavras no título;
  //   2. todas as palavras em algum lugar do texto (outras formas, subtítulo, descrição, conteúdo);
  //   3. palavras parecidas, para erros de digitação e variações ("vegetariano" acha "vegetarianos", "veganimo" acha "veganismo").
  // Dentro de cada faixa, palavra inteira ou no começo de palavra vale mais do que no meio de outra ("ovo" antes de "novo").
  var PESOS = [50, 30, 25, 10, 1];
  var acha = function (campo, termo) {               // 0 = não está; 1 = no meio de uma palavra; 2 = começo de palavra
    var i = campo.indexOf(termo), r = 0;
    while (i >= 0) {
      if (i === 0 || /[^a-z0-9]/.test(campo.charAt(i - 1))) return 2;
      r = 1; i = campo.indexOf(termo, i + 1);
    }
    return r;
  };
  var distancia = function (a, b, lim) {             // Levenshtein com limite: devolve lim + 1 se passar dele
    if (Math.abs(a.length - b.length) > lim) return lim + 1;
    var ant = [], i, j;
    for (j = 0; j <= b.length; j++) ant[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i], menor = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (cur[j] < menor) menor = cur[j];
      }
      if (menor > lim) return lim + 1;
      ant = cur;
    }
    return ant[b.length];
  };
  var separa = function (s) { return s.split(/[^a-z0-9]+/).filter(function (x) { return x.length >= 3; }); };
  var parecida = function (d, termo) {               // 0 = nenhuma; senão, quanto mais perto de 1, mais parecida
    if (termo.length < 4) return 0;
    if (!d.w) d.w = [separa(d.n[0]), separa(d.n[1] + ' ' + d.n[2])];   // palavras do título; das outras formas e do subtítulo
    var lim = termo.length >= 7 ? 2 : 1, melhor = 0;
    for (var g = 0; g < 2; g++) {
      for (var i = 0; i < d.w[g].length; i++) {
        var w = d.w[g][i], dist = distancia(termo, w.length > termo.length + lim ? w.slice(0, termo.length + lim) : w, lim);
        if (dist <= lim) { var v = (1 - dist / (lim + 1)) * (g === 0 ? 1 : 0.5); if (v > melhor) melhor = v; }   // no título vale mais
      }
    }
    return melhor;
  };
  var procura = function (texto, max) {
    var t = norm(texto).trim(), termos = t.split(/\s+/).filter(function (x) { return x.length >= 2; });
    if (!termos.length || !dados) return [];
    var achados = [];
    dados.forEach(function (d, ordem) {
      var i, c, k, faixa = 3, p = 0;
      // faixa 1: todas no título
      for (i = 0; i < termos.length; i++) { k = acha(d.n[0], termos[i]); if (!k) { faixa = 0; break; } p += k; }
      if (faixa) {
        if (termos.length > 1 && d.n[0].indexOf(t) >= 0) p += 10;   // a frase inteira, nessa ordem
        achados.push({ d: d, f: 3, p: p, o: ordem }); return;
      }
      // faixa 2: todas em algum lugar do texto
      faixa = 2; p = 0;
      for (i = 0; i < termos.length; i++) {
        var melhor = 0;
        for (c = 0; c < 5; c++) { k = acha(d.n[c], termos[i]); if (k) { var v = PESOS[c] * (k === 2 ? 1 : 0.6); if (v > melhor) melhor = v; } }
        if (!melhor) { faixa = 0; break; }
        p += melhor;
      }
      if (faixa) { achados.push({ d: d, f: 2, p: p, o: ordem }); return; }
      // faixa 3: cada palavra aparece ou tem uma parecida no título, nas outras formas ou no subtítulo
      p = 0;
      for (i = 0; i < termos.length; i++) {
        var achou = 0;
        for (c = 0; c < 5 && !achou; c++) if (acha(d.n[c], termos[i])) achou = 1;
        if (!achou) achou = parecida(d, termos[i]) * 0.9;
        if (!achou) return;
        p += achou;
      }
      achados.push({ d: d, f: 1, p: p, o: ordem });
    });
    // empate: o título mais curto primeiro ("Veganismo" antes de "Veganismo abolicionista")
    achados.sort(function (a, b) { return b.f - a.f || b.p - a.p || a.d.t.length - b.d.t.length || a.o - b.o; });
    return achados.slice(0, max).map(function (x) { return x.d; });
  };

  var hamb = $('.hamb'), menu = $('.menu');
  // Menu aberto: no máximo a altura visível abaixo do cabeçalho; o que passar disso rola dentro do próprio menu.
  var alturaMenu = function () {
    if (!menu || !menu.classList.contains('aberto')) return;
    var topo = menu.getBoundingClientRect().top;
    menu.style.setProperty('--menu-max', Math.max(160, window.innerHeight - Math.max(topo, 0) - 12) + 'px');
  };
  if (hamb) hamb.addEventListener('click', function () { menu.classList.toggle('aberto'); hamb.setAttribute('aria-expanded', menu.classList.contains('aberto')); alturaMenu(); });
  window.addEventListener('resize', alturaMenu);
  window.addEventListener('scroll', alturaMenu, { passive: true });
  // Barra de filtros da lista: no celular, só a fileira de letras fica fixa ao rolar; o resto sobe com a página.
  var barraF = $('.barra-f'), guiasF = barraF && barraF.querySelector('.guias');
  var topoBarra = function () {
    if (!guiasF) return;
    var cab = $('.topo'), fim = cab ? cab.getBoundingClientRect().bottom : 0;
    var esconde = barraF.offsetHeight - guiasF.offsetHeight - 6;
    barraF.style.setProperty('--barra-top', window.innerWidth <= 760 ? Math.round(fim - esconde) + 'px' : '');
  };
  topoBarra(); window.addEventListener('resize', topoBarra); window.addEventListener('load', topoBarra);
  // Grupos do menu: só um aberto por vez; fecham ao clicar fora ou com Esc.
  var subs = document.querySelectorAll('.menu .sub');
  subs.forEach(function (d) { d.addEventListener('toggle', function () { if (d.open) subs.forEach(function (o) { if (o !== d) o.open = false; }); }); });
  document.addEventListener('click', function (ev) { subs.forEach(function (d) { if (d.open && !d.contains(ev.target)) d.open = false; }); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') subs.forEach(function (d) { if (d.open) { d.open = false; d.querySelector('summary').focus(); } }); });

  /* busca */
  var ov = $('#busca'), q = $('#q'), res = $('#res'), idx = -1;
  function abre() { ov.hidden = false; q.value = ''; res.textContent = ''; q.focus(); carrega(function () { if (q.value) mostra(); }); }
  function fecha() { ov.hidden = true; }
  $$('.bbusca').forEach(function (b) { b.addEventListener('click', abre); });
  ov.addEventListener('click', function (e) { if (e.target === ov) fecha(); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abre(); }
    if (e.key === 'Escape') fecha();
  });
  function mostra() {
    var t = norm(q.value).trim(); res.textContent = ''; idx = -1;
    if (t.length < 2 || !dados) return;
    var ach = procura(q.value, 20);
    if (!ach.length) { var p = document.createElement('p'); p.textContent = 'Nothing found. Try another word from the objection.'; res.appendChild(p); return; }
    ach.forEach(function (d) {
      var a = document.createElement('a'); a.href = base + d.u; a.textContent = d.t;
      var s = document.createElement('small'); s.textContent = d.s; a.appendChild(s); res.appendChild(a);
    });
  }
  q.addEventListener('input', function () { carrega(mostra); });
  q.addEventListener('keydown', function (e) {
    var ls = $$('a', res); if (!ls.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (ls[idx]) ls[idx].classList.remove('on');
      idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + ls.length) % ls.length; ls[idx].classList.add('on'); ls[idx].scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') { (ls[idx] || ls[0]).click(); }
  });

  /* filtros do catálogo */
  var cat = $('#catalogo');
  if (cat) {
    var cs = $$('[data-fam]', cat), grupos = $$('.grupo-f', cat), fq = $('#fq'), cont = $('#contagem'), f = { parte: '', fam: '', st: '' };
    var aplica = function () {
      var t = norm(fq.value), n = 0;
      cs.forEach(function (c) {
        var d = c.dataset, ok = (!f.parte || d.parte === f.parte) && (!f.fam || d.fam === f.fam) && (!f.st || d.st === f.st) && (!t || norm(c.textContent).indexOf(t) >= 0);
        c.hidden = !ok; if (ok) n++;
      });
      grupos.forEach(function (g) { g.hidden = !g.querySelector('[data-fam]:not([hidden])'); });
      cont.textContent = n + (n === 1 ? ' argument' : ' arguments');
    };
    $$('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.dataset.g; f[g] = b.dataset.v;
        $$('.chip[data-g="' + g + '"]').forEach(function (o) { o.setAttribute('aria-pressed', o === b); });
        aplica();
      });
    });
    fq.addEventListener('input', aplica);
    var u = new URLSearchParams(location.search);
    if (u.get('q')) fq.value = u.get('q');
    aplica();
  }

  /* abas do capítulo */
  var abas = $$('.abas [role=tab]');
  if (abas.length) {
    var mostra = function (b, foco) {
      abas.forEach(function (o) {
        var on = o === b; o.setAttribute('aria-selected', on); o.tabIndex = on ? 0 : -1;
        document.getElementById(o.getAttribute('aria-controls')).hidden = !on;
      });
      if (foco) b.focus();
    };
    abas.forEach(function (b, i) {
      b.addEventListener('click', function () {
        mostra(b);
        history.replaceState(null, '', '#' + b.id.replace('tab-', ''));
        var w = $('.abas-w'); if (w && window.scrollY > w.offsetTop) window.scrollTo(0, w.offsetTop);
      });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') mostra(abas[(i + 1) % abas.length], true);
        if (e.key === 'ArrowLeft') mostra(abas[(i - 1 + abas.length) % abas.length], true);
      });
    });
    var irAba = function () {
      var h = decodeURIComponent(location.hash.slice(1)), alvo = h && document.getElementById(h), b = abas[0];
      var p = h && (document.getElementById('p-' + h) || (alvo && alvo.closest('.painel')));
      if (p) b = $('#tab-' + p.id.slice(2)) || b;
      mostra(b);
      if (alvo) alvo.scrollIntoView();
    };
    irAba(); window.addEventListener('hashchange', irAba);
  }

  /* filtro simples de falácias e vieses */
  var fs = $('.f-simples');
  if (fs) fs.addEventListener('input', function () {
    var t = norm(fs.value);
    $$('.f-alvo .cartao').forEach(function (c) { c.hidden = t && norm(c.textContent).indexOf(t) < 0; });
  });

  /* treino com cartões */
  var td = $('#t-dados');
  if (td) {
    var D = JSON.parse(td.textContent), mod = $('#t-mod'), fila = [], pos = 0, sabia = 0, vistas = 0, cad = false;
    var acha = function (c) { return D.cartas.filter(function (x) { return x.c === c; })[0]; };
    var mistura = function (l) { l = l.slice(); for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; } return l; };
    var carta = function () {
      if (pos >= fila.length) { pos = 0; if (!cad) fila = mistura(fila); }
      var c = fila[pos];
      $('#t-cod').textContent = c.c; $('#t-cod').style.color = c.cor;
      $('#t-pos').textContent = (pos + 1) + ' de ' + fila.length;
      $('#t-q').textContent = '"' + c.f + '"';
      $('#t-r').textContent = c.r; $('#t-l').href = c.u;
      $('#t-res').hidden = true; $('#t-ver').hidden = false; $('#t-sabia').hidden = true; $('#t-rever').hidden = true;
    };
    var inicia = function () {
      var v = mod.value; cad = false;
      if (v === 'todos') fila = mistura(D.cartas);
      else if (v.indexOf('fam:') === 0) fila = mistura(D.cartas.filter(function (x) { return x.fam === v.slice(4); }));
      else { cad = true; fila = D.cadeias[+v.slice(4)].cods.map(acha); }
      pos = 0; sabia = 0; vistas = 0; $('#t-placar').textContent = ''; carta();
    };
    var proxima = function (ok) {
      vistas++; if (ok) sabia++;
      $('#t-placar').textContent = 'You knew ' + sabia + ' of ' + vistas + '.';
      if (!ok && !cad) fila.push(fila[pos]);
      pos++; carta();
    };
    $('#t-ver').addEventListener('click', function () { $('#t-res').hidden = false; this.hidden = true; $('#t-sabia').hidden = false; $('#t-rever').hidden = false; $('#t-sabia').focus(); });
    $('#t-sabia').addEventListener('click', function () { proxima(true); });
    $('#t-rever').addEventListener('click', function () { proxima(false); });
    mod.addEventListener('change', inicia);
    inicia();
  }

  /* hero: objeção que muda e busca direta */
  var nd = $('#n-dados');
  if (nd) {
    var ns = JSON.parse(nd.textContent), ni = 0;
    $('#n-o').addEventListener('click', function () {
      ni = (ni + 1) % ns.length; var n = ns[ni];
      $('#n-f').textContent = '"' + n.f + '"'; $('#n-r').textContent = n.r; $('#n-l').href = n.u;
    });
    var hq = $('#hq'), hres = $('#hres');
    // Busca do topo: o mesmo índice e a mesma ordem da busca do menu; o código do argumento (A14., V3.) vira o selo.
    var mostraH = function () {
      var t = norm(hq.value).trim(); hres.textContent = '';
      hres.hidden = t.length < 2; if (hres.hidden) return;
      var ach = procura(hq.value, 8);
      if (!ach.length) { var p = document.createElement('p'); p.textContent = 'Nothing found. Try another word.'; hres.appendChild(p); return; }
      ach.forEach(function (d) {
        var a = document.createElement('a'); a.href = base + d.u;
        var m = /^([A-Z]\d{1,2})\. (.*)$/.exec(d.t);
        if (m) { var b = document.createElement('b'); b.textContent = m[1]; a.appendChild(b); }
        a.appendChild(document.createTextNode(m ? m[2] : d.t)); hres.appendChild(a);
      });
    };
    hq.addEventListener('focus', function () { carrega(function () {}); });
    hq.addEventListener('input', function () { carrega(mostraH); });
    /* divisória da família visível */
    var gs = $$('.guias a');
    /* a divisória troca no momento em que o bloco da família chega à altura das divisórias */
    var folhas = $$('#catalogo .grupo-f'), guiasEl = $('.guias'), pedido = false;
    var marcaFolha = function () {
      pedido = false;
      if (!folhas.length || !guiasEl) return;
      var barra = $('.barra-f'), fixa = barra && getComputedStyle(barra).position === 'sticky';
      var linha = (fixa ? barra.getBoundingClientRect().bottom : 90) + 12, ativa = null;
      folhas.forEach(function (f) { if (!f.hidden && f.getBoundingClientRect().top <= linha) ativa = f; });
      var fim = folhas[folhas.length - 1].getBoundingClientRect().bottom < linha;
      gs.forEach(function (g) { g.classList.toggle('on', !!ativa && !fim && g.getAttribute('href') === '#' + ativa.id); });
    };
    /* ao clicar numa letra, ela acende na hora e fica fixa enquanto a página rola até o bloco,
       sem as letras do caminho piscarem uma a uma */
    var travada = null, soltar = null;
    var solta = function () { travada = null; marcaFolha(); };
    gs.forEach(function (g) {
      g.addEventListener('click', function () {
        travada = g;
        gs.forEach(function (o) { o.classList.toggle('on', o === g); });
        clearTimeout(soltar); soltar = setTimeout(solta, 1200);
      });
    });
    var pede = function () {
      if (travada) { clearTimeout(soltar); soltar = setTimeout(solta, 180); return; }
      if (!pedido) { pedido = true; requestAnimationFrame(marcaFolha); }
    };
    window.addEventListener('scrollend', function () { if (travada) { clearTimeout(soltar); solta(); } });
    window.addEventListener('scroll', pede, { passive: true });
    /* as abas de cada bloco param logo abaixo da barra de filtros, cuja altura muda com a largura da tela */
    var ajustaTopo = function () {
      var barra = $('.barra-f'); if (!barra) return;
      var cs = getComputedStyle(barra);
      if (cs.position === 'sticky') document.documentElement.style.setProperty('--topo-cad', Math.round((parseFloat(cs.top) || 0) + barra.offsetHeight + 12) + 'px');
    };
    ajustaTopo();
    window.addEventListener('resize', function () { ajustaTopo(); pede(); });
    $$('details', $('#catalogo') || document).forEach(function (d) { d.addEventListener('toggle', pede); });
    marcaFolha();
  }

  /* raciocínio antivegano: a conversa como árvore. Depois de cada objeção podem vir várias; cada ramo se abre sob demanda. */
  var rd = $('#rac-dados');
  if (rd) {
    var RD = JSON.parse(rd.textContent), trilha = [], abertos = {}, caixa = $('#rac'), atual = $('#rac-atual'), lista = $('#rac-trilha'), sel = $('#rac-sel'), arv = $('#rac-arvore');
    var el = function (tag, cls, tx) { var x = document.createElement(tag); if (cls) x.className = cls; if (tx) x.textContent = tx; return x; };
    var filhos = function (c) { return RD.n[c].p; };
    var abrePara = function (cam) { for (var i = 1; i <= cam.length; i++) abertos[cam.slice(0, i).join('-')] = true; };
    var escolhe = function (cam) { trilha = cam.slice(); abrePara(trilha); mostra(); };
    var ramo = function (cam, motivo) {
      var c = cam[cam.length - 1], n = RD.n[c], chave = cam.join('-'), ciclo = cam.slice(0, -1).indexOf(c) >= 0;
      var li = el('li', 'rac-no'); li.style.setProperty('--c', n.cor);
      var lin = el('div', 'rac-lin' + (chave === trilha.join('-') ? ' ativo' : ''));
      var fs = ciclo ? [] : filhos(c);
      if (fs.length) {
        var t = el('button', 'rac-tg', abertos[chave] ? '−' : '+'); t.type = 'button';
        t.setAttribute('aria-expanded', abertos[chave] ? 'true' : 'false');
        t.setAttribute('aria-label', (abertos[chave] ? 'Collapse' : 'Open') + ' ' + fs.length + ' paths from ' + c);
        t.addEventListener('click', function () { if (abertos[chave]) delete abertos[chave]; else abertos[chave] = true; desenha(); });
        lin.appendChild(t);
      } else lin.appendChild(el('span', 'rac-tg rac-folha', ciclo ? '↺' : n.raiz ? '●' : '·'));
      var b = el('button', 'rac-rot'); b.type = 'button';
      b.appendChild(el('b', '', c)); b.appendChild(document.createTextNode(' ' + n.f));
      if (fs.length && !abertos[chave]) b.appendChild(el('span', 'rac-qt', String(fs.length)));
      if (motivo) b.appendChild(el('small', '', motivo));
      if (ciclo) b.appendChild(el('small', 'rac-ciclo', '↺ already came up in this branch'));
      else if (n.raiz) b.appendChild(el('small', 'rac-ciclo', 'root'));
      b.addEventListener('click', function () { escolhe(cam); if (window.matchMedia('(max-width:899px)').matches) atual.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
      lin.appendChild(b); li.appendChild(lin);
      if (fs.length && abertos[chave]) {
        var ul = el('ul');
        fs.forEach(function (x) { ul.appendChild(ramo(cam.concat(x[0]), x[1])); });
        li.appendChild(ul);
      }
      return li;
    };
    var desenha = function () {
      arv.textContent = '';
      if (!trilha.length) return;
      var ul = el('ul', 'rac-raiz'); ul.appendChild(ramo([trilha[0]], '')); arv.appendChild(ul);
    };
    var mostra = function () {
      var c = trilha[trilha.length - 1], n = RD.n[c];
      caixa.hidden = !c; if (!c) return;
      desenha();
      lista.textContent = '';
      trilha.forEach(function (t, i) {
        var li = el('li'), b = el('button', '', t); b.type = 'button';
        b.addEventListener('click', function () { escolhe(trilha.slice(0, i + 1)); });
        li.appendChild(b); lista.appendChild(li);
      });
      atual.textContent = ''; atual.style.setProperty('--c', n.cor);
      var cab = el('p', 'rac-c'); cab.appendChild(el('span', 'cod', c)); if (n.raiz) cab.appendChild(el('span', 'selo', 'root'));
      atual.appendChild(cab);
      atual.appendChild(el('h2', '', '"' + n.f + '"'));
      var r = el('div', 'rac-resp'); r.appendChild(el('p', 'ti', n.cap ? 'Short answer' : 'Main flaw')); r.appendChild(el('p', '', n.r));
      var a = el('a', '', n.cap ? 'Open the full chapter →' : 'Open the summary →'); a.href = n.u; r.appendChild(a);
      atual.appendChild(r);
      var vis = trilha.slice(0, -1);
      if (n.p.length) {
        atual.appendChild(el('p', 'ti rac-vai', 'After this answer, the conversation usually goes to'));
        var g = el('div', 'rac-opc');
        n.p.forEach(function (x) {
          var d = RD.n[x[0]], b = el('button', 'rac-op'); b.type = 'button'; b.style.setProperty('--c', d.cor);
          var t = el('span', 'rac-op-t'); t.appendChild(el('b', '', x[0])); t.appendChild(document.createTextNode(' ' + d.f)); b.appendChild(t);
          b.appendChild(el('small', '', x[1] + (vis.indexOf(x[0]) >= 0 ? ' · already came up in this conversation' : '') + (d.raiz ? ' · root' : '')));
          b.addEventListener('click', function () { escolhe(trilha.concat(x[0])); atual.focus(); });
          g.appendChild(b);
        });
        atual.appendChild(g);
      } else {
        atual.appendChild(el('p', 'rac-fim', n.raiz ? 'This is one of the roots: the point where the conversation usually ends. From here, almost all that is left is frankness or the end of the conversation.' : 'No paths are catalogued from this argument yet. When an objection runs out, the conversation usually goes back to one of the roots: A8, J5 or E15.'));
        if (!n.raiz) {
          var gr = el('div', 'rac-opc');
          RD.raizes.forEach(function (rz) {
            var d = RD.n[rz]; if (!d) return;
            var b = el('button', 'rac-op'); b.type = 'button'; b.style.setProperty('--c', d.cor);
            var t = el('span', 'rac-op-t'); t.appendChild(el('b', '', rz)); t.appendChild(document.createTextNode(' ' + d.f)); b.appendChild(t);
            b.appendChild(el('small', '', 'Root'));
            b.addEventListener('click', function () { comeca(rz); });
            gr.appendChild(b);
          });
          atual.appendChild(gr);
        }
      }
      try { history.replaceState(null, '', '#' + trilha.join('-')); } catch (e) {}
    };
    var comeca = function (c) { if (!RD.n[c]) return; abertos = {}; escolhe([c]); caixa.scrollIntoView({ block: 'start' }); };
    sel.addEventListener('change', function () { comeca(sel.value); });
    $$('[data-ini]').forEach(function (b) { b.addEventListener('click', function () { comeca(b.dataset.ini); }); });
    $('#rac-volta').addEventListener('click', function () { if (trilha.length > 1) escolhe(trilha.slice(0, -1)); });
    $('#rac-zera').addEventListener('click', function () { trilha = []; abertos = {}; mostra(); arv.textContent = ''; sel.value = ''; window.scrollTo(0, 0); });
    $('#rac-mais').addEventListener('click', function () {
      // abre mais um nível: todo ramo visível e fechado (que não seja repetição) passa a mostrar os seus caminhos
      $$('.rac-tg[aria-expanded="false"]', arv).forEach(function (t) { t.click(); });
    });
    $('#rac-menos').addEventListener('click', function () { abertos = {}; abrePara(trilha); desenha(); });
    atual.tabIndex = -1;
    var doHash = function () {
      var h = location.hash.slice(1).split('-').filter(function (c) { return RD.n[c]; });
      if (h.length && h.join('-') !== trilha.join('-')) { if (h[0] !== trilha[0]) abertos = {}; escolhe(h); }
    };
    doHash(); window.addEventListener('hashchange', doHash);
  }

  /* copiar a resposta curta */
  $$('.copiar').forEach(function (b) {
    b.addEventListener('click', function () {
      var alvo = document.getElementById(b.dataset.alvo), tx = b.textContent;
      navigator.clipboard.writeText(alvo.innerText.trim()).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = tx; }, 1500); });
    });
  });
})();

/* barra da página: ouvir (voz em pt-BR), como citar e imprimir ou PDF, adaptado do Política Para Iniciantes */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var acoes = $('.acoes-cap'), raiz = $('.paineis');
  if (!acoes || !raiz) return;
  var dlg = null;
  function modal(titulo, html) {
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'janela';
      dlg.innerHTML = '<div class="jan-cab"><h2></h2><button type="button" class="jan-x" aria-label="Close">×</button></div><div class="jan-corpo"></div>';
      document.body.appendChild(dlg);
      $('.jan-x', dlg).addEventListener('click', function () { dlg.close(); });
      dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
    }
    $('h2', dlg).textContent = titulo; $('.jan-corpo', dlg).innerHTML = html;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    return $('.jan-corpo', dlg);
  }
  function copiar(txt, btn) {
    var ok = function () { if (btn) { var o = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = o; }, 1600); } };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, function () {});
    else { var t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); ok(); } catch (x) {} t.parentNode.removeChild(t); }
  }

  /* ----- imprimir: abre as gavetas fechadas antes de imprimir e as devolve depois ----- */
  window.addEventListener('beforeprint', function () { $$('details', document).forEach(function (d) { d.dataset.antes = d.open ? '1' : ''; d.open = true; }); });
  window.addEventListener('afterprint', function () { $$('details', document).forEach(function (d) { d.open = d.dataset.antes === '1'; }); });
  $('[data-acao="imprimir"]', acoes).addEventListener('click', function () { window.print(); });

  /* ----- como citar ----- */
  var MES = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  $('[data-acao="citar"]', acoes).addEventListener('click', function () {
    var d = new Date(), hoje = d.getDate() + ' ' + MES[d.getMonth()] + ' ' + d.getFullYear();
    var abnt = (acoes.dataset.abnt || '').replace('{ACESSO}', hoje), apa = acoes.dataset.apa || '';
    var limpo = function (h) { var t = document.createElement('div'); t.innerHTML = h; return t.textContent; };
    var c = modal('How to cite this page', '<p class="fino">Reference for this page, with the link and today’s access date. Check the style your institution requires.</p>' +
      '<div class="cit-bloco"><p class="cit-ti">MLA</p><p class="cit-txt">' + abnt + '</p><button type="button" class="btn alt" data-c="abnt">Copy MLA</button></div>' +
      '<div class="cit-bloco"><p class="cit-ti">APA</p><p class="cit-txt">' + apa + '</p><button type="button" class="btn alt" data-c="apa">Copy APA</button></div>');
    $('[data-c="abnt"]', c).addEventListener('click', function () { copiar(limpo(abnt), this); });
    $('[data-c="apa"]', c).addEventListener('click', function () { copiar(limpo(apa), this); });
  });

  /* ----- ouvir ----- */
  var bOuvir = $('[data-acao="ouvir"]', acoes);
  if (!('speechSynthesis' in window)) { bOuvir.hidden = true; return; }
  var synth = window.speechSynthesis, fila = [], pos = 0, tocando = false, vel = 1, atual = null;
  var bParar = document.createElement('button'); bParar.type = 'button'; bParar.innerHTML = '<span aria-hidden="true">■</span> Stop'; bParar.hidden = true;
  var bVel = document.createElement('button'); bVel.type = 'button'; bVel.textContent = '1×'; bVel.title = 'Velocidade da leitura'; bVel.hidden = true;
  bOuvir.after(bParar, bVel);
  /* escolhe uma voz em português do Brasil; as vozes chegam depois do carregamento em vários navegadores */
  var vozPt = null;
  var escolheVoz = function () {
    var vs = synth.getVoices(); if (!vs.length) return;
    var nota = function (v) {
      var l = (v.lang || '').replace('_', '-').toLowerCase(), n = (v.name || '').toLowerCase();
      if (l !== 'en-us' && l !== 'en-gb' && !/english/.test(n)) return l.indexOf('en') === 0 ? 1 : 0;
      return 10 + (/natural|online|neural/.test(n) ? 4 : 0) + (/google/.test(n) ? 3 : 0) + (/microsoft/.test(n) ? 2 : 0) + (v.localService ? 0 : 1);
    };
    var melhor = vs.map(function (v) { return [nota(v), v]; }).filter(function (x) { return x[0] > 0; }).sort(function (a, b) { return b[0] - a[0]; })[0];
    vozPt = melhor ? melhor[1] : null;
  };
  escolheVoz();
  if ('onvoiceschanged' in synth) synth.addEventListener('voiceschanged', escolheVoz);
  var voz = function () { if (!vozPt) escolheVoz(); return vozPt; };
  /* o que é lido: o texto da coluna de leitura, sem quizzes, fontes, índices, enquetes, botões e tabelas */
  var PULA = '.fontes, .pass, .qe, .rede, .copiar, table, button, nav, [hidden]';
  var monta = function () {
    fila = [];
    var titulo = $('.cena h1'), tese = $('.tese-c p');
    [titulo, tese].forEach(function (b) { if (b) fila.push([b, b.textContent.replace(/\s+/g, ' ').trim()]); });
    $$('h2, h3, h4, p, li, blockquote, dt, dd, summary', raiz).forEach(function (b) {
      if (b.closest(PULA)) return;
      if (b.tagName === 'LI' && b.querySelector('p, li')) return; /* evita ler duas vezes */
      var c = b.cloneNode(true); $$('sup, button', c).forEach(function (s) { s.parentNode.removeChild(s); });
      var t = c.textContent.replace(/\s+/g, ' ').trim(); if (!t) return;
      (t.match(/[^.!?;]+[.!?;]*\s*/g) || [t]).reduce(function (acc, f) {
        if (acc.length && (acc[acc.length - 1] + f).length < 220) acc[acc.length - 1] += f; else acc.push(f);
        return acc;
      }, []).forEach(function (pedaco) { fila.push([b, pedaco]); });
    });
  };
  var marca = function (b) {
    if (atual) atual.classList.remove('lendo');
    atual = b; if (!b) return; b.classList.add('lendo');
    var r = b.getBoundingClientRect(); if (r.top < 80 || r.bottom > innerHeight) b.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  var fala = function () {
    if (pos >= fila.length) { para(); return; }
    var it = fila[pos], u = new SpeechSynthesisUtterance(it[1]);
    var v = voz(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US'; u.rate = vel;
    u.onend = function () { if (!tocando) return; pos++; fala(); };
    marca(it[0]); synth.speak(u);
  };
  var estado = function () {
    bOuvir.setAttribute('aria-pressed', String(tocando));
    bOuvir.innerHTML = tocando ? '<span aria-hidden="true">❚❚</span> Pause' : '<span aria-hidden="true">▶</span> ' + (pos > 0 ? 'Continue' : 'Listen');
    bParar.hidden = bVel.hidden = !(tocando || pos > 0);
  };
  var para = function () { tocando = false; synth.cancel(); pos = 0; marca(null); estado(); };
  bOuvir.addEventListener('click', function () {
    if (!tocando && !voz() && !bOuvir.dataset.avisou) {
      bOuvir.dataset.avisou = '1';
      modal('No English voice found', '<p>Your browser or system has no English voice installed, so the reading may come out with another language’s accent.</p><p class="fino">On Windows: Settings → Time &amp; language → Speech → Add voices → English. On Android and iPhone, English voices are usually in the accessibility or text-to-speech settings. Chrome and Edge include English voices on most computers.</p>');
    }
    if (tocando) { tocando = false; synth.cancel(); estado(); return; }
    if (!fila.length) monta();
    tocando = true; estado(); fala();
  });
  bParar.addEventListener('click', para);
  bVel.addEventListener('click', function () {
    var vs = [1, 1.25, 1.5, 0.85]; vel = vs[(vs.indexOf(vel) + 1) % vs.length]; bVel.textContent = String(vel).replace('.', ',') + '×';
    if (tocando) { synth.cancel(); setTimeout(fala, 60); }
  });
  /* trocar de aba recomeça a leitura na aba nova */
  $$('[role="tab"]').forEach(function (t) { t.addEventListener('click', function () { if (fila.length) { para(); fila = []; } }); });
  window.addEventListener('pagehide', function () { synth.cancel(); });
})();

/* biblioteca: filtro por foco e idioma */
(function () {
  var g = document.querySelector('.bib-grade'); if (!g) return;
  var f = { foco: '', lingua: '' }, n = document.getElementById('bib-n');
  var cards = [].slice.call(g.querySelectorAll('.bib-card'));
  [].slice.call(document.querySelectorAll('.bib-filtros .chip')).forEach(function (b) {
    b.addEventListener('click', function () {
      f[b.dataset.g] = b.dataset.v;
      [].slice.call(document.querySelectorAll('.bib-filtros .chip[data-g="' + b.dataset.g + '"]')).forEach(function (o) { o.setAttribute('aria-pressed', o === b); });
      var k = 0;
      cards.forEach(function (c) { var ok = (!f.foco || c.dataset.foco === f.foco) && (!f.lingua || c.dataset.lingua === f.lingua); c.hidden = !ok; if (ok) k++; });
      n.textContent = k + (k === 1 ? ' book' : ' books');
    });
  });
})();
