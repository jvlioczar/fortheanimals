// Compartilhar um trecho como imagem: selecione um texto na página e escolha "Compartilhar trecho".
// A imagem sai pronta para redes sociais, em três formatos, com a frase do argumento e o endereço do site.
(function () {
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return [].slice.call((c || document).querySelectorAll(s)); };
  var raiz = $('.paineis') || $('.artigo') || $('#glos');
  if (!raiz || !window.CanvasRenderingContext2D) return;

  /* ---------- dados da página, para o crédito da imagem ---------- */
  var h1 = $('h1'), cod = $('.selo-c'), trilha = $('.trilha');
  var titulo = h1 ? h1.textContent.replace(/^"|"$/g, '').trim() : document.title;
  var codigo = cod ? cod.textContent.trim() : '';
  var secao = trilha ? trilha.textContent.replace(/\s+/g, ' ').replace(/^Home\s*\/\s*/, '').trim() : '';
  var SITE = location.host;

  /* ---------- janela ---------- */
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
  function baixar(nome, blob) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1000);
  }

  /* ---------- barra que aparece ao selecionar ---------- */
  var barra = document.createElement('div');
  barra.className = 'sel-barra'; barra.hidden = true;
  barra.setAttribute('role', 'toolbar'); barra.setAttribute('aria-label', 'Actions for the selected passage');
  barra.innerHTML = '<button type="button" data-s="imagem">Share passage</button><button type="button" data-s="texto">Copy with the source</button>';
  document.body.appendChild(barra);

  var trechoAtual = '', trechoBruto = '';
  /* tira as remissões a outros argumentos — (A7, A23), (ver A5), Ligado a B8 —, que só
     fazem sentido dentro do site: some o parêntese ou a frase em que elas aparecem */
  var semCodigos = function (r) {
    var f = r.cloneContents(), M = '\u0001', B = '\u0002';
    $$('a.ref', f).forEach(function (a) { a.parentNode.replaceChild(document.createTextNode(M), a); });
    $$('p, li, h1, h2, h3, h4, blockquote, figcaption, td, th, div', f).forEach(function (el) {
      el.insertBefore(document.createTextNode(B), el.firstChild);
      el.appendChild(document.createTextNode(B));
    });
    var partes = f.textContent.split(B).map(function (parte) {
      return parte
        .replace(/\s+/g, ' ')
        .replace(/\s*\([^()]*\u0001[^()]*\)/g, '')      /* (A7, A23), (ver A5), (que leva a B1) */
        .replace(/[^.!?…]*\u0001[^.!?…]*(?:[.!?…]+)?/g, '') /* Ligado a B8, É o caso de C8 */
        .trim();
    });
    return partes.filter(function (x) { return x; }).join(' ')
      .replace(/\s+([.,;:!?)\]])/g, '$1')
      .replace(/\(\s+/g, '(')
      .replace(/\s+/g, ' ')
      .trim();
  };
  var leSel = function () {
    var s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    var r = s.getRangeAt(0);
    if (!raiz.contains(r.commonAncestorContainer)) return null;
    var bruto = s.toString().replace(/\s+/g, ' ').trim();
    var t = semCodigos(r);                 /* so a remissao foi marcada: nada a compartilhar */
    if (t.length < 3) return null;
    return { t: t, bruto: bruto, rect: r.getBoundingClientRect() };
  };
  var posiciona = function (rect) {
    barra.hidden = false;
    var w = barra.offsetWidth, h = barra.offsetHeight;
    barra.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + scrollX + 'px';
    barra.style.top = (rect.top - h - 10 < 70 ? rect.bottom + scrollY + 10 : rect.top + scrollY - h - 10) + 'px';
  };
  var mostra = function () {
    var s = leSel();
    if (!s) { barra.hidden = true; return; }
    trechoAtual = s.t; trechoBruto = s.bruto; posiciona(s.rect);
  };
  var tSel;
  document.addEventListener('selectionchange', function () { clearTimeout(tSel); tSel = setTimeout(mostra, 220); });
  barra.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
  window.addEventListener('resize', function () { barra.hidden = true; });

  var credito = function () {
    var p = [];
    if (codigo) p.push(codigo + '. ' + titulo); else p.push(titulo);
    return '“' + trechoAtual + '” — ' + p.join(', ') + ', ' + SITE;
  };
  barra.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.s === 'texto') copiar(credito(), b);
    else { compartilha(trechoAtual, trechoBruto); barra.hidden = true; }
  });

  /* ---------- link direto para o trecho (fragmento de texto) ---------- */
  var linkTrecho = function (t) {
    var enc = function (x) { return encodeURIComponent(x).replace(/-/g, '%2D').replace(/,/g, '%2C'); };
    var p = t.split(/\s+/);
    var frag = p.length > 12 ? enc(p.slice(0, 5).join(' ')) + ',' + enc(p.slice(-4).join(' ')) : enc(t);
    return location.origin + location.pathname + '#:~:text=' + frag;
  };

  /* ---------- a imagem ---------- */
  var FORMATOS = [
    { k: 'post', w: 1080, h: 1350, r: 'Portrait 4:5' },
    { k: 'quadrado', w: 1080, h: 1080, r: 'Square 1:1' },
    { k: 'story', w: 1080, h: 1920, r: 'Story 9:16' }
  ];
  var TINTA = '#0a3703', CREME = '#fcfaf5', AMARELO = '#ffeb5b';

  /* o logo do guia: caderno com o focinho, no mesmo desenho do cabeçalho */
  var logo = function (x, px, py, esc) {
    var p = function (a, b) { return [px + a * esc, py + b * esc]; };
    x.fillStyle = TINTA;
    var r = 4 * esc, a = p(2, 2), b = p(38, 32);
    x.beginPath();
    if (x.roundRect) x.roundRect(a[0], a[1], b[0] - a[0], b[1] - a[1], r);
    else x.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    x.fill();
    x.beginPath(); var q1 = p(19, 31), q2 = p(11, 38), q3 = p(11, 31);
    x.moveTo(q1[0], q1[1]); x.lineTo(q2[0], q2[1]); x.lineTo(q3[0], q3[1]); x.closePath(); x.fill();
    var elipse = function (cx, cy, rx, ry, ang, cor) {
      x.save(); x.translate(cx, cy); x.rotate(ang * Math.PI / 180); x.beginPath();
      x.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI); x.fillStyle = cor; x.fill(); x.restore();
    };
    var o1 = p(15.5, 11.5), o2 = p(24.5, 11.5);
    elipse(o1[0], o1[1], 2.7 * esc, 6.8 * esc, -10, AMARELO);
    elipse(o2[0], o2[1], 2.7 * esc, 6.8 * esc, 10, AMARELO);
    var c = p(20, 22); elipse(c[0], c[1], 8 * esc, 6.8 * esc, 0, AMARELO);
    [[17, 21, 1.1], [23, 21, 1.1], [20, 24.2, 1]].forEach(function (d) {
      var pt = p(d[0], d[1]); elipse(pt[0], pt[1], d[2] * esc, d[2] * esc, 0, TINTA);
    });
  };

  /* quebra um texto em linhas que cabem na largura; corta só se passar do número de linhas */
  var linhasDe = function (x, txt, fonte, largura, maxLinhas) {
    x.font = fonte;
    var ps = txt.split(' '), ls = [], l = '';
    ps.forEach(function (w) {
      var tst = l ? l + ' ' + w : w;
      if (x.measureText(tst).width > largura && l) { ls.push(l); l = w; } else l = tst;
    });
    if (l) ls.push(l);
    if (maxLinhas && ls.length > maxLinhas) {
      ls = ls.slice(0, maxLinhas);
      var u = ls[maxLinhas - 1];
      while (x.measureText(u + '…').width > largura && u.length > 4) u = u.replace(/\s*\S$/, '');
      ls[maxLinhas - 1] = u.replace(/[\s,;:.]+$/, '') + '…';
    }
    return ls;
  };

  var desenha = function (cv, t) {
    var x = cv.getContext('2d'), W = cv.width, H = cv.height;
    var m = Math.round(W * 0.083), largura = W - m * 2, mi = Math.round(W * 0.037);
    /* fundo azul claro e a folha, como no site */
    x.fillStyle = '#d6ecfb'; x.fillRect(0, 0, W, H);
    x.fillStyle = CREME; x.strokeStyle = TINTA; x.lineWidth = 6;
    x.beginPath();
    if (x.roundRect) x.roundRect(mi, mi, W - mi * 2, H - mi * 2, 36); else x.rect(mi, mi, W - mi * 2, H - mi * 2);
    x.fill(); x.stroke();

    /* ---- rodapé: medido antes, para o trecho usar só o espaço que sobra ---- */
    var fTit = '700 ' + Math.round(W * 0.03) + 'px Inter, system-ui, sans-serif';
    var fSec = '500 ' + Math.round(W * 0.025) + 'px Inter, system-ui, sans-serif';
    var fUrl = '700 ' + Math.round(W * 0.025) + 'px "JetBrains Mono", ui-monospace, monospace';
    var lsTit = linhasDe(x, (codigo ? codigo + '. ' : '') + titulo, fTit, largura, 2);
    var lsSec = secao ? linhasDe(x, secao, fSec, largura, 1) : [];
    var altTit = Math.round(W * 0.042), altSec = Math.round(W * 0.036);
    var mf = H - mi - Math.round(W * 0.05);                     /* base do texto do rodapé */
    var yUrl = mf;
    var ySec = yUrl - (lsSec.length ? Math.round(W * 0.042) : 0);
    var yTitUlt = (lsSec.length ? ySec : yUrl) - Math.round(W * 0.042);   /* linha de baixo do título */
    var yTit = yTitUlt - altTit * (lsTit.length - 1);                     /* primeira linha do título */
    var yBar = yTit - altTit - Math.round(W * 0.012);

    /* ---- cabeçalho: logo e nome ---- */
    var topo = Math.round(mi + W * 0.085);
    var le = W * 0.0028, ly0 = Math.round(topo - le * 20);
    logo(x, m, ly0, le);
    var tx = Math.round(m + le * 40 + W * 0.022);
    x.fillStyle = TINTA; x.font = '700 ' + Math.round(W * 0.029) + 'px Inter, system-ui, sans-serif';
    x.fillText('For the Animals', tx, Math.round(ly0 + le * 15));
    x.fillText('An Argument Guide', tx, Math.round(ly0 + le * 15 + W * 0.038));

    /* ---- área do trecho (folha lisa, sem pauta) ---- */
    var y1 = Math.round(topo + W * 0.06), y2 = yBar - Math.round(W * 0.035);

    /* ---- o trecho: diminui a letra até caber, e só corta no limite ---- */
    var alturaMax = y2 - y1, tam = Math.round(W * 0.06), minimo = Math.round(W * 0.021), linhas, alt;
    while (true) {
      linhas = linhasDe(x, t, '600 ' + tam + 'px "Mozilla Headline", Georgia, serif', largura, 0);
      alt = Math.round(tam * 1.32);
      if (linhas.length * alt <= alturaMax || tam <= minimo) break;
      tam -= 2;
    }
    var max = Math.max(1, Math.floor(alturaMax / alt));
    if (linhas.length > max) linhas = linhasDe(x, t, '600 ' + tam + 'px "Mozilla Headline", Georgia, serif', largura, max);
    x.fillStyle = TINTA; x.font = '600 ' + tam + 'px "Mozilla Headline", Georgia, serif';
    var y0 = y1 + (alturaMax - linhas.length * alt) / 2 + tam * 0.82;
    linhas.forEach(function (l, k) { x.fillText(l, m, y0 + k * alt); });

    /* ---- rodapé ---- */
    x.fillStyle = AMARELO; x.fillRect(m, yBar, Math.round(W * 0.075), 8);
    x.fillStyle = TINTA; x.font = fTit;
    lsTit.forEach(function (l, k) { x.fillText(l, m, yTit + k * altTit); });
    if (lsSec.length) { x.fillStyle = '#4f6346'; x.font = fSec; x.fillText(lsSec[0], m, ySec); }
    x.fillStyle = TINTA; x.font = fUrl;
    x.fillText(SITE, m, yUrl);
  };

  var compartilha = function (t, bruto) {
    bruto = bruto || t;
    var fmt = FORMATOS[0];
    var opcoes = FORMATOS.map(function (f, k) {
      return '<button type="button" class="chip-fmt' + (k ? '' : ' on') + '" data-f="' + f.k + '" aria-pressed="' + (k ? 'false' : 'true') + '">' + f.r + '</button>';
    }).join('');
    var c = modal('Share passage',
      '<p class="fmt-linha" role="group" aria-label="Image format">' + opcoes + '</p>' +
      '<canvas class="cv-trecho" width="1080" height="1350" aria-label="Image with the passage"></canvas>' +
      '<p class="jan-btns"><button type="button" class="btn" data-k="img">Download image</button>' +
      '<button type="button" class="btn alt" data-k="copiar-img">Copy image</button>' +
      '<button type="button" class="btn alt" data-k="link">Copy link to passage</button>' +
      (navigator.share ? '<button type="button" class="btn alt" data-k="share">Share…</button>' : '') + '</p>' +
      '<p class="fino">The image comes ready for social media. The link opens this page scrolled to the passage, with it highlighted, in browsers that support this feature.</p>');
    var cv = $('canvas', c);
    var pinta = function () { cv.width = fmt.w; cv.height = fmt.h; desenha(cv, t); };
    var f = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('600 60px "Mozilla Headline"'), document.fonts.load('700 34px Inter'), document.fonts.load('700 28px "JetBrains Mono"')])
      : Promise.resolve();
    f.then(pinta, pinta);
    $$('.chip-fmt', c).forEach(function (b) {
      b.addEventListener('click', function () {
        fmt = FORMATOS.filter(function (x) { return x.k === b.dataset.f; })[0];
        $$('.chip-fmt', c).forEach(function (o) { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        pinta();
      });
    });
    var nomeArq = function () { return 'passage-' + (codigo ? codigo.toLowerCase() + '-' : '') + fmt.k + '.png'; };
    $('[data-k="img"]', c).addEventListener('click', function () { cv.toBlob(function (b) { baixar(nomeArq(), b); }); });
    var ci = $('[data-k="copiar-img"]', c);
    if (!(navigator.clipboard && window.ClipboardItem)) ci.remove();
    else ci.addEventListener('click', function () {
      var bt = this;
      cv.toBlob(function (b) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () {
          var antes = bt.textContent; bt.textContent = 'Copied ✓'; setTimeout(function () { bt.textContent = antes; }, 1800);
        }, function () { bt.textContent = 'Could not copy, download it'; });
      });
    });
    $('[data-k="link"]', c).addEventListener('click', function () { copiar(linkTrecho(bruto), this); });
    var sh = $('[data-k="share"]', c);
    if (sh) sh.addEventListener('click', function () {
      cv.toBlob(function (b) {
        var arq = new File([b], nomeArq(), { type: 'image/png' });
        var dados = { title: titulo, text: credito(), url: linkTrecho(bruto) };
        if (navigator.canShare && navigator.canShare({ files: [arq] })) dados.files = [arq];
        navigator.share(dados).catch(function () {});
      });
    });
  };

  /* ---------- cartão de resposta: o argumento, uma resposta e um destaque (a pergunta de retorno ou "diga melhor") ----------
     Nos capítulos e nas objeções políticas, os textos vêm da página; no "Stop saying this", de #resp-dados. */
  var textoDe = function (el) {
    if (!el) return '';
    var r = document.createRange(); r.selectNodeContents(el);
    var t = semCodigos(r).replace(/^["“”]+|["“”]+$/g, '').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  var RESP = null, ancora = null, dadosResp = $('#resp-dados');
  if (dadosResp) {
    RESP = JSON.parse(dadosResp.textContent);
    ancora = $('.troca');
  } else if ($('#curta-txt')) {
    var curtaEl = $('#curta-txt'), teseEl = $('.tese-c[data-frase] p');   /* só os capítulos têm "a resposta em uma frase" */
    var pergEl = $('.retorno p', curtaEl.closest('.painel') || document);
    RESP = { ops: [['curta', 'Short answer', 'Short answer', textoDe(curtaEl)]], cab: '', caixa: null, inclui: 'Include the question to ask back' };
    if (teseEl) RESP.ops.push(['frase', 'In one sentence', 'The answer in one sentence', textoDe(teseEl)]);
    if (pergEl) RESP.caixa = ['Ask a question back', textoDe(pergEl)];
    ancora = (pergEl && pergEl.closest('.retorno')) || curtaEl.closest('.duas') || curtaEl;
  }
  if (RESP && ancora) {
    var semPonto = titulo.replace(/\.+$/, '');   /* “Frase.” vira “Frase” */
    var desenhaResp = function (cv, o) {
      var x = cv.getContext('2d'), W = cv.width, H = cv.height;
      var m = Math.round(W * 0.083), largura = W - m * 2, mi = Math.round(W * 0.037);
      x.fillStyle = '#d6ecfb'; x.fillRect(0, 0, W, H);
      x.fillStyle = CREME; x.strokeStyle = TINTA; x.lineWidth = 6;
      x.beginPath();
      if (x.roundRect) x.roundRect(mi, mi, W - mi * 2, H - mi * 2, 36); else x.rect(mi, mi, W - mi * 2, H - mi * 2);
      x.fill(); x.stroke();

      /* cabeçalho */
      var topo = Math.round(mi + W * 0.085), le = W * 0.0028, ly0 = Math.round(topo - le * 20);
      logo(x, m, ly0, le);
      var tx = Math.round(m + le * 40 + W * 0.022);
      x.fillStyle = TINTA; x.font = '700 ' + Math.round(W * 0.029) + 'px Inter, system-ui, sans-serif';
      x.fillText('For the Animals', tx, Math.round(ly0 + le * 15));
      x.fillText('An Argument Guide', tx, Math.round(ly0 + le * 15 + W * 0.038));

      /* rodapé: a seção e o endereço */
      var fSec = '500 ' + Math.round(W * 0.025) + 'px Inter, system-ui, sans-serif';
      var fUrl = '700 ' + Math.round(W * 0.025) + 'px "JetBrains Mono", ui-monospace, monospace';
      var yUrl = H - mi - Math.round(W * 0.05);
      var lsSec = secao ? linhasDe(x, (codigo ? codigo + ' · ' : '') + secao, fSec, largura, 1) : [];
      var ySec = yUrl - Math.round(W * 0.042);
      var yBar = (lsSec.length ? ySec : yUrl) - Math.round(W * 0.05);

      /* miolo: tudo encolhe junto até caber entre o cabeçalho e o rodapé; começa grande para o story usar a altura a mais */
      var y1 = Math.round(topo + W * 0.075), y2 = yBar - Math.round(W * 0.04), disp = y2 - y1;
      var rot = '700 ' + Math.round(W * 0.021) + 'px "JetBrains Mono", ui-monospace, monospace', aRot = Math.round(W * 0.036);
      var hCab = o.cab ? aRot : 0;
      var pad = Math.round(W * 0.035), lCaixa = largura - pad * 2;
      var k = 1.4, A, R, P, tA, tR, tP, hA, hR, hP, gap;
      while (true) {
        tA = Math.round(W * 0.05 * k); tR = Math.round(W * 0.036 * k); tP = Math.round(W * 0.04 * k);
        A = linhasDe(x, '“' + semPonto + '”', '600 ' + tA + 'px "Mozilla Headline", Georgia, serif', largura, 4);
        R = linhasDe(x, o.resp, '500 ' + tR + 'px Inter, system-ui, sans-serif', largura, 0);
        P = o.caixa ? linhasDe(x, o.caixa[1], '600 ' + tP + 'px "Mozilla Headline", Georgia, serif', lCaixa, 0) : [];
        gap = Math.round(W * 0.04 * Math.min(1.2, Math.max(k, 0.6)));
        hA = hCab + A.length * Math.round(tA * 1.2);
        hR = aRot + R.length * Math.round(tR * 1.42);
        hP = P.length ? pad * 2 + aRot + P.length * Math.round(tP * 1.28) : 0;
        if (hA + gap + hR + (hP ? gap + hP : 0) <= disp || k <= 0.5) break;
        k -= 0.025;
      }
      var total = hA + gap + hR + (hP ? gap + hP : 0);
      if (total > disp) {   /* no limite, a resposta é cortada, nunca o destaque */
        var cabe = Math.max(1, Math.floor((disp - (total - R.length * Math.round(tR * 1.42))) / Math.round(tR * 1.42)));
        R = linhasDe(x, o.resp, '500 ' + tR + 'px Inter, system-ui, sans-serif', largura, cabe);
        hR = aRot + R.length * Math.round(tR * 1.42); total = hA + gap + hR + (hP ? gap + hP : 0);
      }
      var y = y1 + Math.max(0, (disp - total) / 2);

      /* o argumento */
      if (o.cab) { x.fillStyle = '#b8460f'; x.font = rot; x.fillText(o.cab.toUpperCase(), m, y + W * 0.02); y += hCab; }
      x.fillStyle = TINTA; x.font = '600 ' + tA + 'px "Mozilla Headline", Georgia, serif';
      A.forEach(function (l, i) { x.fillText(l, m, y + tA * 0.85 + i * Math.round(tA * 1.2)); });
      y += hA - hCab + gap;

      /* a resposta */
      x.fillStyle = '#4f6346'; x.font = rot; x.fillText(o.rotulo.toUpperCase(), m, y + W * 0.02);
      x.fillStyle = TINTA; x.font = '500 ' + tR + 'px Inter, system-ui, sans-serif';
      R.forEach(function (l, i) { x.fillText(l, m, y + aRot + tR * 0.85 + i * Math.round(tR * 1.42)); });
      y += hR;

      /* o destaque amarelo */
      if (hP) {
        y += gap;
        x.fillStyle = AMARELO; x.strokeStyle = TINTA; x.lineWidth = 4;
        x.beginPath();
        if (x.roundRect) x.roundRect(m, y, largura, hP, 24); else x.rect(m, y, largura, hP);
        x.fill(); x.stroke();
        x.fillStyle = TINTA; x.font = rot; x.fillText(o.caixa[0].toUpperCase(), m + pad, y + pad + W * 0.02);
        x.font = '600 ' + tP + 'px "Mozilla Headline", Georgia, serif';
        P.forEach(function (l, i) { x.fillText(l, m + pad, y + pad + aRot + tP * 0.85 + i * Math.round(tP * 1.28)); });
      }

      /* rodapé */
      x.fillStyle = AMARELO; x.fillRect(m, yBar, Math.round(W * 0.075), 8);
      if (lsSec.length) { x.fillStyle = '#4f6346'; x.font = fSec; x.fillText(lsSec[0], m, ySec); }
      x.fillStyle = TINTA; x.font = fUrl; x.fillText(SITE, m, yUrl);
    };

    var abreResp = function () {
      var fmt = FORMATOS[0], op = RESP.ops[0], comCaixa = !!RESP.caixa;
      var chips = function (lista, attr, atual) {
        return lista.map(function (f) { return '<button type="button" class="chip-fmt' + (f[0] === atual ? ' on' : '') + '" data-' + attr + '="' + f[0] + '" aria-pressed="' + (f[0] === atual ? 'true' : 'false') + '">' + f[1] + '</button>'; }).join('');
      };
      var c = modal('Share the answer',
        (RESP.ops.length > 1 ? '<p class="fmt-linha" role="group" aria-label="Which answer">' + chips(RESP.ops, 'r', op[0]) + '</p>' : '') +
        (RESP.caixa ? '<p class="fmt-linha"><label class="resp-perg"><input type="checkbox" checked> ' + RESP.inclui + '</label></p>' : '') +
        '<p class="fmt-linha" role="group" aria-label="Image format">' + chips(FORMATOS.map(function (f) { return [f.k, f.r]; }), 'f', fmt.k) + '</p>' +
        '<canvas class="cv-trecho" width="1080" height="1350" aria-label="Image with the answer"></canvas>' +
        '<p class="jan-btns"><button type="button" class="btn" data-k="img">Download image</button>' +
        '<button type="button" class="btn alt" data-k="copiar-img">Copy image</button>' +
        '<button type="button" class="btn alt" data-k="texto">Copy as text</button>' +
        (navigator.share ? '<button type="button" class="btn alt" data-k="share">Share…</button>' : '') + '</p>');
      var cv = $('canvas', c);
      var pinta = function () { cv.width = fmt.w; cv.height = fmt.h; desenhaResp(cv, { cab: RESP.cab, resp: op[3], rotulo: op[2], caixa: comCaixa ? RESP.caixa : null }); };
      var f = document.fonts && document.fonts.load
        ? Promise.all([document.fonts.load('600 60px "Mozilla Headline"'), document.fonts.load('500 34px Inter'), document.fonts.load('700 28px "JetBrains Mono"')])
        : Promise.resolve();
      f.then(pinta, pinta);
      var liga = function (attr, faz) {
        $$('[data-' + attr + ']', c).forEach(function (b) {
          b.addEventListener('click', function () {
            faz(b.dataset[attr]);
            $$('[data-' + attr + ']', c).forEach(function (o) { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
            pinta();
          });
        });
      };
      liga('r', function (v) { op = RESP.ops.filter(function (x) { return x[0] === v; })[0]; });
      liga('f', function (v) { fmt = FORMATOS.filter(function (x) { return x.k === v; })[0]; });
      var cx = $('.resp-perg input', c);
      if (cx) cx.addEventListener('change', function () { comCaixa = cx.checked; pinta(); });
      var link = location.origin + location.pathname;
      var comoTexto = function () { return (RESP.cab ? RESP.cab + ': ' : '') + '“' + semPonto + '”\n\n' + op[3] + (comCaixa && RESP.caixa ? '\n\n' + (RESP.cab ? RESP.caixa[0] + ': ' : '') + RESP.caixa[1] : '') + '\n\n' + link; };
      var nomeArq = function () { return 'answer-' + (codigo ? codigo.toLowerCase() : location.pathname.split('/').pop().replace('.html', '')) + '-' + fmt.k + '.png'; };
      $('[data-k="img"]', c).addEventListener('click', function () { cv.toBlob(function (b) { baixar(nomeArq(), b); }); });
      $('[data-k="texto"]', c).addEventListener('click', function () { copiar(comoTexto(), this); });
      var ci = $('[data-k="copiar-img"]', c);
      if (!(navigator.clipboard && window.ClipboardItem)) ci.remove();
      else ci.addEventListener('click', function () {
        var bt = this;
        cv.toBlob(function (b) {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () {
            var antes = bt.textContent; bt.textContent = 'Copied ✓'; setTimeout(function () { bt.textContent = antes; }, 1800);
          }, function () { bt.textContent = 'Could not copy, download it'; });
        });
      });
      var sh = $('[data-k="share"]', c);
      if (sh) sh.addEventListener('click', function () {
        cv.toBlob(function (b) {
          var arq = new File([b], nomeArq(), { type: 'image/png' });
          var dados = { title: titulo, text: comoTexto(), url: link };
          if (navigator.canShare && navigator.canShare({ files: [arq] })) dados.files = [arq];
          navigator.share(dados).catch(function () {});
        });
      });
    };

    /* o botão fica logo abaixo do destaque (a pergunta de retorno ou "como dizer melhor") */
    var bot = document.createElement('p'); bot.className = 'resp-img';
    bot.innerHTML = '<button type="button" class="btn">Make an image of the answer</button><small>' + (RESP.dica || 'The argument, the answer and the question to ask back in one image for social media.') + '</small>';
    ancora.parentNode.insertBefore(bot, ancora.nextSibling);
    $('button', bot).addEventListener('click', abreResp);
  }
})();
