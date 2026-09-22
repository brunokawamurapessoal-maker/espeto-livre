/* ==========================================================================
   ESPETO LIVRE — scripts.js
   ---------------------------------------------------------------------------
   Interface do site: comanda digital, carrinho, checkout, área do cliente e
   painel administrativo.

   Os dados (cardápio, bairros, pedidos, clientes, estoque, funcionários…)
   ficam num banco real no Supabase e chegam aqui pela camada assets/js/banco.js
   (carregada antes deste arquivo). As regras que envolvem dinheiro e estoque —
   preço dos itens, frete, custo, baixa de estoque, estorno — são executadas no
   servidor (veja database/schema.sql); este arquivo só mostra e coleta dados.

   Dados iniciais (cardápio, bairros, endereço, horários): database/seed.sql
   ========================================================================== */

(function(){
  'use strict';

  const Banco = window.Banco;

  /* ========================================================================
     2. UTILITÁRIOS
     ======================================================================== */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  function formatarMoeda(valor){
    return (Number(valor) || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  }

  function formatarNumero(valor){
    return (Number(valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }

  function chaveDiaLocal(iso){
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function formatarDataCurta(isoData){
    const [ano, mes, dia] = isoData.split('-');
    return `${dia}/${mes}`;
  }

  function gerarId(){
    return Banco.uuid(); // o banco usa UUID como chave
  }

  function escapar(texto){
    const div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  function mostrarToast(mensagem){
    let toast = $('#toast-global');
    if (!toast){
      toast = document.createElement('div');
      toast.id = 'toast-global';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = mensagem;
    toast.classList.add('visivel');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('visivel'), 2600);
  }

  function somenteDigitos(texto){ return (texto || '').replace(/\D/g, ''); }

  /* Redimensiona e comprime uma imagem no próprio navegador antes de enviar
     (a foto vira um data URL JPEG; depois vai pro Storage do Supabase).
     Mantém os arquivos pequenos (~30-80KB) e o site rápido. */
  function redimensionarImagemParaDataURL(arquivo, maxLargura, qualidade){
    return new Promise((resolve, reject) => {
      if (!arquivo || !arquivo.type.startsWith('image/')){
        reject(new Error('Arquivo não é uma imagem.'));
        return;
      }
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Não foi possível processar a imagem.'));
        img.onload = () => {
          const escala = Math.min(1, (maxLargura || 480) / img.width);
          const largura = Math.round(img.width * escala);
          const altura = Math.round(img.height * escala);
          const canvas = document.createElement('canvas');
          canvas.width = largura;
          canvas.height = altura;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, largura, altura);
          resolve(canvas.toDataURL('image/jpeg', qualidade || 0.72));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  function formatarTelefone(valor){
    let d = somenteDigitos(valor).slice(0, 11);
    if (d.length > 10) return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim().replace(/-$/, '');
    if (d.length > 5)  return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim().replace(/-$/, '');
    if (d.length > 2)  return d.replace(/(\d{2})(\d{0,5})/, '($1) $2').trim();
    return d;
  }

  /* ========================================================================
     3. CAMADA DE DADOS (Supabase, via banco.js)
     ======================================================================== */
  const Dados = Banco.dados;

  /* ========================================================================
     3.5 RECEITA — custo de insumos, ficha técnica e estoque
     ======================================================================== */

  /* Calcula o custo de um produto somando (quantidade usada × custo do insumo)
     de cada item da ficha técnica. Retorna null se o produto não tem ficha
     técnica cadastrada (custo desconhecido, não é o mesmo que custo zero). */
  function calcularCustoProduto(produtoId, fichas, insumos){
    fichas = fichas || Dados.getFichasTecnicas();
    insumos = insumos || Dados.getInsumos();
    const ficha = fichas[produtoId];
    if (!ficha || !ficha.length) return null;
    const mapaInsumos = {};
    insumos.forEach(i => { mapaInsumos[i.id] = i; });
    let total = 0;
    let algumEncontrado = false;
    ficha.forEach(item => {
      const insumo = mapaInsumos[item.insumoId];
      if (!insumo) return;
      algumEncontrado = true;
      total += (insumo.custoUnidade || 0) * (item.quantidade || 0);
    });
    return algumEncontrado ? total : null;
  }

  /* Calcula o frete com base na distância do bairro escolhido.
     fórmula: taxa fixa + (ida e volta * distância * preço do combustível / consumo)
     arredondado para cima, de 50 em 50 centavos. */
  function calcularFrete(distanciaKm, config){
    const cfg = config || Dados.getConfig();
    const custoCombustivel = (distanciaKm * 2 * cfg.precoGasolina) / (cfg.consumoKmLitro || 12);
    const bruto = (cfg.taxaBaseEntrega || 0) + custoCombustivel;
    return Math.ceil(Number((bruto * 2).toFixed(6))) / 2; // arredonda para cima, múltiplo de R$0,50 (igual ao servidor)
  }

  /* ---- Motor de distância real: Google Maps (Distance Matrix) ----
     Carrega a API do Google Maps sob demanda (só se houver chave configurada)
     e usa o serviço oficial de Distance Matrix para calcular a distância de
     condução real entre a loja e o endereço completo do cliente. Se a chave
     não estiver configurada, a API falhar ou o endereço não for encontrado,
     quem chama essa função deve cair de volta pra distância aproximada por
     bairro — o checkout nunca pode travar por causa disso. */
  let promessaGoogleMaps = null;
  function carregarGoogleMapsApi(apiKey){
    if (!apiKey) return Promise.reject(new Error('Nenhuma chave de API do Google Maps configurada.'));
    if (window.google && window.google.maps && window.google.maps.DistanceMatrixService) return Promise.resolve();
    if (promessaGoogleMaps) return promessaGoogleMaps;
    promessaGoogleMaps = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { promessaGoogleMaps = null; reject(new Error('Não foi possível carregar a API do Google Maps.')); };
      document.head.appendChild(script);
    });
    return promessaGoogleMaps;
  }

  function calcularDistanciaViaGoogle(enderecoOrigem, enderecoDestino, apiKey){
    return carregarGoogleMapsApi(apiKey).then(() => new Promise((resolve, reject) => {
      const service = new google.maps.DistanceMatrixService();
      service.getDistanceMatrix({
        origins: [enderecoOrigem],
        destinations: [enderecoDestino],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC
      }, (resposta, status) => {
        if (status !== 'OK'){ reject(new Error('Google Maps respondeu: ' + status)); return; }
        const elemento = resposta?.rows?.[0]?.elements?.[0];
        if (!elemento || elemento.status !== 'OK'){ reject(new Error('Endereço não encontrado pelo Google Maps.')); return; }
        resolve(elemento.distance.value / 1000); // metros -> km
      });
    }));
  }

  /* ---- Horário de funcionamento: "aberto agora" / "fechado agora" ---- */
  function minutosDoDia(hhmm){
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function estaAbertoAgora(horarios, agora){
    if (!Array.isArray(horarios) || !horarios.length) return null; // sem dados suficientes
    agora = agora || new Date();
    const diaAtual = agora.getDay();
    const diaAnterior = (diaAtual + 6) % 7;
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

    const hojeCfg = horarios.find(h => h.dia === diaAtual);
    const ontemCfg = horarios.find(h => h.dia === diaAnterior);

    // dentro do expediente de hoje (considerando virada de noite)
    if (hojeCfg && hojeCfg.aberto){
      const abertura = minutosDoDia(hojeCfg.abertura);
      let fechamento = minutosDoDia(hojeCfg.fechamento);
      if (fechamento <= abertura) fechamento += 24 * 60;
      if (minutosAgora >= abertura && minutosAgora < fechamento) return true;
    }
    // ainda dentro do expediente de ontem, que virou a noite e continua hoje de madrugada
    if (ontemCfg && ontemCfg.aberto){
      const abertura = minutosDoDia(ontemCfg.abertura);
      let fechamento = minutosDoDia(ontemCfg.fechamento);
      if (fechamento <= abertura){
        const fechamentoRelativoHoje = fechamento; // já é o horário do dia seguinte (madrugada de hoje)
        if (minutosAgora < fechamentoRelativoHoje) return true;
      }
    }
    return false;
  }

  /* Agrupa dias consecutivos com o mesmo horário para exibir de forma amigável,
     ex.: Segunda, Terça, Quarta, Quinta com o mesmo horário viram "Segunda a Quinta". */
  function agruparHorariosParaExibicao(horarios){
    const ordem = [1,2,3,4,5,6,0]; // começa na segunda, termina no domingo
    const ordenados = ordem.map(d => horarios.find(h => h.dia === d)).filter(Boolean);
    const grupos = [];
    ordenados.forEach(h => {
      const chave = h.aberto ? `${h.abertura}-${h.fechamento}` : 'fechado';
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.chave === chave){
        ultimo.dias.push(h.nome);
      } else {
        grupos.push({ chave, dias: [h.nome], aberto: h.aberto, abertura: h.abertura, fechamento: h.fechamento });
      }
    });
    return grupos.map(g => {
      const label = g.dias.length > 1 ? `${g.dias[0]} a ${g.dias[g.dias.length-1]}` : g.dias[0];
      const horario = g.aberto ? `${g.abertura} às ${g.fechamento}` : 'Fechado';
      return { dia: label, horario };
    });
  }

  /* ========================================================================
     4. APLICAR CONFIGURAÇÃO NA PÁGINA (comum a todas as páginas)
     ======================================================================== */
  function aplicarConfigNaPagina(){
    const cfg = Dados.getConfig();
    $$('[data-cfg="nomeLoja"]').forEach(el => el.textContent = cfg.nomeLoja);
    $$('[data-cfg="tagline"]').forEach(el => el.textContent = cfg.tagline);
    $$('[data-cfg="enderecoTexto"]').forEach(el => el.textContent = cfg.enderecoTexto);
    $$('[data-cfg-href="whatsapp"]').forEach(el => {
      el.href = 'https://wa.me/' + cfg.whatsapp;
    });
    $$('[data-cfg-href="instagram"]').forEach(el => { if (cfg.instagram) el.href = cfg.instagram; });
    $$('[data-cfg-href="facebook"]').forEach(el => { if (cfg.facebook) el.href = cfg.facebook; else el.style.display = 'none'; });
    $$('[data-cfg-href="mapa"]').forEach(el => {
      el.href = cfg.enderecoUrlGoogleMaps
        || (typeof cfg.enderecoLat === 'number' && typeof cfg.enderecoLng === 'number'
          ? `https://www.google.com/maps/search/?api=1&query=${cfg.enderecoLat},${cfg.enderecoLng}`
          : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cfg.enderecoMapaBusca || cfg.enderecoTexto));
    });

    const corposHorarios = $$('#tabela-horarios-corpo, #tabela-horarios-corpo-rodape');
    const horariosExibicao = agruparHorariosParaExibicao(cfg.horarios);
    corposHorarios.forEach(corpo => {
      corpo.innerHTML = horariosExibicao.map(h =>
        `<tr><td>${escapar(h.dia)}</td><td>${escapar(h.horario)}</td></tr>`
      ).join('');
    });

    atualizarStatusLoja(cfg);

    // Mapa via Google Maps, usando coordenadas exatas em vez de busca por texto —
    // o aviso de "conteúdo personalizado" que o Google mostra costuma vir da
    // busca de lugar/endereço; com lat/lng puros isso não acontece.
    const iframeMapa = $('#iframe-mapa');
    if (iframeMapa && typeof cfg.enderecoLat === 'number' && typeof cfg.enderecoLng === 'number'){
      iframeMapa.src = `https://www.google.com/maps?q=${cfg.enderecoLat},${cfg.enderecoLng}&z=16&output=embed`;
    }

    const ano = $('#ano-atual');
    if (ano) ano.textContent = new Date().getFullYear();
  }

  function atualizarStatusLoja(cfg){
    const aberto = estaAbertoAgora(cfg.horarios);
    if (aberto === null) return;
    $$('.status-loja').forEach(el => {
      el.classList.toggle('fechado', !aberto);
      el.innerHTML = `<span class="ponto"></span> ${aberto ? 'Aberto agora' : 'Fechado agora'}`;
    });
  }

  /* Botão "copiar endereço" (página de contato) */
  function iniciarCopiarEndereco(){
    const btn = $('#btn-copiar-endereco');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const cfg = Dados.getConfig();
      const texto = cfg.enderecoTexto || '';
      try{
        await navigator.clipboard.writeText(texto);
        mostrarToast('Endereço copiado!');
      }catch(e){
        mostrarToast('Não foi possível copiar automaticamente. Endereço: ' + texto);
      }
    });
  }

  /* Menu mobile (hambúrguer) — comum a todas as páginas */
  function iniciarMenuMobile(){
    const toggle = $('.menu-mobile-toggle');
    const nav = $('.nav-principal');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => {
      nav.classList.toggle('aberto');
      toggle.textContent = nav.classList.contains('aberto') ? '✕' : '☰';
    });
    $$('.nav-principal a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('aberto');
      toggle.textContent = '☰';
    }));
  }

  /* ========================================================================
     4.5. ÁREA DO CLIENTE — compartilhada entre todas as páginas
     (saudação com dropdown no cabeçalho, logout, dados de perfil mesclados)
     ======================================================================== */

  /* ---- Perfis de funcionário ---- */
  function rotuloPerfil(perfil){
    return { funcionario: 'Funcionário', gestor: 'Gestor', admin: 'Admin' }[perfil] || perfil;
  }

  /* Junta o que está salvo na sessão (nome/telefone/email do login atual) com
     o cadastro persistido do cliente (que pode ter endereço salvo de pedidos
     ou edições anteriores no perfil). O cadastro persistido tem prioridade
     nos campos extras, já que é a fonte mais completa/atualizada. */
  function obterIdentificacaoAtual(){
    try{
      const bruto = localStorage.getItem('espetolivre_identificacao');
      if (!bruto) return null;
      const sessao = JSON.parse(bruto);
      const clientes = Dados.getClientes();
      const perfil = clientes[sessao.telefone];
      return perfil ? Object.assign({}, sessao, perfil) : sessao;
    }catch(e){ return null; }
  }

  function renderizarAreaCliente(){
    const area = $('#area-cliente');
    const btnEntrar = $('#btn-abrir-login');
    const id = obterIdentificacaoAtual();
    if (!id){
      if (area) area.hidden = true;
      if (btnEntrar) btnEntrar.hidden = false;
      return;
    }
    if (area) area.hidden = false;
    if (btnEntrar) btnEntrar.hidden = true;
    const nomeEl = $('#saudacao-nome');
    if (nomeEl) nomeEl.textContent = (id.nome || '').split(' ')[0];
  }

  function ligarAreaCliente(){
    const area = $('#area-cliente');
    if (!area) return;
    const btn = $('#btn-saudacao');
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      area.classList.toggle('aberto');
    });
    document.addEventListener('click', () => area.classList.remove('aberto'));

    $('#btn-logout-cliente')?.addEventListener('click', () => {
      localStorage.removeItem('espetolivre_identificacao');
      const base = window.location.pathname.includes('/pages/') ? '../index.html' : 'index.html';
      window.location.href = base;
    });
  }

  /* Sugestão simples baseada no histórico real de pedidos do cliente:
     olha o item mais pedido e tenta indicar algo que combine — um
     complemento (bebida/acompanhamento) que ele ainda não pediu, ou outro
     item da categoria favorita que ele ainda não experimentou. */
  function gerarSugestaoPersonalizada(pedidosCliente, produtos){
    if (!pedidosCliente || !pedidosCliente.length) return null;

    const contagem = {};
    pedidosCliente.forEach(p => p.itens.forEach(i => {
      contagem[i.nome] = (contagem[i.nome] || 0) + i.qtd;
    }));

    const mapaCategoria = {};
    produtos.forEach(pr => { mapaCategoria[pr.nome] = pr.categoria; });

    const categoriasPedidas = new Set();
    Object.keys(contagem).forEach(nome => {
      if (mapaCategoria[nome]) categoriasPedidas.add(mapaCategoria[nome]);
    });

    const ranking = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    const [topNome, topQtd] = ranking[0];
    const topCategoria = mapaCategoria[topNome];

    // 1) tenta sugerir uma categoria complementar que o cliente nunca pediu
    const categoriasComplementares = ['Bebidas', 'Acompanhamentos'];
    const faltando = categoriasComplementares.find(c => !categoriasPedidas.has(c));
    if (faltando){
      const opcoes = produtos.filter(p => p.categoria === faltando && p.disponivel);
      if (opcoes.length){
        const sugestao = opcoes[Object.keys(contagem).length % opcoes.length];
        return `Você já é fã de ${topNome} (pedido ${topQtd}x por aqui) — que tal completar o próximo pedido com ${sugestao.nome}?`;
      }
    }

    // 2) senão, sugere outro item da mesma categoria favorita ainda não pedido
    if (topCategoria){
      const outrosDaCategoria = produtos.filter(p => p.categoria === topCategoria && p.disponivel && !contagem[p.nome]);
      if (outrosDaCategoria.length){
        return `Notamos que você adora ${topCategoria.toLowerCase()} — já pediu ${topNome} ${topQtd}x. Bora experimentar ${outrosDaCategoria[0].nome}?`;
      }
    }

    // 3) fallback: só reforça o favorito
    return `Seu pedido mais frequente é ${topNome}, já pedido ${topQtd}x por aqui. Bom apetite no próximo! 🍢`;
  }

  /* ========================================================================
     5. PÁGINA: COMANDA DIGITAL (index.html)
     ======================================================================== */
  const Comanda = {
    carrinho: [], // { itemId (produtoId+obs hash simplificado), produtoId, nome, preco, qtd, obs }
    etapaAtual: 1,
    totalEtapas: 3,
    pedidoFinalizado: null,

    iniciar(){
      if (!$('#app-comanda')) return; // não está na página da comanda

      this.produtos = Dados.getProdutos().filter(p => p.disponivel);
      this.categorias = [...new Set(this.produtos.map(p => p.categoria))];
      this.carregarCarrinhoSalvo();
      this.identificacao = obterIdentificacaoAtual();
      this.ligarGateIdentificacao();

      this.renderizarNavCategorias();
      this.renderizarCardapio();
      this.renderizarBairrosSelect();
      this.atualizarCarrinhoUI();
      this.ligarEventosGerais();
      this.ligarEventosCheckout();
      this.ligarEventosModalProduto();
    },

    carregarCarrinhoSalvo(){
      try{
        const salvo = sessionStorage.getItem('espetolivre_carrinho_sessao');
        if (salvo) this.carrinho = JSON.parse(salvo);
      }catch(e){ /* silencioso */ }
      // o cardápio pode ter mudado desde que o carrinho foi salvo: tira o que saiu do ar
      // e atualiza nome/preço do que continua (o preço final é sempre o do servidor)
      this.carrinho = this.carrinho.filter(i => this.produtos.some(p => p.id === i.produtoId));
      this.carrinho.forEach(i => {
        const p = this.produtos.find(x => x.id === i.produtoId);
        i.nome = p.nome; i.preco = p.preco; i.foto = p.foto || null; i.emoji = p.emoji || '🍢';
      });
      this.salvarCarrinhoSessao();
    },
    salvarCarrinhoSessao(){
      try{ sessionStorage.setItem('espetolivre_carrinho_sessao', JSON.stringify(this.carrinho)); }catch(e){}
    },

    abrirGate(prefill){
      const portal = $('#portal-identificacao');
      if (!portal) return;
      portal.classList.add('aberto');
      if (prefill && this.identificacao){
        $('#campo-id-nome').value = this.identificacao.nome;
        $('#campo-id-telefone').value = formatarTelefone(this.identificacao.telefone);
      }
      setTimeout(() => $('#campo-id-nome')?.focus(), 250);
    },

    fecharGate(){
      const portal = $('#portal-identificacao');
      if (!portal) return;
      portal.classList.remove('aberto');
    },

    ligarGateIdentificacao(){
      const form = $('#form-identificacao-cliente');
      const campoEmail = $('#campo-id-email');
      const campoNome = $('#campo-id-nome');
      const blocoSenha = $('#bloco-id-senha');
      const campoSenha = $('#campo-id-senha');
      const campoTelefone = $('#campo-id-telefone');
      const btnEnviar = $('#btn-enviar-identificacao');
      const legenda = $('#legenda-identificacao');
      const linkEquipe = $('#link-acesso-equipe');
      const erro = $('#erro-identificacao');
      const legendaCliente = legenda ? legenda.textContent : '';
      let modoEquipe = false;

      // "Acesso da equipe": troca o formulário do cliente pelo login de funcionário
      const aplicarModo = () => {
        if (blocoSenha) blocoSenha.hidden = !modoEquipe;
        $('#campo-wrap-telefone') && ($('#campo-wrap-telefone').hidden = modoEquipe);
        campoNome?.closest('.campo') && (campoNome.closest('.campo').hidden = modoEquipe);
        if (campoNome) campoNome.required = !modoEquipe;
        if (campoSenha) campoSenha.required = modoEquipe;
        const rotuloEmail = $('label[for="campo-id-email"]');
        if (rotuloEmail) rotuloEmail.textContent = modoEquipe ? 'E-mail da equipe' : 'E-mail (opcional)';
        if (campoEmail) campoEmail.required = modoEquipe;
        if (btnEnviar) btnEnviar.textContent = modoEquipe ? 'Entrar no painel 🔐' : 'Começar meu pedido 🍢';
        if (legenda) legenda.textContent = modoEquipe ? 'Acesso restrito à equipe — informe seu e-mail e senha.' : legendaCliente;
        if (linkEquipe) linkEquipe.textContent = modoEquipe ? '← Voltar para o pedido' : 'Acesso da equipe';
        if (erro) erro.classList.remove('visivel');
      };
      linkEquipe?.addEventListener('click', (e) => { e.preventDefault(); modoEquipe = !modoEquipe; aplicarModo(); });

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const mostrarErro = (msg) => { erro.textContent = msg; erro.classList.add('visivel'); };
        erro.classList.remove('visivel');
        btnEnviar.disabled = true;
        try{
          if (modoEquipe){
            try{
              await Banco.auth.entrar((campoEmail.value || '').trim(), campoSenha.value);
            }catch(err){
              mostrarErro(err.credenciais ? 'E-mail ou senha incorretos. Tente novamente.' : Banco.erroAmigavel(err));
              return;
            }
            window.location.href = 'pages/admin.html';
            return;
          }

          const nome = campoNome.value.trim();
          const email = (campoEmail?.value || '').trim();
          const telefone = somenteDigitos(campoTelefone.value);
          if (nome.length < 2){ mostrarErro('Preencha seu nome.'); return; }
          if (telefone.length < 10){ mostrarErro('Informe um WhatsApp válido com DDD.'); return; }

          let perfil;
          try{
            perfil = await Banco.cliente.identificar(nome, telefone, email);
          }catch(err){
            mostrarErro(Banco.erroAmigavel(err));
            return;
          }
          localStorage.setItem('espetolivre_identificacao', JSON.stringify({ nome: perfil.nome, telefone: perfil.telefone, email: perfil.email || '' }));
          localStorage.setItem('espetolivre_ultimo_tel', perfil.telefone);

          this.identificacao = obterIdentificacaoAtual();
          this.fecharGate();
          renderizarAreaCliente();
          mostrarToast(`Prontinho, ${nome.split(' ')[0]}!`);
        }finally{
          btnEnviar.disabled = false;
        }
      });

      campoTelefone?.addEventListener('input', (e) => {
        e.target.value = formatarTelefone(e.target.value);
      });

      // botão "Entrar" do cabeçalho + fechar pelo X ou clicando fora do card
      $('#btn-abrir-login')?.addEventListener('click', () => this.abrirGate());
      $('#btn-fechar-login')?.addEventListener('click', () => this.fecharGate());
      $('#portal-identificacao')?.addEventListener('click', (e) => {
        if (e.target.id === 'portal-identificacao') this.fecharGate();
      });
    },

    renderizarNavCategorias(){
      const nav = $('#nav-categorias');
      if (!nav) return;
      nav.innerHTML = this.categorias.map((cat, i) =>
        `<button data-cat="${escapar(cat)}" class="${i===0?'ativa':''}">${escapar(cat)}</button>`
      ).join('');
      $$('button', nav).forEach(btn => {
        btn.addEventListener('click', () => {
          $$('button', nav).forEach(b => b.classList.remove('ativa'));
          btn.classList.add('ativa');
          const alvo = document.getElementById('cat-' + slugify(btn.dataset.cat));
          if (alvo){
            const y = alvo.getBoundingClientRect().top + window.scrollY - (document.querySelector('.categorias-nav').offsetHeight + document.querySelector('.cabecalho').offsetHeight) - 6;
            window.scrollTo({ top: y, behavior:'smooth' });
          }
        });
      });
    },

    renderizarCardapio(){
      const container = $('#lista-cardapio');
      if (!container) return;

      container.innerHTML = this.categorias.map(cat => {
        const itens = this.produtos.filter(p => p.categoria === cat);
        return `
          <section class="secao-cardapio" id="cat-${slugify(cat)}">
            <div class="cabecalho-categoria">
              <h2>${escapar(cat)}</h2>
            </div>
            <div class="grade-itens">
              ${itens.map(p => this.templateItem(p)).join('')}
            </div>
          </section>`;
      }).join('');

      $$('.item-card').forEach(card => this.ligarEventosItem(card));
    },

    templateItem(p){
      const qtdAtual = this.qtdNoCarrinhoSemObs(p.id);
      const visualItem = p.foto
        ? `<img src="${p.foto}" alt="${escapar(p.nome)}">`
        : (p.emoji || '🍢');
      return `
        <article class="item-card" data-produto-id="${p.id}" role="button" tabindex="0" aria-label="Ver detalhes de ${escapar(p.nome)}">
          <div class="emoji">
            ${visualItem}
            ${qtdAtual > 0 ? `<span class="badge-qtd-carrinho">${qtdAtual}</span>` : ''}
          </div>
          <div class="info">
            <h3>${escapar(p.nome)}</h3>
            <span class="preco">${formatarMoeda(p.preco)}</span>
          </div>
        </article>`;
    },

    qtdNoCarrinhoSemObs(produtoId){
      return this.carrinho.filter(i => i.produtoId === produtoId).reduce((s,i)=>s+i.qtd,0);
    },

    ligarEventosItem(card){
      const produtoId = card.dataset.produtoId;
      const abrir = () => this.abrirModalProduto(produtoId);
      card.addEventListener('click', abrir);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); abrir(); }
      });
    },

    /* ---- Modal de produto: abre ao clicar em qualquer item do cardápio ---- */
    abrirModalProduto(produtoId){
      const produto = this.produtos.find(p => p.id === produtoId);
      if (!produto) return;
      this.produtoModalAtual = produto;
      this.qtdModalAtual = 1;

      $('#produto-modal-foto').innerHTML = produto.foto
        ? `<img src="${produto.foto}" alt="${escapar(produto.nome)}">`
        : `<span class="emoji-grande">${produto.emoji || '🍢'}</span>`;
      $('#produto-modal-nome').textContent = produto.nome;
      $('#produto-modal-descricao').textContent = produto.descricao || '';
      $('#produto-modal-preco').textContent = formatarMoeda(produto.preco);
      $('#modal-produto-obs').value = '';
      $('#modal-qtd-valor').textContent = this.qtdModalAtual;
      this.atualizarSubtotalModalProduto();

      $('#modal-produto')?.classList.add('aberto');
      $('#overlay-geral')?.classList.add('aberto');
    },

    fecharModalProduto(){
      $('#modal-produto')?.classList.remove('aberto');
      $('#overlay-geral')?.classList.remove('aberto');
      this.produtoModalAtual = null;
    },

    atualizarSubtotalModalProduto(){
      const el = $('#modal-produto-subtotal');
      if (el && this.produtoModalAtual) el.textContent = formatarMoeda(this.produtoModalAtual.preco * this.qtdModalAtual);
    },

    ligarEventosModalProduto(){
      const modal = $('#modal-produto');
      modal?.addEventListener('click', (e) => { if (e.target === modal) this.fecharModalProduto(); });
      $('#modal-qtd-mais')?.addEventListener('click', () => {
        this.qtdModalAtual++;
        $('#modal-qtd-valor').textContent = this.qtdModalAtual;
        this.atualizarSubtotalModalProduto();
      });
      $('#modal-qtd-menos')?.addEventListener('click', () => {
        if (this.qtdModalAtual <= 1) return;
        this.qtdModalAtual--;
        $('#modal-qtd-valor').textContent = this.qtdModalAtual;
        this.atualizarSubtotalModalProduto();
      });
      $('#btn-fechar-modal-produto')?.addEventListener('click', () => this.fecharModalProduto());
      $('#btn-adicionar-modal-produto')?.addEventListener('click', () => {
        if (!this.produtoModalAtual) return;
        const obs = $('#modal-produto-obs').value.trim();
        this.adicionarAoCarrinho(this.produtoModalAtual, obs, this.qtdModalAtual);
        this.atualizarCarrinhoUI();
        this.sincronizarQtdCardapio();
        mostrarToast(`${this.produtoModalAtual.nome} adicionado ao pedido!`);
        this.fecharModalProduto();
      });
    },

    adicionarAoCarrinho(produto, obs, qtd){
      qtd = qtd || 1;
      const chave = produto.id + '::' + obs;
      let item = this.carrinho.find(i => i.chave === chave);
      if (item){
        item.qtd += qtd;
      } else {
        this.carrinho.push({ chave, produtoId: produto.id, nome: produto.nome, preco: produto.preco, qtd, obs, foto: produto.foto || null, emoji: produto.emoji || '🍢' });
      }
      this.salvarCarrinhoSessao();
    },

    subtotal(){
      return this.carrinho.reduce((s,i) => s + i.preco * i.qtd, 0);
    },

    atualizarCarrinhoUI(){
      const totalItens = this.carrinho.reduce((s,i)=>s+i.qtd,0);
      $$('.contagem-carrinho').forEach(el => {
        el.textContent = totalItens;
        el.style.display = totalItens > 0 ? '' : 'none';
      });
      $$('.btn-carrinho, .flutuante-carrinho').forEach(el => el.style.display = '');

      const flutuante = $('#flutuante-carrinho');
      if (flutuante) flutuante.classList.toggle('visivel', totalItens > 0 && window.innerWidth < 860);
      const flutuanteTotal = $('#flutuante-total');
      if (flutuanteTotal) flutuanteTotal.textContent = formatarMoeda(this.subtotal());
      const flutuanteQtd = $('#flutuante-qtd');
      if (flutuanteQtd) flutuanteQtd.textContent = totalItens;

      const corpo = $('#corpo-carrinho');
      if (!corpo) return;
      if (this.carrinho.length === 0){
        corpo.innerHTML = `<div class="carrinho-vazio"><div class="icone">🍢</div><p>Seu carrinho está vazio.<br>Escolha os espetinhos no cardápio!</p></div>`;
      } else {
        corpo.innerHTML = this.carrinho.map(i => `
          <div class="item-carrinho" data-chave="${escapar(i.chave)}">
            <div class="miniatura-carrinho">${i.foto ? `<img src="${i.foto}" alt="">` : (i.emoji || '🍢')}</div>
            <div class="info">
              <div class="nome">${escapar(i.nome)}</div>
              ${i.obs ? `<div class="obs">"${escapar(i.obs)}"</div>` : ''}
              <div class="preco-unit">${formatarMoeda(i.preco)}</div>
              <div class="linha-baixo">
                <div class="stepper" data-chave-carrinho="${escapar(i.chave)}">
                  <button class="btn-menos-carrinho" type="button" aria-label="Diminuir">−</button>
                  <span class="qtd">${i.qtd}</span>
                  <button class="btn-mais-carrinho" type="button" aria-label="Aumentar">+</button>
                </div>
                <button class="remover-item" type="button">remover</button>
              </div>
            </div>
          </div>`).join('');

        $$('.btn-mais-carrinho', corpo).forEach(btn => btn.addEventListener('click', (e) => {
          const chave = e.target.closest('[data-chave-carrinho]').dataset.chaveCarrinho;
          const item = this.carrinho.find(i => i.chave === chave);
          if (item){ item.qtd++; this.salvarCarrinhoSessao(); this.atualizarCarrinhoUI(); this.sincronizarQtdCardapio(); }
        }));
        $$('.btn-menos-carrinho', corpo).forEach(btn => btn.addEventListener('click', (e) => {
          const chave = e.target.closest('[data-chave-carrinho]').dataset.chaveCarrinho;
          const item = this.carrinho.find(i => i.chave === chave);
          if (item){ item.qtd--; if (item.qtd<=0) this.carrinho = this.carrinho.filter(i=>i!==item); this.salvarCarrinhoSessao(); this.atualizarCarrinhoUI(); this.sincronizarQtdCardapio(); }
        }));
        $$('.remover-item', corpo).forEach(btn => btn.addEventListener('click', (e) => {
          const chave = e.target.closest('[data-chave]').dataset.chave;
          this.carrinho = this.carrinho.filter(i => i.chave !== chave);
          this.salvarCarrinhoSessao(); this.atualizarCarrinhoUI(); this.sincronizarQtdCardapio();
        }));
      }

      const subtotalEl = $('#carrinho-subtotal');
      if (subtotalEl) subtotalEl.textContent = formatarMoeda(this.subtotal());
      const btnFinalizar = $('#btn-abrir-checkout');
      if (btnFinalizar) btnFinalizar.disabled = this.carrinho.length === 0;
    },

    sincronizarQtdCardapio(){
      $$('.item-card').forEach(card => {
        const id = card.dataset.produtoId;
        const nova = this.qtdNoCarrinhoSemObs(id);
        const emoji = $('.emoji', card);
        let badge = $('.badge-qtd-carrinho', card);
        if (nova > 0){
          if (!badge){
            badge = document.createElement('span');
            badge.className = 'badge-qtd-carrinho';
            emoji.appendChild(badge);
          }
          badge.textContent = nova;
        } else if (badge){
          badge.remove();
        }
      });
    },

    ligarEventosGerais(){
      const painel = $('#painel-carrinho');
      const overlay = $('#overlay-geral');
      const abrir = () => { painel.classList.add('aberto'); overlay.classList.add('aberto'); };
      const fechar = () => { painel.classList.remove('aberto'); overlay.classList.remove('aberto'); };

      $$('.btn-carrinho, #flutuante-carrinho').forEach(el => el.addEventListener('click', abrir));
      $('#fechar-carrinho')?.addEventListener('click', fechar);
      overlay?.addEventListener('click', () => { fechar(); this.fecharCheckout(); this.fecharModalProduto(); });

      window.addEventListener('resize', () => this.atualizarCarrinhoUI());
    },

    renderizarBairrosSelect(){
      const select = $('#select-bairro');
      if (!select) return;
      const bairros = Dados.getBairros().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      select.innerHTML = '<option value="">Selecione seu bairro...</option>' +
        bairros.map(b => `<option value="${b.id}">${escapar(b.nome)}</option>`).join('');
    },

    /* ---- Checkout em etapas ---- */
    ligarEventosCheckout(){
      const modal = $('#modal-checkout');
      const overlay = $('#overlay-geral');
      if (!modal) return;

      $('#btn-abrir-checkout')?.addEventListener('click', () => {
        if (this.carrinho.length === 0) return;
        this.identificacao = obterIdentificacaoAtual();
        const etapaInicial = this.identificacao ? 2 : 1;
        this.etapaAtual = etapaInicial;
        this.mostrarEtapa(etapaInicial);
        modal.classList.add('aberto');
        overlay.classList.add('aberto');
        $('#painel-carrinho')?.classList.remove('aberto');
      });
      $$('.fechar-modal').forEach(b => b.addEventListener('click', () => this.fecharCheckout()));
      modal.addEventListener('click', (e) => { if (e.target === modal) this.fecharCheckout(); });

      // Tipo de entrega (retirada / delivery)
      $$('.opcoes-toggle button', modal).forEach(btn => {
        btn.addEventListener('click', () => {
          $$('.opcoes-toggle button', modal).forEach(b => b.classList.remove('selecionada'));
          btn.classList.add('selecionada');
          const tipo = btn.dataset.tipo;
          $('#bloco-endereco-entrega').hidden = tipo !== 'delivery';
          this.tipoEntrega = tipo;
        });
      });

      $('#select-bairro')?.addEventListener('change', () => this.atualizarResumoFrete());
      let debounceEndereco;
      $$('#campo-rua, #campo-numero').forEach(campo => {
        campo?.addEventListener('input', () => {
          clearTimeout(debounceEndereco);
          debounceEndereco = setTimeout(() => this.atualizarResumoFrete(), 700);
        });
      });

      // Pagamento
      $$('.opcao-pagamento').forEach(op => {
        op.addEventListener('click', () => {
          $$('.opcao-pagamento').forEach(o => o.classList.remove('selecionada'));
          op.classList.add('selecionada');
          $('#opcao-' + op.dataset.forma).checked = true;
          $('#campo-troco').hidden = op.dataset.forma !== 'dinheiro';
        });
      });

      $('#btn-identificacao-continuar')?.addEventListener('click', () => this.validarEAvancarIdentificacao());
      $('#campo-checkout-telefone')?.addEventListener('input', (e) => { e.target.value = formatarTelefone(e.target.value); });
      $('#btn-entrega-continuar')?.addEventListener('click', () => this.validarEAvancarEntrega());
      $('#btn-revisao-voltar')?.addEventListener('click', () => this.mostrarEtapa(2));
      $('#btn-enviar-pedido')?.addEventListener('click', () => this.finalizarPedido());
      $('#btn-novo-pedido')?.addEventListener('click', () => { this.fecharCheckout(); window.location.reload(); });
    },

    async validarEAvancarIdentificacao(){
      const erro = $('#erro-checkout-identificacao');
      const nome = $('#campo-checkout-nome').value.trim();
      const telefone = somenteDigitos($('#campo-checkout-telefone').value);
      if (nome.length < 2 || telefone.length < 10){
        erro.textContent = 'Preencha seu nome e um WhatsApp válido com DDD.';
        erro.classList.add('visivel');
        return;
      }
      erro.classList.remove('visivel');

      const btn = $('#btn-identificacao-continuar');
      if (btn) btn.disabled = true;
      let perfil;
      try{
        perfil = await Banco.cliente.identificar(nome, telefone, '');
      }catch(err){
        erro.textContent = Banco.erroAmigavel(err);
        erro.classList.add('visivel');
        return;
      }finally{
        if (btn) btn.disabled = false;
      }

      localStorage.setItem('espetolivre_identificacao', JSON.stringify({ nome: perfil.nome, telefone: perfil.telefone, email: perfil.email || '' }));
      localStorage.setItem('espetolivre_ultimo_tel', perfil.telefone);

      this.identificacao = obterIdentificacaoAtual();
      renderizarAreaCliente();
      this.mostrarEtapa(2);
    },

    mostrarEtapa(n){
      this.etapaAtual = n;
      $$('.etapa-checkout').forEach(el => el.hidden = Number(el.dataset.etapa) !== n);
      $$('.progresso-etapas span').forEach((el, i) => el.classList.toggle('feita', i < n));
      if (n === 3) this.montarResumoFinal();
    },

    async atualizarResumoFrete(){
      const selectBairro = $('#select-bairro');
      const bairros = Dados.getBairros();
      const bairro = bairros.find(b => b.id === selectBairro.value);
      const aviso = $('#aviso-frete');
      if (!bairro){ aviso.hidden = true; this.freteAtual = 0; return; }

      const cfg = Dados.getConfig();
      this.bairroAtual = bairro;
      const idChamada = (this._chamadaFreteId = (this._chamadaFreteId || 0) + 1);

      const rua = $('#campo-rua')?.value.trim();
      const numero = $('#campo-numero')?.value.trim();

      aviso.hidden = false;
      aviso.innerHTML = `Calculando frete para <strong>${escapar(bairro.nome)}</strong>...`;

      let distanciaKm = bairro.distanciaKm;
      let comoCalculado = 'estimado'; // 'estimado' (por bairro) ou 'google' (distância real)

      const podeTentarGoogle = rua && numero && cfg.googleMapsApiKey
        && typeof cfg.enderecoLat === 'number' && typeof cfg.enderecoLng === 'number';

      if (podeTentarGoogle){
        try{
          const enderecoDestino = `${rua}, ${numero} - ${bairro.nome}, Fortaleza - CE, Brasil`;
          const origem = { lat: cfg.enderecoLat, lng: cfg.enderecoLng };
          const distanciaReal = await calcularDistanciaViaGoogle(origem, enderecoDestino, cfg.googleMapsApiKey);
          if (idChamada !== this._chamadaFreteId) return; // uma digitação mais nova já disparou outra chamada
          distanciaKm = distanciaReal;
          comoCalculado = 'google';
        }catch(erro){
          if (idChamada !== this._chamadaFreteId) return;
          console.warn('Distância real indisponível, usando estimativa por bairro:', erro.message);
        }
      }

      if (idChamada !== this._chamadaFreteId) return;

      const frete = calcularFrete(distanciaKm, cfg);
      this.freteAtual = frete;
      this.distanciaFreteKm = distanciaKm;
      this.origemDistanciaFrete = comoCalculado;
      aviso.hidden = false;
      aviso.innerHTML = comoCalculado === 'google'
        ? `📍 Distância real via Google Maps: <strong>${distanciaKm.toFixed(1)} km</strong> — frete: <strong>${formatarMoeda(frete)}</strong>`
        : `Frete para <strong>${escapar(bairro.nome)}</strong> (~${distanciaKm} km, estimado): <strong>${formatarMoeda(frete)}</strong>`;
    },

    validarEAvancarEntrega(){
      const erro = $('#erro-entrega');
      if (this.tipoEntrega === 'delivery'){
        const bairroId = $('#select-bairro').value;
        const rua = $('#campo-rua').value.trim();
        const numero = $('#campo-numero').value.trim();
        if (!bairroId || !rua || !numero){
          erro.textContent = 'Selecione o bairro e informe rua e número para entrega.';
          erro.classList.add('visivel');
          return;
        }
      } else if (!this.tipoEntrega){
        erro.textContent = 'Escolha retirada no local ou entrega.';
        erro.classList.add('visivel');
        return;
      }
      erro.classList.remove('visivel');
      this.mostrarEtapa(3);
    },

    montarResumoFinal(){
      const subtotal = this.subtotal();
      const frete = this.tipoEntrega === 'delivery' ? (this.freteAtual || 0) : 0;
      const total = subtotal + frete;
      const resumo = $('#resumo-pedido-final');
      resumo.innerHTML = `
        <div class="linha"><span>${this.carrinho.reduce((s,i)=>s+i.qtd,0)} itens</span><span>${formatarMoeda(subtotal)}</span></div>
        ${this.tipoEntrega === 'delivery' ? `<div class="linha"><span>Entrega (${escapar(this.bairroAtual?.nome||'')})</span><span>${formatarMoeda(frete)}</span></div>` : `<div class="linha"><span>Retirada no local</span><span>Grátis</span></div>`}
        <div class="linha total"><span>Total</span><span>${formatarMoeda(total)}</span></div>
      `;
      this.totalFinal = total;
    },

    async finalizarPedido(){
      const cfg = Dados.getConfig();
      const nome = this.identificacao?.nome || '';
      const telefone = this.identificacao?.telefone || '';
      const telefoneFormatado = formatarTelefone(telefone);
      const formaPagamento = $('input[name="pagamento"]:checked')?.value || '';
      const trocoPara = formaPagamento === 'dinheiro' ? $('#campo-troco-valor').value.trim() : '';
      const obsGerais = $('#campo-obs-gerais').value.trim();
      const delivery = this.tipoEntrega === 'delivery';
      const erroEl = $('#erro-pedido');
      const btnEnviar = $('#btn-enviar-pedido');
      const mostrarErro = (msg) => { if (erroEl){ erroEl.textContent = msg; erroEl.classList.add('visivel'); } else mostrarToast(msg); };
      if (erroEl) erroEl.classList.remove('visivel');

      if (!formaPagamento){ mostrarErro('Escolha a forma de pagamento (volte uma etapa).'); return; }

      const endereco = delivery ? {
        rua: $('#campo-rua').value.trim(),
        numero: $('#campo-numero').value.trim(),
        complemento: $('#campo-complemento').value.trim(),
        referencia: $('#campo-referencia').value.trim()
      } : null;

      // Manda só O QUE foi pedido. Preço de cada item, frete, custo e baixa de estoque
      // são calculados pelo servidor — o total que aparece abaixo é o dele.
      const payload = {
        cliente: { nome, telefone },
        tipo_entrega: this.tipoEntrega,
        bairro_id: delivery ? (this.bairroAtual?.id || null) : null,
        endereco,
        distancia_km: delivery ? (this.distanciaFreteKm ?? null) : null,
        origem_distancia: delivery ? (this.origemDistanciaFrete || 'estimado') : null,
        forma_pagamento: formaPagamento,
        troco_para: trocoPara,
        observacoes_gerais: obsGerais,
        itens: this.carrinho.map(i => ({ produto_id: i.produtoId, qtd: i.qtd, obs: i.obs || '' }))
      };

      if (btnEnviar){ btnEnviar.disabled = true; btnEnviar.textContent = 'Enviando…'; }
      let resp;
      try{
        resp = await Banco.criarPedido(payload);
      }catch(err){
        console.error('Falha ao criar pedido:', err);
        mostrarErro(err && err.code === '22P02'
          ? 'O cardápio foi atualizado desde que você abriu o site. Recarregue a página e monte o pedido de novo.'
          : Banco.erroAmigavel(err));
        if (btnEnviar){ btnEnviar.disabled = false; btnEnviar.textContent = 'Enviar pedido no WhatsApp 🚀'; }
        return;
      }
      if (btnEnviar){ btnEnviar.disabled = false; btnEnviar.textContent = 'Enviar pedido no WhatsApp 🚀'; }

      const pedido = {
        numero: resp.numero,
        itens: (resp.itens || []).map(i => ({ nome: i.nome, preco: Number(i.preco), qtd: i.qtd, obs: i.obs || '' })),
        subtotal: Number(resp.subtotal), frete: Number(resp.frete), total: Number(resp.total)
      };
      if (this.totalFinal != null && Math.abs(pedido.total - this.totalFinal) > 0.009){
        mostrarToast('Alguns valores foram atualizados pelo estabelecimento. Confira o total do pedido.');
      }

      // atualiza o cadastro em memória (endereço da entrega fica salvo no perfil)
      Banco.cliente.obter(telefone).then(renderizarAreaCliente).catch(() => {});
      localStorage.setItem('espetolivre_ultimo_tel', telefone);

      // monta a mensagem do WhatsApp com os valores CONFIRMADOS pelo servidor
      const linhas = [];
      linhas.push(`*NOVO PEDIDO #${pedido.numero} — ${cfg.nomeLoja}*`);
      linhas.push('');
      linhas.push(`*Cliente:* ${nome}`);
      linhas.push(`*Telefone:* ${telefoneFormatado}`);
      linhas.push('');
      linhas.push('*Itens:*');
      pedido.itens.forEach(i => {
        linhas.push(`• ${i.qtd}x ${i.nome} — ${formatarMoeda(i.preco * i.qtd)}${i.obs ? `  _(obs: ${i.obs})_` : ''}`);
      });
      linhas.push('');
      if (delivery){
        linhas.push('*Entrega:* Delivery');
        linhas.push(`${endereco.rua}, ${endereco.numero}${endereco.complemento ? ' - '+endereco.complemento : ''}`);
        linhas.push(`Bairro: ${this.bairroAtual?.nome || ''}`);
        if (endereco.referencia) linhas.push(`Referência: ${endereco.referencia}`);
      } else {
        linhas.push('*Entrega:* Retirada no local');
      }
      linhas.push('');
      linhas.push(`*Pagamento:* ${rotuloPagamento(formaPagamento)}${trocoPara ? ` (troco para ${formatarMoeda(trocoPara)})` : ''}`);
      if (obsGerais) linhas.push(`*Observações gerais:* ${obsGerais}`);
      linhas.push('');
      linhas.push(`*Subtotal:* ${formatarMoeda(pedido.subtotal)}`);
      if (pedido.frete > 0) linhas.push(`*Frete:* ${formatarMoeda(pedido.frete)}`);
      linhas.push(`*TOTAL: ${formatarMoeda(pedido.total)}*`);

      const mensagem = encodeURIComponent(linhas.join('\n'));
      const linkWhats = `https://wa.me/${cfg.whatsapp}?text=${mensagem}`;

      // tela de confirmação
      $$('.etapa-checkout').forEach(el => el.hidden = true);
      $('#progresso-etapas-wrap').hidden = true;
      const confirmacao = $('#etapa-confirmacao');
      confirmacao.hidden = false;
      $('#numero-pedido-confirmacao').textContent = pedido.numero;
      $('#link-whatsapp-pedido').href = linkWhats;

      // limpa carrinho
      this.carrinho = [];
      this.salvarCarrinhoSessao();
      this.atualizarCarrinhoUI();
      this.sincronizarQtdCardapio();

      window.open(linkWhats, '_blank');
    },

    fecharCheckout(){
      $('#modal-checkout')?.classList.remove('aberto');
      $('#overlay-geral')?.classList.remove('aberto');
    }
  };

  function rotuloPagamento(forma){
    return { pix:'Pix', dinheiro:'Dinheiro', credito:'Cartão de Crédito', debito:'Cartão de Débito' }[forma] || forma;
  }

  function slugify(texto){
    return texto.toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }

  /* ========================================================================
     5.5. PÁGINA: PERFIL DO CLIENTE (pages/perfil.html)
     ======================================================================== */
  const Perfil = {
    identificacao: null,

    iniciar(){
      if (!$('#pagina-perfil')) return;
      const id = obterIdentificacaoAtual();
      if (!id){
        // sem identificação salva, não tem como saber de quem é o perfil
        window.location.href = '../index.html';
        return;
      }
      this.identificacao = id;
      this.renderizarDados();
      this.renderizarHistorico();
      this.ligarEventos();
    },

    ligarEventos(){
      $('#btn-editar-perfil')?.addEventListener('click', () => this.entrarModoEdicao());
      $('#btn-cancelar-edicao-perfil')?.addEventListener('click', () => this.sairModoEdicao());
      $('#form-editar-perfil')?.addEventListener('submit', (e) => this.salvarEdicao(e));
      $('#perfil-campo-telefone')?.addEventListener('input', (e) => {
        e.target.value = formatarTelefone(e.target.value);
      });
    },

    renderizarDados(){
      const id = this.identificacao;
      $('#perfil-nome-exibicao').textContent = id.nome || '—';
      $('#perfil-whatsapp-exibicao').textContent = id.telefone ? formatarTelefone(id.telefone) : '—';
      $('#perfil-email-exibicao').textContent = id.email || 'Não informado';
      const end = id.endereco;
      $('#perfil-endereco-exibicao').textContent = (end && end.rua)
        ? `${end.rua}, ${end.numero}${end.complemento ? ' - ' + end.complemento : ''} — ${end.bairro || ''}${end.referencia ? ' (Ref: ' + end.referencia + ')' : ''}`
        : 'Nenhum endereço salvo ainda.';
    },

    entrarModoEdicao(){
      const id = this.identificacao;
      $('#perfil-campo-nome').value = id.nome || '';
      $('#perfil-campo-telefone').value = id.telefone ? formatarTelefone(id.telefone) : '';
      $('#perfil-campo-email').value = id.email || '';
      const end = id.endereco || {};
      $('#perfil-campo-rua').value = end.rua || '';
      $('#perfil-campo-numero').value = end.numero || '';
      $('#perfil-campo-complemento').value = end.complemento || '';
      $('#perfil-campo-referencia').value = end.referencia || '';

      const bairros = Dados.getBairros().sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const select = $('#perfil-campo-bairro');
      select.innerHTML = '<option value="">Selecione...</option>' +
        bairros.map(b => `<option value="${escapar(b.nome)}" ${b.nome === end.bairro ? 'selected' : ''}>${escapar(b.nome)}</option>`).join('');

      $('#visualizacao-perfil').hidden = true;
      $('#form-editar-perfil').hidden = false;
    },

    sairModoEdicao(){
      $('#visualizacao-perfil').hidden = false;
      $('#form-editar-perfil').hidden = true;
    },

    async salvarEdicao(e){
      e.preventDefault();
      const nome = $('#perfil-campo-nome').value.trim();
      const telefoneNovo = somenteDigitos($('#perfil-campo-telefone').value);
      const email = $('#perfil-campo-email').value.trim();

      if (nome.length < 2){ mostrarToast('Informe um nome válido.'); return; }
      if (telefoneNovo.length < 10){ mostrarToast('Informe um WhatsApp válido com DDD.'); return; }
      if (email && !email.includes('@')){ mostrarToast('Informe um e-mail válido ou deixe em branco.'); return; }

      const endereco = {
        rua: $('#perfil-campo-rua').value.trim(),
        numero: $('#perfil-campo-numero').value.trim(),
        complemento: $('#perfil-campo-complemento').value.trim(),
        bairro: $('#perfil-campo-bairro').value,
        referencia: $('#perfil-campo-referencia').value.trim()
      };

      const telefoneAntigo = this.identificacao.telefone;
      let perfil;
      try{
        perfil = await Banco.cliente.atualizar(telefoneAntigo, nome, telefoneNovo, email, endereco);
      }catch(err){
        mostrarToast(Banco.erroAmigavel(err));
        return;
      }

      localStorage.setItem('espetolivre_identificacao', JSON.stringify({ nome: perfil.nome, telefone: perfil.telefone, email: perfil.email || '' }));
      localStorage.setItem('espetolivre_ultimo_tel', perfil.telefone);

      this.identificacao = obterIdentificacaoAtual();
      this.renderizarDados();
      this.sairModoEdicao();
      renderizarAreaCliente();
      this.renderizarHistorico();
      mostrarToast('Dados atualizados com sucesso!');
    },

    async renderizarHistorico(){
      const telefone = this.identificacao.telefone;
      let pedidos = [];
      try{
        pedidos = await Banco.cliente.pedidos(telefone);
      }catch(err){
        console.error(err);
        mostrarToast('Não foi possível carregar seu histórico agora.');
      }
      pedidos.sort((a,b) => new Date(b.dataHora) - new Date(a.dataHora));

      const vazio = $('#historico-vazio');
      const conteudo = $('#historico-conteudo');

      if (!pedidos.length){
        vazio.hidden = false;
        conteudo.hidden = true;
        return;
      }
      vazio.hidden = true;
      conteudo.hidden = false;

      // itens favoritos (mais pedidos, por quantidade total)
      const contagem = {};
      pedidos.forEach(p => p.itens.forEach(i => { contagem[i.nome] = (contagem[i.nome] || 0) + i.qtd; }));
      const ranking = Object.entries(contagem).sort((a,b) => b[1] - a[1]).slice(0, 5);

      $('#lista-itens-favoritos').innerHTML = ranking.map(([nome, qtd]) => `
        <div class="chip-favorito"><span>${escapar(nome)}</span><strong>${qtd}x</strong></div>
      `).join('');

      const produtos = Dados.getProdutos();
      const sugestao = gerarSugestaoPersonalizada(pedidos, produtos);
      $('#bloco-sugestao').hidden = !sugestao;
      if (sugestao) $('#texto-sugestao').textContent = sugestao;

      $('#lista-historico-pedidos').innerHTML = pedidos.slice(0, 15).map(p => `
        <div class="item-historico-pedido">
          <div class="linha-topo-historico">
            <strong>Pedido #${p.numero}</strong>
            <span class="selo-status ${p.status}">${rotuloStatus(p.status)}</span>
          </div>
          <div class="meta-historico">${new Date(p.dataHora).toLocaleString('pt-BR')} • ${p.tipoEntrega === 'delivery' ? '🛵 Delivery' : '🏠 Retirada'} • ${formatarMoeda(p.total)}</div>
          <div class="itens-historico">${p.itens.map(i => `${i.qtd}x ${escapar(i.nome)}`).join(', ')}</div>
        </div>
      `).join('');
    }
  };

  /* ========================================================================
     6. PÁGINA: ADMIN (pages/admin.html)
     ======================================================================== */
  const Admin = {
    abaAtual: 'painel',
    filtroStatusPedido: 'todos',
    editandoProdutoId: null,
    editandoBairroId: null,
    fotoProdutoAtual: null,
    formProdutoLigado: false,
    periodoReceita: '7dias',
    produtoFichaSelecionado: null,
    editandoInsumoId: null,
    editandoFuncionarioId: null,
    formInsumoLigado: false,
    formFichaLigado: false,
    formFuncionarioLigado: false,
    formEntregaLigado: false,
    receitaSubNavLigado: false,
    esteiraLigada: false,
    graficoEvolucao: null,
    graficoProdutos: null,
    sessao: null,
    fotoFuncionarioAtual: null,

    async iniciar(){
      if (!$('#app-admin')) return;
      this.ligarLogin();
      const sessao = await Banco.auth.sessaoAtual();
      if (sessao){
        this.sessao = sessao;
        try{
          await this.entrar();
        }catch(err){
          console.error(err);
          mostrarToast('Não foi possível carregar o painel: ' + Banco.erroAmigavel(err));
        }
      }
    },

    ligarLogin(){
      const form = $('#form-login-admin');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const erroEl = $('#erro-login-admin');
        const btn = $('button[type="submit"]', form);
        erroEl.classList.remove('visivel');
        if (btn) btn.disabled = true;
        try{
          this.sessao = await Banco.auth.entrar($('#campo-email-admin').value.trim(), $('#campo-senha-admin').value);
          await this.entrar();
        }catch(err){
          erroEl.textContent = err.credenciais ? 'E-mail ou senha incorretos. Tente novamente.' : Banco.erroAmigavel(err);
          erroEl.classList.add('visivel');
        }finally{
          if (btn) btn.disabled = false;
        }
      });
    },

    async entrar(){
      await Banco.carregarEquipe(this.sessao.perfil); // pedidos (e, p/ gestor/admin, insumos, fichas, entregadores, funcionários)
      $('.tela-login-admin').style.display = 'none';
      $('#app-admin').classList.add('visivel');
      this.ligarNavegacao();
      this.ligarSair();
      this.ligarModalAutorizacao();
      this.aplicarPermissoesNav();
      this.renderizarTudo();
      this.renderizarConfiguracoes();
      this.mostrarAba(this.sessao?.perfil === 'funcionario' ? 'esteira' : 'painel');
      // a esteira e o painel se atualizam sozinhos quando chega/muda um pedido (Realtime)
      Banco.assinarPedidos((tipo) => this.aoMudarPedidos(tipo));
    },

    renderizarTudo(){
      this.renderizarPainel();
      this.renderizarEsteira();
      this.renderizarCardapio();
      this.renderizarPedidos();
      this.renderizarEntrega();
      this.renderizarReceita();
      this.renderizarFuncionarios();
    },

    // chamada quando uma gravação falha: o cache já foi refeito a partir do banco, então redesenha as telas
    recarregarTela(){
      if (!this.sessao) return;
      this.renderizarTudo();
      if (this.abaAtual === 'receita') this.renderizarReceitaPainel();
    },

    aoMudarPedidos(tipo){
      this.renderizarPainel();
      if ($('#quadro-esteira')) this.renderizarQuadroEsteira();
      this.renderizarPedidos();
      if (this.abaAtual === 'receita') this.renderizarReceitaPainel();
      if (tipo === 'INSERT') mostrarToast('🔔 Novo pedido recebido!');
    },

    /* Funcionário só vê a Esteira de Pedidos. Gestor e Admin veem tudo, mas só
       Gestor/Admin acessam o cadastro de Funcionários. */
    aplicarPermissoesNav(){
      const perfil = this.sessao?.perfil;
      const somenteEsteira = perfil === 'funcionario';
      $$('.lateral-admin nav button').forEach(btn => {
        const aba = btn.dataset.aba;
        if (somenteEsteira){
          btn.hidden = aba !== 'esteira';
        } else if (aba === 'funcionarios'){
          btn.hidden = !(perfil === 'gestor' || perfil === 'admin');
        } else {
          btn.hidden = false;
        }
      });
      const nomeEl = $('#nome-usuario-admin');
      if (nomeEl && this.sessao) nomeEl.textContent = `${this.sessao.nome} · ${rotuloPerfil(this.sessao.perfil)}`;
    },

    ligarSair(){
      $('#btn-sair-admin')?.addEventListener('click', async () => {
        await Banco.auth.sair();
        window.location.reload();
      });
    },

    ligarNavegacao(){
      $$('.lateral-admin nav button').forEach(btn => {
        btn.addEventListener('click', () => this.mostrarAba(btn.dataset.aba));
      });
    },

    mostrarAba(aba){
      this.abaAtual = aba;
      $$('.lateral-admin nav button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
      $$('.secao-admin').forEach(s => s.classList.toggle('ativa', s.dataset.secao === aba));
      // os gráficos da Receita são criados com o canvas ainda escondido (display:none)
      // e ficam com tamanho zero — recria-los aqui, já com a aba visível, resolve isso.
      if (aba === 'receita') this.renderizarReceitaPainel();
      if (aba === 'esteira') this.renderizarEsteira();
    },

    /* ---- Painel (métricas rápidas) ---- */
    renderizarPainel(){
      const pedidos = Dados.getPedidos();
      const produtos = Dados.getProdutos();
      const hoje = new Date().toDateString();
      const pedidosHoje = pedidos.filter(p => new Date(p.dataHora).toDateString() === hoje);
      const totalHoje = pedidosHoje.reduce((s,p)=>s+p.total,0);
      const novos = pedidos.filter(p => p.status === 'novo').length;

      $('#metrica-pedidos-hoje').textContent = pedidosHoje.length;
      $('#metrica-faturamento-hoje').textContent = formatarMoeda(totalHoje);
      $('#metrica-pedidos-novos').textContent = novos;
      $('#metrica-produtos-ativos').textContent = produtos.filter(p=>p.disponivel).length + ' / ' + produtos.length;

      const listaRecentes = $('#lista-pedidos-recentes');
      if (listaRecentes){
        const recentes = pedidos.slice(0,5);
        listaRecentes.innerHTML = recentes.length ? recentes.map(p => this.linhaPedidoResumo(p)).join('') :
          `<tr><td colspan="5"><div class="vazio-admin">Nenhum pedido ainda.</div></td></tr>`;
      }
    },

    linhaPedidoResumo(p){
      return `<tr>
        <td>#${p.numero}</td>
        <td>${escapar(p.cliente.nome)}</td>
        <td>${p.itens.reduce((s,i)=>s+i.qtd,0)} itens</td>
        <td>${formatarMoeda(p.total)}</td>
        <td><span class="selo-status ${p.status}">${rotuloStatus(p.status)}</span></td>
      </tr>`;
    },

    /* ---- Cardápio (CRUD) ---- */
    renderizarCardapio(){
      const tbody = $('#tabela-produtos-corpo');
      if (!tbody) return;
      const busca = ($('#busca-produto')?.value || '').toLowerCase();
      let produtos = Dados.getProdutos();
      if (busca) produtos = produtos.filter(p => p.nome.toLowerCase().includes(busca) || p.categoria.toLowerCase().includes(busca));

      tbody.innerHTML = produtos.length ? produtos.map(p => `
        <tr data-id="${p.id}">
          <td>${p.foto ? `<img class="foto-mini" src="${p.foto}" alt="">` : `<span class="emoji-mini">${p.emoji || '🍢'}</span>`}</td>
          <td><strong>${escapar(p.nome)}</strong><br><span style="color:var(--fumaca);font-size:.78rem">${escapar(p.descricao||'')}</span></td>
          <td>${escapar(p.categoria)}</td>
          <td>${formatarMoeda(p.preco)}</td>
          <td>
            <label class="chave-valor">
              <input type="checkbox" class="toggle-disponivel" data-id="${p.id}" ${p.disponivel ? 'checked' : ''}>
              <span class="interruptor"></span>
            </label>
          </td>
          <td class="acoes-linha">
            <button class="btn-editar-produto" data-id="${p.id}">Editar</button>
            <button class="excluir btn-excluir-produto" data-id="${p.id}">Excluir</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="6"><div class="vazio-admin"><div class="icone">🍢</div>Nenhum produto encontrado.</div></td></tr>`;

      $$('.toggle-disponivel', tbody).forEach(chk => chk.addEventListener('change', () => {
        const novoValor = chk.checked;
        chk.checked = !novoValor; // volta ao estado anterior até a autorização ser confirmada
        this.executarComAutorizacao('Alterar a disponibilidade de um produto.', async () => {
          const lista = Dados.getProdutos();
          const item = lista.find(p => p.id === chk.dataset.id);
          if (!item) return;
          item.disponivel = novoValor;
          const salvou = await Dados.salvarProdutos(lista);
          this.renderizarPainel(); this.renderizarCardapio();
          if (salvou) mostrarToast(item.disponivel ? 'Produto disponível' : 'Produto marcado como indisponível');
        });
      }));
      $$('.btn-editar-produto', tbody).forEach(btn => btn.addEventListener('click', () => this.abrirFormProduto(btn.dataset.id)));
      $$('.btn-excluir-produto', tbody).forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Excluir este produto do cardápio?')) return;
        this.executarComAutorizacao('Excluir um produto do cardápio.', async () => {
          const produto = Dados.getProdutos().find(p => p.id === btn.dataset.id);
          const lista = Dados.getProdutos().filter(p => p.id !== btn.dataset.id);
          const salvou = await Dados.salvarProdutos(lista);
          this.renderizarCardapio(); this.renderizarPainel();
          if (salvou){
            if (produto?.foto) Banco.imagens.remover('produtos', produto.foto); // limpeza do arquivo (não bloqueia)
            mostrarToast('Produto excluído.');
          }
        });
      }));

      // liga os listeners estáticos do formulário só uma vez (renderizarCardapio
      // é chamada de novo a cada salvar/excluir, e esses elementos não são recriados)
      if (!this.formProdutoLigado){
        this.formProdutoLigado = true;
        $('#busca-produto')?.addEventListener('input', () => this.renderizarCardapio());
        $('#btn-novo-produto')?.addEventListener('click', () => this.abrirFormProduto(null));
        $('#form-produto')?.addEventListener('submit', (e) => this.salvarFormProduto(e));
        $('#btn-cancelar-produto')?.addEventListener('click', () => this.fecharFormProduto());

        $('#campo-produto-foto')?.addEventListener('change', async (e) => {
          const arquivo = e.target.files[0];
          if (!arquivo) return;
          if (arquivo.size > 8 * 1024 * 1024){
            mostrarToast('Imagem muito grande. Escolha um arquivo de até 8MB.');
            e.target.value = '';
            return;
          }
          try{
            const dataUrl = await redimensionarImagemParaDataURL(arquivo, 480, 0.72);
            this.fotoProdutoAtual = dataUrl;
            $('#preview-foto-produto-img').src = dataUrl;
            $('#preview-foto-produto').hidden = false;
          }catch(err){
            mostrarToast('Não foi possível processar essa imagem. Tente outro arquivo.');
          }
          e.target.value = '';
        });

        $('#btn-remover-foto-produto')?.addEventListener('click', () => {
          this.fotoProdutoAtual = null;
          $('#preview-foto-produto').hidden = true;
          $('#preview-foto-produto-img').src = '';
        });

        $('#btn-add-ficha-produto-form')?.addEventListener('click', () => {
          const insumoId = $('#campo-produto-ficha-insumo').value;
          const quantidade = parseFloat($('#campo-produto-ficha-quantidade').value);
          if (!insumoId || !(quantidade > 0)){ mostrarToast('Selecione o insumo e informe uma quantidade válida.'); return; }
          const existente = this.fichaTemporariaProduto.find(item => item.insumoId === insumoId);
          if (existente){ existente.quantidade = quantidade; }
          else { this.fichaTemporariaProduto.push({ insumoId, quantidade }); }
          $('#campo-produto-ficha-insumo').value = '';
          $('#campo-produto-ficha-quantidade').value = '';
          this.renderizarFichaProdutoForm();
        });

        $('#campo-produto-preco')?.addEventListener('input', () => this.renderizarFichaProdutoForm());
      }
    },

    abrirFormProduto(id){
      this.editandoProdutoId = id;
      const painel = $('#painel-form-produto');
      painel.hidden = false;
      painel.scrollIntoView({ behavior:'smooth', block:'center' });
      const categorias = [...new Set(Dados.getProdutos().map(p=>p.categoria))];
      const datalist = $('#lista-categorias-existentes');
      if (datalist) datalist.innerHTML = categorias.map(c=>`<option value="${escapar(c)}">`).join('');

      $('#campo-produto-foto').value = '';

      const selectInsumo = $('#campo-produto-ficha-insumo');
      const insumos = Dados.getInsumos().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      selectInsumo.innerHTML = '<option value="">Selecione...</option>' +
        insumos.map(i => `<option value="${i.id}">${escapar(i.nome)} (${i.unidade})</option>`).join('');

      if (id){
        const p = Dados.getProdutos().find(x=>x.id===id);
        $('#titulo-form-produto').textContent = 'Editar produto';
        $('#campo-produto-nome').value = p.nome;
        $('#campo-produto-categoria').value = p.categoria;
        $('#campo-produto-preco').value = p.preco;
        $('#campo-produto-descricao').value = p.descricao || '';
        $('#campo-produto-emoji').value = p.emoji || '';
        $('#campo-produto-disponivel').checked = p.disponivel;
        this.fotoProdutoAtual = p.foto || null;
        this.fichaTemporariaProduto = JSON.parse(JSON.stringify(Dados.getFichasTecnicas()[id] || []));
      } else {
        $('#titulo-form-produto').textContent = 'Novo produto';
        $('#form-produto').reset();
        $('#campo-produto-disponivel').checked = true;
        this.fotoProdutoAtual = null;
        this.fichaTemporariaProduto = [];
      }

      if (this.fotoProdutoAtual){
        $('#preview-foto-produto-img').src = this.fotoProdutoAtual;
        $('#preview-foto-produto').hidden = false;
      } else {
        $('#preview-foto-produto').hidden = true;
        $('#preview-foto-produto-img').src = '';
      }

      this.renderizarFichaProdutoForm();
    },
    fecharFormProduto(){
      $('#painel-form-produto').hidden = true;
      this.editandoProdutoId = null;
      this.fotoProdutoAtual = null;
      this.fichaTemporariaProduto = [];
    },

    renderizarFichaProdutoForm(){
      const lista = $('#lista-ficha-produto-form');
      if (!lista) return;
      const insumos = Dados.getInsumos();
      const mapaInsumos = {}; insumos.forEach(i => { mapaInsumos[i.id] = i; });
      const itens = this.fichaTemporariaProduto || [];

      lista.innerHTML = itens.length ? itens.map((item, idx) => {
        const insumo = mapaInsumos[item.insumoId];
        const custoItem = insumo ? insumo.custoUnidade * item.quantidade : 0;
        return `
          <div class="linha-ficha-item">
            <span class="nome-insumo-ficha">${insumo ? escapar(insumo.nome) : '(insumo removido)'}</span>
            <span class="qtd-insumo-ficha">${formatarNumero(item.quantidade)} ${insumo ? insumo.unidade : ''}</span>
            <span class="custo-insumo-ficha">${formatarMoeda(custoItem)}</span>
            <button type="button" class="remover-item-ficha" data-idx="${idx}" aria-label="Remover">✕</button>
          </div>`;
      }).join('') : `<p class="ajuda">Nenhum insumo adicionado ainda.</p>`;

      $$('.remover-item-ficha', lista).forEach(btn => btn.addEventListener('click', () => {
        this.fichaTemporariaProduto.splice(Number(btn.dataset.idx), 1);
        this.renderizarFichaProdutoForm();
      }));

      const custoTotal = itens.reduce((soma, item) => {
        const insumo = mapaInsumos[item.insumoId];
        return soma + (insumo ? insumo.custoUnidade * item.quantidade : 0);
      }, 0);
      const preco = parseFloat($('#campo-produto-preco').value) || 0;
      const resumo = $('#resumo-custo-produto-form');
      if (itens.length){
        resumo.hidden = false;
        $('#preview-custo-produto-form').textContent = formatarMoeda(custoTotal);
        const margemEl = $('#preview-margem-produto-form');
        if (preco > 0){
          const margemReais = preco - custoTotal;
          margemEl.textContent = `${formatarMoeda(margemReais)} (${formatarNumero((margemReais/preco)*100)}%)`;
        } else {
          margemEl.textContent = '—';
        }
      } else {
        resumo.hidden = true;
      }
    },

    salvarFormProduto(e){
      e.preventDefault();
      const dados = {
        nome: $('#campo-produto-nome').value.trim(),
        categoria: $('#campo-produto-categoria').value.trim() || 'Outros',
        preco: parseFloat($('#campo-produto-preco').value) || 0,
        descricao: $('#campo-produto-descricao').value.trim(),
        emoji: $('#campo-produto-emoji').value.trim() || '🍢',
        foto: this.fotoProdutoAtual || null,
        disponivel: $('#campo-produto-disponivel').checked
      };
      if (!dados.nome || dados.preco <= 0){
        mostrarToast('Preencha nome e um preço válido.');
        return;
      }
      this.executarComAutorizacao('Salvar alterações no cardápio.', async () => {
        const lista = Dados.getProdutos();
        const editandoId = this.editandoProdutoId;
        const antigo = editandoId ? lista.find(p => p.id === editandoId) : null;
        const fotoAntiga = antigo ? antigo.foto : null;

        // foto nova (data URL) sobe para o Storage e o produto guarda só a URL pública
        if (dados.foto && dados.foto.startsWith('data:')){
          try{
            dados.foto = (await Banco.imagens.enviar('produtos', dados.foto, 'produtos')).url;
          }catch(err){
            mostrarToast('Não foi possível enviar a foto: ' + Banco.erroAmigavel(err));
            return;
          }
        }

        let produtoId;
        if (antigo){
          Object.assign(antigo, dados);
          produtoId = editandoId;
        } else {
          produtoId = gerarId();
          lista.push(Object.assign({ id: produtoId }, dados));
        }
        const salvouProduto = await Dados.salvarProdutos(lista);
        if (!salvouProduto){ this.renderizarCardapio(); return; }

        // salva a ficha técnica (insumos + quantidades) associada a este produto —
        // é isso que faz o custo e a margem de lucro serem calculados sozinhos
        const fichas = Dados.getFichasTecnicas();
        if (this.fichaTemporariaProduto && this.fichaTemporariaProduto.length){
          fichas[produtoId] = this.fichaTemporariaProduto;
        } else {
          delete fichas[produtoId];
        }
        await Dados.salvarFichasTecnicas(fichas);

        if (fotoAntiga && fotoAntiga !== dados.foto) Banco.imagens.remover('produtos', fotoAntiga);

        this.fecharFormProduto();
        this.renderizarCardapio();
        this.renderizarPainel();
        mostrarToast('Cardápio atualizado!');
      });
    },

    /* ---- Pedidos ---- */
    renderizarPedidos(){
      const tbody = $('#tabela-pedidos-corpo');
      if (!tbody) return;
      let pedidos = Dados.getPedidos();
      if (this.filtroStatusPedido !== 'todos') pedidos = pedidos.filter(p=>p.status===this.filtroStatusPedido);

      tbody.innerHTML = pedidos.length ? pedidos.map(p => `
        <tr>
          <td>
            <strong>#${p.numero}</strong><br>
            <span style="color:var(--fumaca);font-size:.78rem">${new Date(p.dataHora).toLocaleString('pt-BR')}</span>
          </td>
          <td>${escapar(p.cliente.nome)}<br><span style="color:var(--fumaca);font-size:.78rem">${escapar(formatarTelefone(p.cliente.telefone))}</span></td>
          <td>${p.tipoEntrega === 'delivery' ? '🛵 Delivery' : '🏠 Retirada'}</td>
          <td>${formatarMoeda(p.total)}</td>
          <td>
            <select class="select-status-pedido" data-id="${p.id}">
              ${['novo','preparando','pronto','entregue','cancelado'].map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${rotuloStatus(s)}</option>`).join('')}
            </select>
          </td>
          <td class="acoes-linha"><button class="btn-ver-pedido" data-id="${p.id}">Detalhes</button></td>
        </tr>
        <tr class="linha-detalhe" data-detalhe-de="${p.id}" hidden><td colspan="6">${this.detalhePedidoHtml(p)}</td></tr>
      `).join('') : `<tr><td colspan="6"><div class="vazio-admin"><div class="icone">📋</div>Nenhum pedido por aqui ainda.</div></td></tr>`;

      $$('.select-status-pedido', tbody).forEach(sel => sel.addEventListener('change', async () => {
        const pedido = Dados.getPedidos().find(p => p.id === sel.dataset.id);
        try{
          await Banco.atualizarStatusPedido(sel.dataset.id, sel.value);
          this.renderizarPainel();
          mostrarToast('Status do pedido #' + (pedido ? pedido.numero : '') + ' atualizado.');
        }catch(err){
          mostrarToast(Banco.erroAmigavel(err));
          this.renderizarPedidos();
        }
      }));
      $$('.btn-ver-pedido', tbody).forEach(btn => btn.addEventListener('click', () => {
        const linha = $(`.linha-detalhe[data-detalhe-de="${btn.dataset.id}"]`);
        if (linha) linha.hidden = !linha.hidden;
      }));

      // os chips de filtro não são recriados; liga uma vez só (esta tela é redesenhada a cada pedido novo)
      if (!this.filtrosPedidosLigados){
        this.filtrosPedidosLigados = true;
        $$('.filtros-chip button').forEach(btn => btn.addEventListener('click', () => {
          $$('.filtros-chip button').forEach(b=>b.classList.remove('ativa'));
          btn.classList.add('ativa');
          this.filtroStatusPedido = btn.dataset.status;
          this.renderizarPedidos();
        }));
      }
    },

    detalhePedidoHtml(p){
      const itensHtml = p.itens.map(i => `${i.qtd}x ${escapar(i.nome)}${i.obs ? ` <em>(obs: ${escapar(i.obs)})</em>` : ''}`).join('<br>');
      const enderecoHtml = p.tipoEntrega === 'delivery' && p.endereco ?
        `<strong>Endereço:</strong> ${escapar(p.endereco.rua)}, ${escapar(p.endereco.numero)} ${escapar(p.endereco.complemento||'')} — ${escapar(p.endereco.bairro)}${p.endereco.referencia ? ' (Ref: '+escapar(p.endereco.referencia)+')' : ''}<br>` : '';
      return `<div class="detalhe-pedido">
        <strong>Itens:</strong><br>${itensHtml}<br><br>
        ${enderecoHtml}
        <strong>Pagamento:</strong> ${rotuloPagamento(p.pagamento.forma)}${p.pagamento.trocoPara ? ' (troco para R$ '+escapar(p.pagamento.trocoPara)+')' : ''}<br>
        ${p.observacoesGerais ? `<strong>Obs. gerais:</strong> ${escapar(p.observacoesGerais)}<br>` : ''}
        <strong>Subtotal:</strong> ${formatarMoeda(p.subtotal)} ${p.frete ? ' + Frete: ' + formatarMoeda(p.frete) : ''}
      </div>`;
    },

    /* ---- Entrega (bairros + parâmetros de frete) ---- */
    atualizarSeloGoogleMaps(cfg){
      const selo = $('#selo-google-maps-status');
      if (!selo) return;
      const ativo = !!(cfg.googleMapsApiKey && cfg.enderecoLat != null && cfg.enderecoLng != null);
      selo.textContent = ativo ? 'ativo' : 'opcional';
      selo.className = 'selo-status ' + (ativo ? 'disponivel' : 'preparando');
    },

    renderizarEntrega(){
      const tbody = $('#tabela-bairros-corpo');
      if (!tbody) return;
      const cfg = Dados.getConfig();
      const bairros = Dados.getBairros().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));

      tbody.innerHTML = bairros.map(b => `
        <tr data-id="${b.id}">
          <td>${escapar(b.nome)}</td>
          <td>${b.distanciaKm} km</td>
          <td>${formatarMoeda(calcularFrete(b.distanciaKm, cfg))}</td>
          <td class="acoes-linha">
            <button class="btn-editar-bairro" data-id="${b.id}">Editar</button>
            <button class="excluir btn-excluir-bairro" data-id="${b.id}">Excluir</button>
          </td>
        </tr>`).join('');

      $$('.btn-editar-bairro', tbody).forEach(btn => btn.addEventListener('click', () => this.abrirFormBairro(btn.dataset.id)));
      $$('.btn-excluir-bairro', tbody).forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Remover este bairro da área de entrega?')) return;
        this.executarComAutorizacao('Remover um bairro da área de entrega.', async () => {
          const salvou = await Dados.salvarBairros(Dados.getBairros().filter(b=>b.id!==btn.dataset.id));
          this.renderizarEntrega();
          if (salvou) mostrarToast('Bairro removido.');
        });
      }));

      $('#campo-preco-gasolina').value = cfg.precoGasolina;
      $('#campo-consumo-km').value = cfg.consumoKmLitro;
      $('#campo-taxa-base').value = cfg.taxaBaseEntrega;
      $('#campo-google-maps-key').value = cfg.googleMapsApiKey || '';
      this.atualizarSeloGoogleMaps(cfg);

      // liga os formulários estáticos desta aba só uma vez — renderizarEntrega()
      // é chamada de novo a cada salvar/excluir bairro, e esses elementos não
      // são recriados (ficariam com listeners duplicados a cada salvamento)
      if (!this.formEntregaLigado){
        this.formEntregaLigado = true;

        $('#form-parametros-frete')?.addEventListener('submit', (e) => {
          e.preventDefault();
          const precoGasolina = parseFloat($('#campo-preco-gasolina').value) || 0;
          const consumoKmLitro = parseFloat($('#campo-consumo-km').value) || 1;
          const taxaBaseEntrega = parseFloat($('#campo-taxa-base').value) || 0;
          this.executarComAutorizacao('Alterar os parâmetros de cálculo do frete.', async () => {
            const cfgAtual = Dados.getConfig();
            cfgAtual.precoGasolina = precoGasolina;
            cfgAtual.consumoKmLitro = consumoKmLitro;
            cfgAtual.taxaBaseEntrega = taxaBaseEntrega;
            const salvou = await Dados.salvarConfig(cfgAtual);
            this.renderizarEntrega();
            if (salvou) mostrarToast('Parâmetros de frete atualizados!');
          });
        });

        $('#form-google-maps')?.addEventListener('submit', (e) => {
          e.preventDefault();
          const chave = $('#campo-google-maps-key').value.trim();
          this.executarComAutorizacao('Alterar a chave de API do Google Maps.', async () => {
            const cfgAtual = Dados.getConfig();
            cfgAtual.googleMapsApiKey = chave;
            const salvou = await Dados.salvarConfig(cfgAtual);
            this.atualizarSeloGoogleMaps(Dados.getConfig());
            if (salvou) mostrarToast(chave ? 'Chave salva! O frete vai tentar usar a distância real do Google Maps a partir de agora.' : 'Chave removida — o frete volta a usar a distância estimada por bairro.');
          });
        });

        $('#btn-novo-bairro')?.addEventListener('click', () => this.abrirFormBairro(null));
        $('#form-bairro')?.addEventListener('submit', (e) => this.salvarFormBairro(e));
        $('#btn-cancelar-bairro')?.addEventListener('click', () => { $('#painel-form-bairro').hidden = true; });
      }

      this.renderizarEntregadores();
    },

    abrirFormBairro(id){
      this.editandoBairroId = id;
      $('#painel-form-bairro').hidden = false;
      $('#painel-form-bairro').scrollIntoView({ behavior:'smooth', block:'center' });
      if (id){
        const b = Dados.getBairros().find(x=>x.id===id);
        $('#campo-bairro-nome').value = b.nome;
        $('#campo-bairro-distancia').value = b.distanciaKm;
      } else {
        $('#form-bairro').reset();
      }
    },
    salvarFormBairro(e){
      e.preventDefault();
      const nome = $('#campo-bairro-nome').value.trim();
      const distanciaKm = parseFloat($('#campo-bairro-distancia').value);
      if (!nome || !(distanciaKm > 0)){ mostrarToast('Informe o bairro e uma distância válida.'); return; }
      this.executarComAutorizacao('Salvar um bairro da área de entrega.', async () => {
        const lista = Dados.getBairros();
        if (this.editandoBairroId){
          const item = lista.find(b=>b.id===this.editandoBairroId);
          item.nome = nome; item.distanciaKm = distanciaKm;
        } else {
          lista.push({ id: gerarId(), nome, distanciaKm });
        }
        const salvou = await Dados.salvarBairros(lista);
        if (salvou) $('#painel-form-bairro').hidden = true;
        this.renderizarEntrega();
        if (salvou) mostrarToast('Bairro salvo!');
      });
    },

    /* ==== RECEITA ==== */
    renderizarReceita(){
      if (!$('#metrica-receita-faturamento')) return;

      if (!this.receitaSubNavLigado){
        this.receitaSubNavLigado = true;
        $$('.receita-subnav-btn').forEach(btn => btn.addEventListener('click', () => {
          $$('.receita-subnav-btn').forEach(b => b.classList.toggle('ativa', b === btn));
          $$('.receita-subsecao').forEach(s => s.classList.toggle('ativa', s.dataset.subsecao === btn.dataset.subaba));
        }));
        $$('#filtro-periodo-receita button').forEach(btn => btn.addEventListener('click', () => {
          $$('#filtro-periodo-receita button').forEach(b => b.classList.remove('ativa'));
          btn.classList.add('ativa');
          this.periodoReceita = btn.dataset.periodo;
          this.renderizarReceitaPainel();
        }));
      }

      this.renderizarReceitaPainel();
      this.renderizarInsumos();
      this.renderizarFichasTecnicas();
    },

    obterIntervaloPeriodo(periodo){
      const agora = new Date();
      const fim = new Date(agora); fim.setHours(23,59,59,999);
      let inicio;
      if (periodo === 'hoje'){
        inicio = new Date(agora); inicio.setHours(0,0,0,0);
      } else if (periodo === '30dias'){
        inicio = new Date(agora); inicio.setDate(inicio.getDate()-29); inicio.setHours(0,0,0,0);
      } else if (periodo === 'mes'){
        inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
      } else if (periodo === 'tudo'){
        inicio = new Date(2000,0,1);
      } else { // 7dias (padrão)
        inicio = new Date(agora); inicio.setDate(inicio.getDate()-6); inicio.setHours(0,0,0,0);
      }
      return { inicio, fim };
    },

    calcularDadosReceita(pedidos){
      const porDia = {};
      const porProduto = {};
      let faturamentoTotal = 0;
      let custoTotalConhecido = 0;
      let temCustoDesconhecido = false;

      // detalhamento específico da receita de entrega (frete)
      let receitaFreteTotal = 0;         // total cobrado do cliente como frete
      let repasseEntregadoresTotal = 0;  // total repassado aos entregadores (taxa fixa)
      let temTaxaEntregadorDesconhecida = false; // pedidos antigos, anteriores a esse controle
      let qtdEntregas = 0;

      // estornos: o dinheiro volta pro cliente na maquininha (fora do nosso controle).
      // Pedidos estornados são contados só aqui — não entram no faturamento/custo/lucro
      // normal, pra não inflar (nem inconsistir) os outros números do painel.
      let valorEstornadoTotal = 0;
      let qtdEstornos = 0;

      pedidos.forEach(p => {
        if (p.estornado){
          valorEstornadoTotal += p.valorEstornado != null ? p.valorEstornado : p.total;
          qtdEstornos += 1;
          return; // não conta no faturamento/custo/lucro normal — só no indicador de estorno
        }

        const diaChave = chaveDiaLocal(p.dataHora);
        if (!porDia[diaChave]) porDia[diaChave] = { faturamento:0, custo:0, lucro:0 };

        p.itens.forEach(item => {
          const fat = item.preco * item.qtd;
          faturamentoTotal += fat;
          porDia[diaChave].faturamento += fat;

          let custoItem = 0;
          if (item.custoUnitario != null){
            custoItem = item.custoUnitario * item.qtd;
            custoTotalConhecido += custoItem;
            porDia[diaChave].custo += custoItem;
          } else {
            temCustoDesconhecido = true;
          }

          if (!porProduto[item.nome]) porProduto[item.nome] = { nome:item.nome, qtd:0, faturamento:0, custo:0, custoDesconhecido:false };
          porProduto[item.nome].qtd += item.qtd;
          porProduto[item.nome].faturamento += fat;
          if (item.custoUnitario != null){
            porProduto[item.nome].custo += custoItem;
          } else {
            porProduto[item.nome].custoDesconhecido = true;
          }
        });

        if (p.frete){
          faturamentoTotal += p.frete;
          porDia[diaChave].faturamento += p.frete;
          qtdEntregas += 1;
          receitaFreteTotal += p.frete;

          if (p.taxaEntregador != null){
            repasseEntregadoresTotal += p.taxaEntregador;
            custoTotalConhecido += p.taxaEntregador;
            porDia[diaChave].custo += p.taxaEntregador;
          } else {
            temTaxaEntregadorDesconhecida = true; // pedido feito antes desse controle existir
          }
        }
        porDia[diaChave].lucro = porDia[diaChave].faturamento - porDia[diaChave].custo;
      });

      const lucroTotal = faturamentoTotal - custoTotalConhecido;
      const margemMedia = faturamentoTotal > 0 ? (lucroTotal / faturamentoTotal) * 100 : null;
      const receitaFreteLiquida = receitaFreteTotal - repasseEntregadoresTotal;

      const ranking = Object.values(porProduto).map(p => {
        const lucro = p.faturamento - p.custo;
        return Object.assign({}, p, { lucro, margem: p.faturamento > 0 ? (lucro / p.faturamento) * 100 : null });
      }).sort((a,b) => b.lucro - a.lucro);

      return {
        porDia, porProduto: ranking, faturamentoTotal, custoTotalConhecido, lucroTotal, margemMedia, temCustoDesconhecido,
        entrega: {
          qtdEntregas, receitaFreteTotal, repasseEntregadoresTotal, receitaFreteLiquida, temTaxaEntregadorDesconhecida
        },
        estornos: { qtdEstornos, valorEstornadoTotal }
      };
    },

    renderizarReceitaPainel(){
      const { inicio, fim } = this.obterIntervaloPeriodo(this.periodoReceita);
      const pedidos = Dados.getPedidos().filter(p => {
        // cancelamento comum (nunca virou venda) não entra em nada financeiro;
        // já um pedido estornado precisa entrar, pra aparecer no indicador de estorno
        if (p.status === 'cancelado' && !p.estornado) return false;
        const d = new Date(p.dataHora);
        return d >= inicio && d <= fim;
      });

      const dados = this.calcularDadosReceita(pedidos);

      $('#metrica-receita-faturamento').textContent = formatarMoeda(dados.faturamentoTotal);
      $('#metrica-receita-custo').textContent = formatarMoeda(dados.custoTotalConhecido);
      $('#metrica-receita-lucro').textContent = formatarMoeda(dados.lucroTotal);
      $('#metrica-receita-margem').textContent = dados.margemMedia != null ? formatarNumero(dados.margemMedia) + '%' : '—';
      $('#aviso-custo-incompleto').hidden = !dados.temCustoDesconhecido;

      $('#metrica-entrega-qtd').textContent = dados.entrega.qtdEntregas;
      $('#metrica-entrega-bruta').textContent = formatarMoeda(dados.entrega.receitaFreteTotal);
      $('#metrica-entrega-repasse').textContent = formatarMoeda(dados.entrega.repasseEntregadoresTotal);
      $('#metrica-entrega-liquida').textContent = formatarMoeda(dados.entrega.receitaFreteLiquida);
      $('#aviso-taxa-entregador-incompleta').hidden = !dados.entrega.temTaxaEntregadorDesconhecida;

      $('#metrica-estornos-qtd').textContent = dados.estornos.qtdEstornos;
      $('#metrica-estornos-valor').textContent = formatarMoeda(dados.estornos.valorEstornadoTotal);

      const diasOrdenados = Object.keys(dados.porDia).sort();
      this.renderizarGraficoEvolucao(diasOrdenados, dados.porDia);
      this.renderizarGraficoProdutos(dados.porProduto);

      const tbody = $('#tabela-receita-produtos-corpo');
      tbody.innerHTML = dados.porProduto.length ? dados.porProduto.map(p => `
        <tr>
          <td>${escapar(p.nome)}${p.custoDesconhecido ? ' <span title="Ficha técnica incompleta" style="color:var(--alerta)">⚠️</span>' : ''}</td>
          <td>${p.qtd}</td>
          <td>${formatarMoeda(p.faturamento)}</td>
          <td>${formatarMoeda(p.custo)}</td>
          <td>${formatarMoeda(p.lucro)}</td>
          <td>${p.margem != null ? formatarNumero(p.margem) + '%' : '—'}</td>
        </tr>`).join('') : `<tr><td colspan="6"><div class="vazio-admin"><div class="icone">💰</div>Nenhuma venda nesse período ainda.</div></td></tr>`;
    },

    renderizarGraficoEvolucao(dias, porDia){
      const canvas = $('#grafico-receita-evolucao');
      if (!canvas || typeof Chart === 'undefined') return;
      if (this.graficoEvolucao) this.graficoEvolucao.destroy();
      const corTexto = '#a89a8a';
      this.graficoEvolucao = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: dias.map(formatarDataCurta),
          datasets: [
            { label:'Faturamento', data: dias.map(d=>porDia[d].faturamento), backgroundColor:'#e88e3f', borderRadius:4, maxBarThickness:26 },
            { label:'Custo', data: dias.map(d=>porDia[d].custo), backgroundColor:'#8a7a6c', borderRadius:4, maxBarThickness:26 },
            { label:'Lucro', data: dias.map(d=>porDia[d].lucro), backgroundColor:'#7c9a63', borderRadius:4, maxBarThickness:26 }
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ position:'bottom', labels:{ color:'#f3ebdc', boxWidth:12, font:{ family:'Poppins', size:11 } } } },
          scales:{
            x:{ ticks:{ color:corTexto, font:{ size:10 } }, grid:{ display:false } },
            y:{ ticks:{ color:corTexto, font:{ size:10 } }, grid:{ color:'rgba(255,255,255,.06)' }, beginAtZero:true }
          }
        }
      });
    },

    renderizarGraficoProdutos(ranking){
      const canvas = $('#grafico-receita-produtos');
      if (!canvas || typeof Chart === 'undefined') return;
      if (this.graficoProdutos) this.graficoProdutos.destroy();
      const top = ranking.slice(0,6);
      this.graficoProdutos = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: top.map(p=>p.nome),
          datasets: [{ label:'Lucro', data: top.map(p=>p.lucro), backgroundColor:'#c9462a', borderRadius:6, maxBarThickness:22 }]
        },
        options: {
          indexAxis:'y', responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ display:false } },
          scales:{
            x:{ ticks:{ color:'#a89a8a', font:{ size:10 } }, grid:{ color:'rgba(255,255,255,.06)' }, beginAtZero:true },
            y:{ ticks:{ color:'#f3ebdc', font:{ size:11 } }, grid:{ display:false } }
          }
        }
      });
    },

    /* ---- Insumos ---- */
    renderizarInsumos(){
      const tbody = $('#tabela-insumos-corpo');
      if (!tbody) return;
      const busca = ($('#busca-insumo')?.value || '').toLowerCase();
      let insumos = Dados.getInsumos().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      if (busca) insumos = insumos.filter(i => i.nome.toLowerCase().includes(busca));

      tbody.innerHTML = insumos.length ? insumos.map(i => {
        const baixo = i.estoqueMinimo > 0 && i.estoqueAtual <= i.estoqueMinimo;
        return `
        <tr data-id="${i.id}">
          <td><strong>${escapar(i.nome)}</strong></td>
          <td>${i.unidade}</td>
          <td>${formatarMoeda(i.custoUnidade)}</td>
          <td style="${baixo ? 'color:var(--brasa); font-weight:700;' : ''}">${formatarNumero(i.estoqueAtual)} ${i.unidade}${baixo ? ' ⚠️' : ''}</td>
          <td>${i.estoqueMinimo ? formatarNumero(i.estoqueMinimo) + ' ' + i.unidade : '—'}</td>
          <td class="acoes-linha">
            <button class="btn-editar-insumo" data-id="${i.id}">Editar</button>
            <button class="excluir btn-excluir-insumo" data-id="${i.id}">Excluir</button>
          </td>
        </tr>`;
      }).join('') : `<tr><td colspan="6"><div class="vazio-admin"><div class="icone">🥩</div>Nenhum insumo cadastrado ainda.</div></td></tr>`;

      $$('.btn-editar-insumo', tbody).forEach(btn => btn.addEventListener('click', () => this.abrirFormInsumo(btn.dataset.id)));
      $$('.btn-excluir-insumo', tbody).forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Excluir este insumo? Ele também será removido de todas as fichas técnicas que o usam.')) return;
        this.executarComAutorizacao('Excluir um insumo.', async () => {
          const insumos = Dados.getInsumos().filter(i => i.id !== btn.dataset.id);
          const fichas = Dados.getFichasTecnicas();
          Object.keys(fichas).forEach(produtoId => {
            fichas[produtoId] = fichas[produtoId].filter(item => item.insumoId !== btn.dataset.id);
          });
          const r1 = await Dados.salvarInsumos(insumos);
          const r2 = await Dados.salvarFichasTecnicas(fichas);
          this.renderizarInsumos();
          this.atualizarSelectsFicha();
          if (r1 && r2) mostrarToast('Insumo excluído.');
        });
      }));

      if (!this.formInsumoLigado){
        this.formInsumoLigado = true;
        $('#busca-insumo')?.addEventListener('input', () => this.renderizarInsumos());
        $('#btn-novo-insumo')?.addEventListener('click', () => this.abrirFormInsumo(null));
        $('#btn-cancelar-insumo')?.addEventListener('click', () => this.fecharFormInsumo());
        $('#form-insumo')?.addEventListener('submit', (e) => this.salvarFormInsumo(e));
      }
    },

    abrirFormInsumo(id){
      this.editandoInsumoId = id;
      $('#painel-form-insumo').hidden = false;
      $('#painel-form-insumo').scrollIntoView({ behavior:'smooth', block:'center' });
      if (id){
        const i = Dados.getInsumos().find(x=>x.id===id);
        $('#titulo-form-insumo').textContent = 'Editar insumo';
        $('#campo-insumo-nome').value = i.nome;
        $('#campo-insumo-unidade').value = i.unidade;
        $('#campo-insumo-custo').value = i.custoUnidade;
        $('#campo-insumo-estoque').value = i.estoqueAtual;
        $('#campo-insumo-estoque-minimo').value = i.estoqueMinimo || '';
      } else {
        $('#titulo-form-insumo').textContent = 'Novo insumo';
        $('#form-insumo').reset();
      }
    },
    fecharFormInsumo(){
      $('#painel-form-insumo').hidden = true;
      this.editandoInsumoId = null;
    },
    salvarFormInsumo(e){
      e.preventDefault();
      const dados = {
        nome: $('#campo-insumo-nome').value.trim(),
        unidade: $('#campo-insumo-unidade').value,
        custoUnidade: parseFloat($('#campo-insumo-custo').value) || 0,
        estoqueAtual: parseFloat($('#campo-insumo-estoque').value) || 0,
        estoqueMinimo: parseFloat($('#campo-insumo-estoque-minimo').value) || 0
      };
      if (!dados.nome){ mostrarToast('Informe o nome do insumo.'); return; }
      this.executarComAutorizacao('Salvar dados de um insumo.', async () => {
        const lista = Dados.getInsumos();
        if (this.editandoInsumoId){
          Object.assign(lista.find(i=>i.id===this.editandoInsumoId), dados);
        } else {
          lista.push(Object.assign({ id: gerarId() }, dados));
        }
        const salvou = await Dados.salvarInsumos(lista);
        if (salvou) this.fecharFormInsumo();
        this.renderizarInsumos();
        this.atualizarSelectsFicha();
        if (salvou) mostrarToast('Insumo salvo!');
      });
    },

    /* ---- Fichas técnicas ---- */
    renderizarFichasTecnicas(){
      const select = $('#select-ficha-produto');
      if (!select) return;
      const produtos = Dados.getProdutos().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      select.innerHTML = '<option value="">Selecione um produto...</option>' +
        produtos.map(p => `<option value="${p.id}">${escapar(p.nome)} (${escapar(p.categoria)})</option>`).join('');

      this.atualizarSelectsFicha();

      if (!this.formFichaLigado){
        this.formFichaLigado = true;
        select.addEventListener('change', () => this.abrirFichaProduto(select.value));
        $('#btn-add-ficha-item')?.addEventListener('click', () => this.adicionarItemFicha());
      }
    },

    atualizarSelectsFicha(){
      const selectInsumo = $('#campo-ficha-insumo');
      if (!selectInsumo) return;
      const insumos = Dados.getInsumos().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
      selectInsumo.innerHTML = '<option value="">Selecione...</option>' +
        insumos.map(i => `<option value="${i.id}">${escapar(i.nome)} (${i.unidade})</option>`).join('');
    },

    abrirFichaProduto(produtoId){
      this.produtoFichaSelecionado = produtoId;
      const area = $('#area-ficha-tecnica');
      if (!produtoId){ area.hidden = true; return; }
      area.hidden = false;
      const produto = Dados.getProdutos().find(p=>p.id===produtoId);
      $('#titulo-ficha-produto').textContent = produto ? produto.nome : '—';
      this.renderizarListaFicha();
    },

    renderizarListaFicha(){
      const produtoId = this.produtoFichaSelecionado;
      if (!produtoId) return;
      const produto = Dados.getProdutos().find(p=>p.id===produtoId);
      const fichas = Dados.getFichasTecnicas();
      const insumos = Dados.getInsumos();
      const mapaInsumos = {}; insumos.forEach(i => { mapaInsumos[i.id] = i; });
      const itens = fichas[produtoId] || [];

      const lista = $('#lista-ficha-itens');
      lista.innerHTML = itens.length ? itens.map((item, idx) => {
        const insumo = mapaInsumos[item.insumoId];
        const custoItem = insumo ? insumo.custoUnidade * item.quantidade : 0;
        return `
          <div class="linha-ficha-item">
            <span class="nome-insumo-ficha">${insumo ? escapar(insumo.nome) : '(insumo removido)'}</span>
            <span class="qtd-insumo-ficha">${formatarNumero(item.quantidade)} ${insumo ? insumo.unidade : ''}</span>
            <span class="custo-insumo-ficha">${formatarMoeda(custoItem)}</span>
            <button type="button" class="remover-item-ficha" data-idx="${idx}" aria-label="Remover">✕</button>
          </div>`;
      }).join('') : `<p class="ajuda">Nenhum insumo adicionado a essa ficha ainda.</p>`;

      $$('.remover-item-ficha', lista).forEach(btn => btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        this.executarComAutorizacao('Remover um insumo de uma ficha técnica.', async () => {
          const fichasAtuais = Dados.getFichasTecnicas();
          fichasAtuais[produtoId].splice(idx, 1);
          await Dados.salvarFichasTecnicas(fichasAtuais);
          this.renderizarListaFicha();
        });
      }));

      const custoTotal = calcularCustoProduto(produtoId, fichas, insumos) || 0;
      $('#preview-preco-ficha').textContent = formatarMoeda(produto ? produto.preco : 0);
      $('#preview-custo-ficha').textContent = formatarMoeda(custoTotal);
      const margemEl = $('#preview-margem-ficha');
      if (produto && produto.preco > 0 && itens.length){
        const margemReais = produto.preco - custoTotal;
        const margemPct = (margemReais / produto.preco) * 100;
        margemEl.textContent = `${formatarMoeda(margemReais)} (${formatarNumero(margemPct)}%)`;
      } else {
        margemEl.textContent = '—';
      }
    },

    adicionarItemFicha(){
      const produtoId = this.produtoFichaSelecionado;
      if (!produtoId) return;
      const insumoId = $('#campo-ficha-insumo').value;
      const quantidade = parseFloat($('#campo-ficha-quantidade').value);
      if (!insumoId || !(quantidade > 0)){ mostrarToast('Selecione o insumo e informe uma quantidade válida.'); return; }

      this.executarComAutorizacao('Adicionar um insumo a uma ficha técnica.', async () => {
        const fichas = Dados.getFichasTecnicas();
        if (!fichas[produtoId]) fichas[produtoId] = [];
        const existente = fichas[produtoId].find(item => item.insumoId === insumoId);
        if (existente){
          existente.quantidade = quantidade;
        } else {
          fichas[produtoId].push({ insumoId, quantidade });
        }
        const salvou = await Dados.salvarFichasTecnicas(fichas);
        $('#campo-ficha-insumo').value = '';
        $('#campo-ficha-quantidade').value = '';
        this.renderizarListaFicha();
        if (salvou) mostrarToast('Insumo adicionado à ficha técnica!');
      });
    },

    /* ---- Autorização do gestor (qualquer alteração precisa da senha de um admin) ---- */
    ligarModalAutorizacao(){
      if (this._modalAutorizacaoLigado) return;
      this._modalAutorizacaoLigado = true;
      $('#btn-fechar-autorizacao')?.addEventListener('click', () => this.fecharModalAutorizacao());
      $('#modal-autorizacao-admin')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-autorizacao-admin') this.fecharModalAutorizacao();
      });
      $('#btn-confirmar-autorizacao')?.addEventListener('click', async () => {
        const btn = $('#btn-confirmar-autorizacao');
        if (btn) btn.disabled = true;
        let autorizado = false;
        try{
          // confere a senha de um admin ativo no Supabase Auth, sem trocar a sessão de quem está logado
          autorizado = await Banco.auth.verificarSenhaAdmin($('#campo-senha-autorizacao').value);
        }catch(err){
          console.error(err);
        }
        if (btn) btn.disabled = false;
        if (!autorizado){
          $('#erro-autorizacao').classList.add('visivel');
          return;
        }
        const acao = this.autorizacaoPendente;
        this.fecharModalAutorizacao();
        if (acao) acao();
      });
    },

    abrirModalAutorizacao(descricao, callback){
      this.autorizacaoPendente = callback;
      $('#texto-autorizacao').textContent = descricao || 'Essa alteração precisa da senha de um administrador.';
      $('#campo-senha-autorizacao').value = '';
      $('#erro-autorizacao').classList.remove('visivel');
      $('#modal-autorizacao-admin')?.classList.add('aberto');
      setTimeout(() => $('#campo-senha-autorizacao')?.focus(), 150);
    },

    fecharModalAutorizacao(){
      $('#modal-autorizacao-admin')?.classList.remove('aberto');
      this.autorizacaoPendente = null;
    },

    /* Executa `callback` na hora se for Admin. Se for Gestor, primeiro pede a
       senha de um Admin ativo. Use em toda ação que grava/exclui dados. */
    executarComAutorizacao(descricao, callback){
      // o callback pode ser assíncrono (grava no banco): qualquer falha vira aviso na tela
      const rodar = () => {
        Promise.resolve().then(callback).catch(err => {
          console.error(err);
          mostrarToast(Banco.erroAmigavel(err));
        });
      };
      if (this.sessao?.perfil === 'admin'){
        rodar();
      } else {
        this.abrirModalAutorizacao(descricao, rodar);
      }
    },

    /* ---- Esteira de Pedidos (kanban com busca) ---- */
    renderizarEsteira(){
      if (!$('#quadro-esteira')) return;
      this.ligarModalAutorizacao();

      if (!this.esteiraLigada){
        this.esteiraLigada = true;
        $('#busca-esteira')?.addEventListener('input', () => this.renderizarQuadroEsteira());
      }
      this.renderizarQuadroEsteira();
    },

    renderizarQuadroEsteira(){
      const termo = ($('#busca-esteira')?.value || '').trim().toLowerCase();
      let pedidos = Dados.getPedidos().filter(p => !p.estornado);

      if (termo){
        pedidos = pedidos.filter(p =>
          p.cliente.nome.toLowerCase().includes(termo) ||
          somenteDigitos(p.cliente.telefone).includes(somenteDigitos(termo)) ||
          (p.cliente.email || '').toLowerCase().includes(termo) ||
          String(p.numero).includes(termo)
        );
      }

      const statusColunas = ['novo', 'preparando', 'pronto', 'entregue'];
      statusColunas.forEach(status => {
        const doStatus = pedidos.filter(p => p.status === status).sort((a,b) => new Date(b.dataHora) - new Date(a.dataHora));
        $(`#contagem-${status}`).textContent = doStatus.length;
        const container = $(`#coluna-cartoes-${status}`);
        container.innerHTML = doStatus.length ? doStatus.map(p => this.cartaoEsteira(p, status)).join('') :
          `<p style="color:var(--fumaca); font-size:.8rem; text-align:center; padding:20px 8px;">Nada por aqui.</p>`;
      });

      $$('.btn-avancar-status').forEach(btn => btn.addEventListener('click', () => {
        this.avancarStatusPedido(btn.dataset.id, btn.dataset.proximo);
      }));
      $$('.btn-estornar-pedido').forEach(btn => btn.addEventListener('click', () => {
        this.estornarPedido(btn.dataset.id);
      }));
    },

    cartaoEsteira(p, statusAtual){
      const proximos = { novo:'preparando', preparando:'pronto', pronto:'entregue' };
      const proximo = proximos[statusAtual];
      const rotulosProximo = { preparando:'Preparar', pronto:'Marcar pronto', entregue:'Marcar entregue' };
      return `
        <div class="cartao-esteira">
          <div class="topo-cartao-esteira">
            <strong>#${p.numero}</strong>
            <span>${formatarMoeda(p.total)}</span>
          </div>
          <div class="cliente-cartao-esteira">${escapar(p.cliente.nome)}</div>
          <div class="meta-cartao-esteira">${formatarTelefone(p.cliente.telefone)} · ${p.tipoEntrega === 'delivery' ? '🛵 Delivery' : '🏠 Retirada'}</div>
          <div class="meta-cartao-esteira">${p.itens.reduce((s,i)=>s+i.qtd,0)} itens · ${new Date(p.dataHora).toLocaleString('pt-BR')}</div>
          <div class="acoes-cartao-esteira">
            ${proximo ? `<button type="button" class="btn-avancar-status" data-id="${p.id}" data-proximo="${proximo}">${rotulosProximo[proximo]} →</button>` : ''}
            <button type="button" class="btn-estornar-pedido" data-id="${p.id}">Estornar</button>
          </div>
        </div>`;
    },

    avancarStatusPedido(pedidoId, novoStatus){
      const pedido = Dados.getPedidos().find(p => p.id === pedidoId);
      if (!pedido) return;
      const executar = async () => {
        try{
          await Banco.atualizarStatusPedido(pedidoId, novoStatus);
        }catch(err){
          mostrarToast(Banco.erroAmigavel(err));
          this.renderizarQuadroEsteira();
          return;
        }
        this.renderizarQuadroEsteira();
        this.renderizarPainel();
        mostrarToast(`Pedido #${pedido.numero} → ${rotuloStatus(novoStatus)}`);
      };
      if (this.sessao?.perfil === 'funcionario') executar();
      else this.executarComAutorizacao(`Avançar o status do pedido #${pedido.numero}.`, executar);
    },

    estornarPedido(pedidoId){
      const pedido = Dados.getPedidos().find(p => p.id === pedidoId);
      if (!pedido) return;
      const valorTexto = prompt(`Estornar pedido #${pedido.numero} — valor a estornar (R$):`, pedido.total.toFixed(2).replace('.',','));
      if (valorTexto === null) return;
      const valor = parseFloat(valorTexto.replace(',', '.'));
      if (isNaN(valor) || valor <= 0){ mostrarToast('Informe um valor de estorno válido.'); return; }

      const executar = async () => {
        try{
          // quem estornou e quando é registrado pelo servidor, a partir do login — não do navegador
          await Banco.estornarPedido(pedidoId, valor);
        }catch(err){
          mostrarToast(Banco.erroAmigavel(err));
          this.renderizarQuadroEsteira();
          return;
        }
        this.renderizarQuadroEsteira();
        this.renderizarPainel();
        mostrarToast(`Pedido #${pedido.numero} estornado. Lembre-se de fazer o estorno na maquininha.`);
      };
      if (this.sessao?.perfil === 'funcionario') executar();
      else this.executarComAutorizacao(`Estornar ${formatarMoeda(valor)} do pedido #${pedido.numero}.`, executar);
    },

    /* ---- Funcionários (cadastro + níveis de permissão) ---- */
    renderizarFuncionarios(){
      const tbody = $('#tabela-funcionarios-corpo');
      if (!tbody) return;
      this.ligarModalAutorizacao();

      const funcionarios = Dados.getFuncionarios();
      tbody.innerHTML = funcionarios.map(f => `
        <tr data-id="${f.id}">
          <td>${f.foto ? `<img class="foto-mini" src="${f.foto}" alt="">` : `<span class="emoji-mini">👤</span>`}</td>
          <td><strong>${escapar(f.nome)}</strong></td>
          <td>${escapar(f.email)}</td>
          <td><span class="selo-status ${f.perfil === 'admin' ? 'disponivel' : f.perfil === 'gestor' ? 'preparando' : 'novo'}">${rotuloPerfil(f.perfil)}</span></td>
          <td><span class="selo-status ${f.ativo ? 'disponivel' : 'indisponivel'}">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td class="acoes-linha">
            <button class="btn-editar-funcionario" data-id="${f.id}">Editar</button>
            <button class="excluir btn-excluir-funcionario" data-id="${f.id}">Excluir</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="6"><div class="vazio-admin">Nenhum funcionário cadastrado ainda.</div></td></tr>`;

      $$('.btn-editar-funcionario', tbody).forEach(btn => btn.addEventListener('click', () => this.abrirFormFuncionario(btn.dataset.id)));
      $$('.btn-excluir-funcionario', tbody).forEach(btn => btn.addEventListener('click', () => {
        if (btn.dataset.id === this.sessao?.id){ mostrarToast('Você não pode excluir o próprio usuário logado.'); return; }
        if (!confirm('Excluir este funcionário? Ele não conseguirá mais entrar no painel.')) return;
        this.executarComAutorizacao('Excluir um funcionário.', async () => {
          try{
            await Banco.funcionarios.excluir(btn.dataset.id); // Edge Function: remove o usuário do Supabase Auth
          }catch(err){
            mostrarToast(err.message);
            return;
          }
          this.renderizarFuncionarios();
          mostrarToast('Funcionário excluído.');
        });
      }));

      if (!this.formFuncionarioLigado){
        this.formFuncionarioLigado = true;
        $('#btn-novo-funcionario')?.addEventListener('click', () => this.abrirFormFuncionario(null));
        $('#btn-cancelar-funcionario')?.addEventListener('click', () => this.fecharFormFuncionario());
        $('#form-funcionario')?.addEventListener('submit', (e) => this.salvarFormFuncionario(e));

        $$('.opcao-perfil', $('#seletor-perfil-funcionario')).forEach(btn => btn.addEventListener('click', () => {
          $$('.opcao-perfil', $('#seletor-perfil-funcionario')).forEach(b => b.classList.remove('selecionada'));
          btn.classList.add('selecionada');
        }));

        $('#campo-funcionario-foto')?.addEventListener('change', async (e) => {
          const arquivo = e.target.files[0];
          if (!arquivo) return;
          if (arquivo.size > 8 * 1024 * 1024){ mostrarToast('Imagem muito grande (máx. 8MB).'); e.target.value=''; return; }
          try{
            const dataUrl = await redimensionarImagemParaDataURL(arquivo, 300, 0.75);
            this.fotoFuncionarioAtual = dataUrl;
            $('#preview-foto-funcionario').innerHTML = `<img src="${dataUrl}" alt="">`;
          }catch(err){ mostrarToast('Não foi possível processar essa imagem.'); }
          e.target.value = '';
        });
      }
    },

    abrirFormFuncionario(id){
      this.editandoFuncionarioId = id;
      $('#painel-form-funcionario').hidden = false;
      $('#painel-form-funcionario').scrollIntoView({ behavior:'smooth', block:'center' });
      const seletor = $('#seletor-perfil-funcionario');
      $$('.opcao-perfil', seletor).forEach(b => { if (b.dataset.perfil === 'admin') b.hidden = this.sessao?.perfil !== 'admin'; });
      const selecionarPerfil = (perfil) => {
        $$('.opcao-perfil', seletor).forEach(b => b.classList.toggle('selecionada', b.dataset.perfil === perfil));
      };

      if (id){
        const f = Dados.getFuncionarios().find(x => x.id === id);
        $('#titulo-form-funcionario').textContent = 'Editar funcionário';
        $('#campo-funcionario-nome').value = f.nome;
        $('#campo-funcionario-email').value = f.email;
        $('#campo-funcionario-senha').value = '';
        $('#rotulo-senha-opcional').textContent = '(deixe em branco pra manter a atual)';
        $('#campo-funcionario-ativo').checked = f.ativo;
        selecionarPerfil(f.perfil);
        this.fotoFuncionarioAtual = f.foto || null;
        $('#preview-foto-funcionario').innerHTML = f.foto ? `<img src="${f.foto}" alt="">` : '📷';
      } else {
        $('#titulo-form-funcionario').textContent = 'Novo funcionário';
        $('#form-funcionario').reset();
        $('#rotulo-senha-opcional').textContent = '';
        $('#campo-funcionario-ativo').checked = true;
        selecionarPerfil('funcionario');
        this.fotoFuncionarioAtual = null;
        $('#preview-foto-funcionario').innerHTML = '📷';
      }
    },

    fecharFormFuncionario(){
      $('#painel-form-funcionario').hidden = true;
      this.editandoFuncionarioId = null;
    },

    salvarFormFuncionario(e){
      e.preventDefault();
      const nome = $('#campo-funcionario-nome').value.trim();
      const email = $('#campo-funcionario-email').value.trim().toLowerCase();
      const senha = $('#campo-funcionario-senha').value;
      const ativo = $('#campo-funcionario-ativo').checked;
      const perfilBtn = $('.opcao-perfil.selecionada', $('#seletor-perfil-funcionario'));
      const perfil = perfilBtn ? perfilBtn.dataset.perfil : 'funcionario';

      if (!nome || !email.includes('@')){ mostrarToast('Preencha nome e um e-mail válido.'); return; }

      const lista = Dados.getFuncionarios();
      const duplicado = lista.find(f => f.email.toLowerCase() === email && f.id !== this.editandoFuncionarioId);
      if (duplicado){ mostrarToast('Já existe um funcionário com esse e-mail.'); return; }
      if (!this.editandoFuncionarioId && !senha){ mostrarToast('Defina uma senha para o novo funcionário.'); return; }
      if (senha && senha.length < 8){ mostrarToast('A senha precisa ter pelo menos 8 caracteres.'); return; }

      const executar = async () => {
        const dadosFuncionario = { nome, email, perfil, ativo, senha, foto: this.fotoFuncionarioAtual };
        try{
          // criar/editar usuário no Supabase Auth exige a chave de serviço: é feito pela Edge Function
          if (this.editandoFuncionarioId) await Banco.funcionarios.atualizar(Object.assign({ id: this.editandoFuncionarioId }, dadosFuncionario));
          else await Banco.funcionarios.criar(dadosFuncionario);
        }catch(err){
          mostrarToast(err.message);
          return;
        }
        this.fecharFormFuncionario();
        this.renderizarFuncionarios();
        mostrarToast('Funcionário salvo com sucesso!');
      };
      this.executarComAutorizacao('Salvar dados de um funcionário.', executar);
    },

    /* ---- Entregadores (motoqueiro + dados da moto) ---- */
    renderizarEntregadores(){
      const tbody = $('#tabela-entregadores-corpo');
      if (!tbody) return;
      this.ligarModalAutorizacao();

      const entregadores = Dados.getEntregadores();
      tbody.innerHTML = entregadores.map(en => `
        <tr data-id="${en.id}">
          <td><span class="emoji-mini">🏍️</span></td>
          <td><strong>${escapar(en.nome)}</strong><br><span style="color:var(--fumaca);font-size:.78rem">${en.telefone ? formatarTelefone(en.telefone) : ''}</span></td>
          <td>${escapar(en.placa || '—')}</td>
          <td style="font-size:.78rem; color:var(--fumaca);">${en.fotoDocMoto ? '✅ Moto' : '⬜ Moto'} · ${en.fotoDocCondutor ? '✅ Condutor' : '⬜ Condutor'}</td>
          <td><span class="selo-status ${en.ativo ? 'disponivel' : 'indisponivel'}">${en.ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td class="acoes-linha">
            <button class="btn-editar-entregador" data-id="${en.id}">Editar</button>
            <button class="excluir btn-excluir-entregador" data-id="${en.id}">Excluir</button>
          </td>
        </tr>`).join('') || `<tr><td colspan="6"><div class="vazio-admin">Nenhum entregador cadastrado ainda.</div></td></tr>`;

      $$('.btn-editar-entregador', tbody).forEach(btn => btn.addEventListener('click', () => this.abrirFormEntregador(btn.dataset.id)));
      $$('.btn-excluir-entregador', tbody).forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Excluir este entregador?')) return;
        this.executarComAutorizacao('Excluir um entregador.', async () => {
          const antigo = Dados.getEntregadores().find(en => en.id === btn.dataset.id);
          const salvou = await Dados.salvarEntregadores(Dados.getEntregadores().filter(en => en.id !== btn.dataset.id));
          this.renderizarEntregadores();
          if (salvou){
            if (antigo?.fotoDocMoto) Banco.imagens.remover('documentos', antigo.fotoDocMoto);
            if (antigo?.fotoDocCondutor) Banco.imagens.remover('documentos', antigo.fotoDocCondutor);
            mostrarToast('Entregador excluído.');
          }
        });
      }));

      if (!this.formEntregadorLigado){
        this.formEntregadorLigado = true;
        $('#btn-novo-entregador')?.addEventListener('click', () => this.abrirFormEntregador(null));
        $('#btn-cancelar-entregador')?.addEventListener('click', () => { $('#painel-form-entregador').hidden = true; });
        $('#form-entregador')?.addEventListener('submit', (e) => this.salvarFormEntregador(e));
        $('#campo-entregador-telefone')?.addEventListener('input', (e) => { e.target.value = formatarTelefone(e.target.value); });

        const ligarUploadDocumento = (inputId, previewId, propriedade) => {
          $(`#${inputId}`)?.addEventListener('change', async (e) => {
            const arquivo = e.target.files[0];
            if (!arquivo) return;
            if (arquivo.size > 8 * 1024 * 1024){ mostrarToast('Imagem muito grande (máx. 8MB).'); e.target.value=''; return; }
            try{
              const dataUrl = await redimensionarImagemParaDataURL(arquivo, 700, 0.75);
              this[propriedade] = dataUrl;
              $(`#${previewId}`).innerHTML = `<img src="${dataUrl}" alt="">`;
            }catch(err){ mostrarToast('Não foi possível processar essa imagem.'); }
            e.target.value = '';
          });
        };
        ligarUploadDocumento('campo-foto-doc-moto', 'preview-doc-moto', 'fotoDocMotoAtual');
        ligarUploadDocumento('campo-foto-doc-condutor', 'preview-doc-condutor', 'fotoDocCondutorAtual');
      }
    },

    abrirFormEntregador(id){
      this.editandoEntregadorId = id;
      $('#painel-form-entregador').hidden = false;
      $('#painel-form-entregador').scrollIntoView({ behavior:'smooth', block:'center' });

      // documentos ficam num bucket PRIVADO: a pré-visualização usa um link temporário
      const mostrarDocumento = (seletor, caminho, vazio) => {
        const el = $(seletor);
        el.innerHTML = vazio;
        if (!caminho) return;
        Banco.imagens.urlAssinada('documentos', caminho).then(url => {
          if (url && this.editandoEntregadorId === id) el.innerHTML = `<img src="${url}" alt="">`;
        });
      };

      if (id){
        const en = Dados.getEntregadores().find(x => x.id === id);
        $('#titulo-form-entregador').textContent = 'Editar entregador';
        $('#campo-entregador-nome').value = en.nome;
        $('#campo-entregador-telefone').value = en.telefone ? formatarTelefone(en.telefone) : '';
        $('#campo-entregador-placa').value = en.placa || '';
        $('#campo-entregador-chassi').value = en.chassi || '';
        $('#campo-entregador-ativo').checked = en.ativo;
        this.fotoDocMotoAtual = en.fotoDocMoto || null;
        this.fotoDocCondutorAtual = en.fotoDocCondutor || null;
        mostrarDocumento('#preview-doc-moto', en.fotoDocMoto, '📄');
        mostrarDocumento('#preview-doc-condutor', en.fotoDocCondutor, '🪪');
      } else {
        $('#titulo-form-entregador').textContent = 'Novo entregador';
        $('#form-entregador').reset();
        $('#campo-entregador-ativo').checked = true;
        this.fotoDocMotoAtual = null;
        this.fotoDocCondutorAtual = null;
        $('#preview-doc-moto').innerHTML = '📄';
        $('#preview-doc-condutor').innerHTML = '🪪';
      }
    },

    salvarFormEntregador(e){
      e.preventDefault();
      const nome = $('#campo-entregador-nome').value.trim();
      if (!nome){ mostrarToast('Informe o nome do entregador.'); return; }

      const campos = {
        nome,
        telefone: somenteDigitos($('#campo-entregador-telefone').value),
        placa: $('#campo-entregador-placa').value.trim().toUpperCase(),
        chassi: $('#campo-entregador-chassi').value.trim(),
        ativo: $('#campo-entregador-ativo').checked
      };

      const executar = async () => {
        const lista = Dados.getEntregadores();
        const antigo = this.editandoEntregadorId ? lista.find(en => en.id === this.editandoEntregadorId) : null;
        const antesMoto = antigo ? antigo.fotoDocMoto : null;
        const antesCondutor = antigo ? antigo.fotoDocCondutor : null;
        let fotoDocMoto = this.fotoDocMotoAtual || null;
        let fotoDocCondutor = this.fotoDocCondutorAtual || null;

        // fotos novas (data URL) sobem para o Storage privado; o cadastro guarda só o caminho
        try{
          if (fotoDocMoto && fotoDocMoto.startsWith('data:')) fotoDocMoto = (await Banco.imagens.enviar('documentos', fotoDocMoto, 'moto')).path;
          if (fotoDocCondutor && fotoDocCondutor.startsWith('data:')) fotoDocCondutor = (await Banco.imagens.enviar('documentos', fotoDocCondutor, 'condutor')).path;
        }catch(err){
          mostrarToast('Não foi possível enviar a foto: ' + Banco.erroAmigavel(err));
          return;
        }

        const dados = Object.assign({}, campos, { fotoDocMoto, fotoDocCondutor });
        if (antigo) Object.assign(antigo, dados);
        else lista.push(Object.assign({ id: gerarId() }, dados));

        const salvou = await Dados.salvarEntregadores(lista);
        if (!salvou){ this.renderizarEntregadores(); return; }
        if (antesMoto && antesMoto !== fotoDocMoto) Banco.imagens.remover('documentos', antesMoto);
        if (antesCondutor && antesCondutor !== fotoDocCondutor) Banco.imagens.remover('documentos', antesCondutor);
        $('#painel-form-entregador').hidden = true;
        this.renderizarEntregadores();
        mostrarToast('Entregador salvo com sucesso!');
      };
      this.executarComAutorizacao('Salvar dados de um entregador.', executar);
    },

    /* ---- Configurações gerais ---- */
    renderizarConfiguracoes(){
      const cfg = Dados.getConfig();
      if (!$('#form-config-loja')) return;
      $('#cfg-whatsapp').value = cfg.whatsapp;
      $('#cfg-instagram').value = cfg.instagram;
      $('#cfg-facebook').value = cfg.facebook;
      $('#cfg-endereco-texto').value = cfg.enderecoTexto;
      $('#cfg-endereco-mapa').value = cfg.enderecoMapaBusca;
      $('#cfg-endereco-url-maps').value = cfg.enderecoUrlGoogleMaps || '';
      $('#cfg-endereco-lat').value = typeof cfg.enderecoLat === 'number' ? cfg.enderecoLat : '';
      $('#cfg-endereco-lng').value = typeof cfg.enderecoLng === 'number' ? cfg.enderecoLng : '';

      const atualizarPreviewMapaAdmin = () => {
        const iframe = $('#iframe-mapa-admin');
        if (!iframe) return;
        const lat = parseFloat($('#cfg-endereco-lat').value);
        const lng = parseFloat($('#cfg-endereco-lng').value);
        if (isNaN(lat) || isNaN(lng)){ iframe.removeAttribute('src'); return; }
        iframe.src = `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
      };
      atualizarPreviewMapaAdmin();
      if (!this.previewMapaLigado){
        this.previewMapaLigado = true;
        let debouncePreview;
        $$('#cfg-endereco-lat, #cfg-endereco-lng').forEach(campo => {
          campo?.addEventListener('input', () => {
            clearTimeout(debouncePreview);
            debouncePreview = setTimeout(atualizarPreviewMapaAdmin, 500);
          });
        });
      }

      const wrapHorarios = $('#wrap-horarios-config');
      const nomesOrdem = [
        {dia:1, nome:'Segunda'}, {dia:2, nome:'Terça'}, {dia:3, nome:'Quarta'}, {dia:4, nome:'Quinta'},
        {dia:5, nome:'Sexta'}, {dia:6, nome:'Sábado'}, {dia:0, nome:'Domingo'}
      ];
      const renderHorarios = () => {
        wrapHorarios.innerHTML = nomesOrdem.map(({dia, nome}) => {
          const h = cfg.horarios.find(x => x.dia === dia) || { dia, nome, aberto:false, abertura:'18:00', fechamento:'23:00' };
          return `
          <div class="campo-linha" data-dia="${dia}" style="align-items:flex-end;">
            <div class="campo" style="flex:0 0 130px;">
              <label class="chave-valor">
                <input type="checkbox" class="cfg-horario-aberto" ${h.aberto ? 'checked' : ''}>
                <span class="interruptor"></span>
                ${nome}
              </label>
            </div>
            <div class="campo"><label>Abre às</label><input type="time" class="cfg-horario-abertura" value="${h.abertura}" ${h.aberto?'':'disabled'}></div>
            <div class="campo"><label>Fecha às</label><input type="time" class="cfg-horario-fechamento" value="${h.fechamento}" ${h.aberto?'':'disabled'}></div>
          </div>`;
        }).join('');
        $$('.cfg-horario-aberto', wrapHorarios).forEach(chk => chk.addEventListener('change', () => {
          const linha = chk.closest('.campo-linha');
          $$('.cfg-horario-abertura, .cfg-horario-fechamento', linha).forEach(inp => inp.disabled = !chk.checked);
        }));
      };
      renderHorarios();

      $('#form-config-loja').addEventListener('submit', (e) => {
        e.preventDefault();
        this.executarComAutorizacao('Alterar os dados da loja.', async () => {
          const novoCfg = Dados.getConfig();
          novoCfg.whatsapp = somenteDigitos($('#cfg-whatsapp').value);
          novoCfg.instagram = $('#cfg-instagram').value.trim();
          novoCfg.facebook = $('#cfg-facebook').value.trim();
          novoCfg.enderecoTexto = $('#cfg-endereco-texto').value.trim();
          novoCfg.enderecoMapaBusca = $('#cfg-endereco-mapa').value.trim();
          novoCfg.enderecoUrlGoogleMaps = $('#cfg-endereco-url-maps').value.trim();
          const latDigitada = parseFloat($('#cfg-endereco-lat').value);
          const lngDigitada = parseFloat($('#cfg-endereco-lng').value);
          novoCfg.enderecoLat = isNaN(latDigitada) ? null : latDigitada;
          novoCfg.enderecoLng = isNaN(lngDigitada) ? null : lngDigitada;
          novoCfg.horarios = nomesOrdem.map(({dia, nome}) => {
            const linha = $(`.campo-linha[data-dia="${dia}"]`, wrapHorarios);
            return {
              dia, nome,
              aberto: $('.cfg-horario-aberto', linha).checked,
              abertura: $('.cfg-horario-abertura', linha).value || '00:00',
              fechamento: $('.cfg-horario-fechamento', linha).value || '00:00'
            };
          });
          const salvou = await Dados.salvarConfig(novoCfg);
          if (salvou) mostrarToast('Dados da loja atualizados!');
        });
      });

      // Cópia de segurança (exportação). Os dados já ficam no banco do Supabase, que faz
      // os próprios backups — este arquivo é um extra, útil pra planilhas e auditoria.
      $('#btn-exportar-dados')?.addEventListener('click', async () => {
        try{ await Banco.recarregar('clientes'); }catch(err){ /* segue sem a lista de clientes */ }
        const tudo = {
          produtos: Dados.getProdutos(),
          bairros: Dados.getBairros(),
          config: Dados.getConfig(),
          insumos: Dados.getInsumos(),
          fichasTecnicas: Dados.getFichasTecnicas(),
          entregadores: Dados.getEntregadores(),
          pedidos: Dados.getPedidos(),
          clientes: Dados.getClientes(),
          exportadoEm: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(tudo, null, 2)], { type:'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'espetolivre-backup-' + new Date().toISOString().slice(0,10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        mostrarToast('Backup exportado!');
      });
    }
  };

  function rotuloStatus(s){
    return { novo:'Novo', preparando:'Preparando', pronto:'Pronto', entregue:'Entregue', cancelado:'Cancelado' }[s] || s;
  }

  /* ========================================================================
     7. INICIALIZAÇÃO GERAL
     ======================================================================== */

  // Tela de erro quando não dá pra falar com o banco (sem internet, chave não configurada…)
  function mostrarErroFatal(err){
    console.error('Falha ao iniciar:', err);
    const semConfig = !Banco.configurado;
    const caixa = document.createElement('div');
    caixa.setAttribute('role', 'alert');
    caixa.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(18,14,12,.97);color:#f3ebdc;padding:24px;text-align:center;font-family:system-ui,-apple-system,sans-serif;';
    const miolo = document.createElement('div');
    miolo.style.cssText = 'max-width:440px;';
    const titulo = document.createElement('h2');
    titulo.style.cssText = 'margin:8px 0 10px;font-size:1.4rem;';
    titulo.textContent = semConfig ? 'Site ainda não conectado ao banco' : 'Não conseguimos carregar agora';
    const texto = document.createElement('p');
    texto.style.cssText = 'margin:0 0 18px;line-height:1.5;color:#c9bca9;';
    texto.textContent = semConfig
      ? 'Falta configurar a conexão com o Supabase: preencha a chave "anonKey" em assets/js/config.js.'
      : 'Não foi possível falar com o servidor. Verifique sua internet e tente de novo em instantes.';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = 'Tentar de novo';
    botao.style.cssText = 'background:#c9462a;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:1rem;cursor:pointer;';
    botao.addEventListener('click', () => window.location.reload());
    const emoji = document.createElement('div');
    emoji.style.cssText = 'font-size:2.6rem;';
    emoji.textContent = '🍢';
    miolo.append(emoji, titulo, texto);
    if (!semConfig) miolo.append(botao);
    caixa.append(miolo);
    document.body.appendChild(caixa);
  }

  // Cliente já identificado neste aparelho: busca o cadastro (endereço salvo etc.) no banco
  async function carregarPerfilDoCliente(){
    try{
      const bruto = localStorage.getItem('espetolivre_identificacao');
      if (!bruto) return;
      const id = JSON.parse(bruto);
      if (!id || !id.telefone) return;
      const perfil = await Banco.cliente.obter(id.telefone);
      if (!perfil) await Banco.cliente.identificar(id.nome, id.telefone, id.email || ''); // cadastro ainda não existe no banco
    }catch(e){
      console.warn('Não foi possível carregar o cadastro do cliente:', e);
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    Banco.aoFalhar((tabela, mensagem) => {
      mostrarToast('Não foi possível salvar: ' + mensagem);
      Admin.recarregarTela();
    });

    try{
      await Banco.iniciar();
      if (!$('#app-admin')) await carregarPerfilDoCliente();
    }catch(err){
      mostrarErroFatal(err);
      return;
    }

    aplicarConfigNaPagina();
    setInterval(() => atualizarStatusLoja(Dados.getConfig()), 60000); // recalcula a cada minuto
    iniciarMenuMobile();
    iniciarCopiarEndereco();
    renderizarAreaCliente();
    ligarAreaCliente();
    Comanda.iniciar();
    Perfil.iniciar();
    Admin.iniciar();
  });

})();
