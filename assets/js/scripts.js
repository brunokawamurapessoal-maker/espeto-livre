/* ==========================================================================
   ESPETO LIVRE — scripts.js
   ---------------------------------------------------------------------------
   Tudo o que faz a comanda digital, o carrinho, o checkout e o painel admin
   funcionarem. Não existe backend/servidor neste projeto (arquitetura 100%
   estática pedida), então os dados (cardápio, bairros, pedidos, clientes)
   ficam salvos no localStorage do navegador.

   >>> IMPORTANTE PARA O DONO DO NEGÓCIO (leia isso) <<<
   Como não há um servidor central, o localStorage só existe DENTRO DO MESMO
   NAVEGADOR/APARELHO. Ou seja: se você editar o cardápio no celular e um
   cliente acessar o site em outro celular, ele NÃO verá a alteração
   automaticamente — a não ser que você use "Exportar dados" no admin e
   "Importar dados" no outro aparelho (Admin > Configurações > Backup).
   Para produtos, o ideal é editar sempre pelo MESMO aparelho/navegador que
   os clientes usam (ex: um tablet fixo no balcão).
   Os pedidos, além de salvos localmente, também são enviados prontos para o
   seu WhatsApp — é essa parte que garante que vocês três recebem o pedido
   na hora, não dependendo de sincronismo entre aparelhos.
   Se no futuro vocês quiserem tudo sincronizado de verdade entre celulares
   (ex: os 3 atendentes veem os mesmos pedidos em tempo real), aí sim é
   preciso um banco de dados central (ex: Firebase) — me chama que eu
   preparo essa evolução.
   ========================================================================== */

(function(){
  'use strict';

  /* ========================================================================
     1. CONFIGURAÇÃO — edite estes valores com os dados reais do Espeto Livre.
        Isso também pode ser editado depois pelo painel Admin > Configurações,
        mas os valores abaixo são o que aparece na primeira visita.
     ======================================================================== */
  const CONFIG_PADRAO = {
    // Sobe esse número sempre que um dado essencial abaixo (endereço, whatsapp,
    // coordenadas etc.) for corrigido "de fábrica" — isso faz o navegador do
    // cliente atualizar esses campos automaticamente, sem precisar restaurar
    // tudo manualmente. Detalhes puramente administrativos (senha, cardápio
    // editado à mão etc.) não são afetados por essa versão.
    versaoConfig: 4,
    nomeLoja: 'Espeto Livre',
    tagline: 'Espetinho na brasa, do seu jeito',
    whatsapp: '5585991241960',            // WhatsApp real do Espeto Livre
    instagram: 'https://www.instagram.com/espetolivre/',
    facebook: '',
    enderecoTexto: 'Rua Dr. Zamenhof, 320 - Cocó, Fortaleza - CE, 60192-280',
    enderecoMapaBusca: 'Rua Dr. Zamenhof, 320 - Cocó, Fortaleza - CE, 60192-280', // usado no link do Google Maps
    enderecoLat: -3.7445113,   // coordenadas verificadas do local real no Google Maps
    enderecoLng: -38.4765676,  // ajuste se o pino não cair exatamente no endereço certo
    // link direto pro local verificado no Google Maps (mostra o nome "Espeto Livre" no pino,
    // em vez de só uma coordenada solta). Deixe em branco para usar coordenadas/endereço em texto.
    enderecoUrlGoogleMaps: 'https://www.google.com/maps/place/Espeto+Livre/@-3.7445113,-38.4765676,869m/data=!3m2!1e3!4b1!4m6!3m5!1s0x7c7470068e64bab:0x76af607d565973e6!8m2!3d-3.7445113!4d-38.4765676!16s%2Fg%2F11zgs2y1bw',
    // Horário estruturado por dia da semana (0=domingo ... 6=sábado). É a partir
    // disso que o site calcula sozinho se mostra "Aberto agora" ou "Fechado agora".
    // "fechamento" menor ou igual à "abertura" é interpretado como virada de noite
    // (ex.: abre 18:00, fecha 00:00 → fecha à meia-noite).
    horarios: [
      { dia: 0, nome: 'Domingo', aberto: true,  abertura: '17:00', fechamento: '22:00' },
      { dia: 1, nome: 'Segunda', aberto: true,  abertura: '18:00', fechamento: '23:00' },
      { dia: 2, nome: 'Terça',   aberto: true,  abertura: '18:00', fechamento: '23:00' },
      { dia: 3, nome: 'Quarta',  aberto: true,  abertura: '18:00', fechamento: '23:00' },
      { dia: 4, nome: 'Quinta',  aberto: true,  abertura: '18:00', fechamento: '23:00' },
      { dia: 5, nome: 'Sexta',   aberto: true,  abertura: '18:00', fechamento: '00:00' },
      { dia: 6, nome: 'Sábado',  aberto: true,  abertura: '18:00', fechamento: '00:00' }
    ],
    // --- Cálculo de frete ---
    precoGasolina: 6.43,     // R$ por litro — atualize sempre que o preço mudar
    consumoKmLitro: 12,      // km rodados por litro (moto de entrega)
    taxaBaseEntrega: 4.00,   // taxa fixa de saída, somada ao custo do combustível
    // --- Acesso ao admin (mesma tela de identificação do cliente) ---
    emailAdmin: 'brunokawamurapessoal@gmail.com', // e-mail cadastrado como admin
    senhaAdmin: 'espeto123'  // TROQUE essa senha! (Admin > Configurações > Segurança)
  };

  /* Cardápio inicial — edite livremente pelo painel Admin > Cardápio depois. */
  const PRODUTOS_PADRAO = [
    // Espetos de Carne
    { categoria: 'Espetos de Carne', nome: 'Espeto de Carne', descricao: 'Alcatra em cubos, tempero da casa', preco: 9.00, emoji: '🥩', disponivel: true },
    { categoria: 'Espetos de Carne', nome: 'Espeto de Picanha', descricao: 'Picanha nobre, ponto no carvão', preco: 14.00, emoji: '🥩', disponivel: true },
    { categoria: 'Espetos de Carne', nome: 'Espeto de Maminha', descricao: 'Maminha macia, suco na primeira mordida', preco: 12.00, emoji: '🥩', disponivel: true },
    { categoria: 'Espetos de Carne', nome: 'Carne com Bacon', descricao: 'Cubos de carne enrolados no bacon', preco: 11.00, emoji: '🥓', disponivel: true },
    { categoria: 'Espetos de Carne', nome: 'Kafta', descricao: 'Kafta temperada, receita da casa', preco: 10.00, emoji: '🍢', disponivel: true },

    // Espetos de Frango
    { categoria: 'Espetos de Frango', nome: 'Espeto de Frango', descricao: 'Peito de frango marinado e grelhado', preco: 8.00, emoji: '🍗', disponivel: true },
    { categoria: 'Espetos de Frango', nome: 'Medalhão de Frango c/ Bacon', descricao: 'Frango enrolado no bacon crocante', preco: 9.00, emoji: '🍗', disponivel: true },
    { categoria: 'Espetos de Frango', nome: 'Coração de Frango', descricao: 'Clássico de boteco, no ponto certo', preco: 8.00, emoji: '❤️', disponivel: true },
    { categoria: 'Espetos de Frango', nome: 'Frango com Catupiry', descricao: 'Frango recheado, derretendo por dentro', preco: 10.00, emoji: '🍗', disponivel: true },

    // Suínos & Embutidos
    { categoria: 'Suínos & Embutidos', nome: 'Linguiça Toscana', descricao: 'Linguiça artesanal na brasa', preco: 9.00, emoji: '🌭', disponivel: true },
    { categoria: 'Suínos & Embutidos', nome: 'Costelinha Suína', descricao: 'Costela suína, tempero defumado', preco: 11.00, emoji: '🍖', disponivel: true },
    { categoria: 'Suínos & Embutidos', nome: 'Bacon Enrolado', descricao: 'Bacon crocante puro no espeto', preco: 9.00, emoji: '🥓', disponivel: true },

    // Camarão & Peixe
    { categoria: 'Camarão & Peixe', nome: 'Espeto de Camarão', descricao: 'Camarão grande grelhado no ponto', preco: 16.00, emoji: '🍤', disponivel: true },
    { categoria: 'Camarão & Peixe', nome: 'Filé de Tilápia na Brasa', descricao: 'Filé fresco temperado e grelhado', preco: 14.00, emoji: '🐟', disponivel: true },

    // Vegetariano
    { categoria: 'Vegetariano', nome: 'Queijo Coalho', descricao: 'Queijo coalho tradicional na brasa', preco: 10.00, emoji: '🧀', disponivel: true },
    { categoria: 'Vegetariano', nome: 'Queijo Coalho com Melaço', descricao: 'Queijo coalho com melaço de cana', preco: 11.00, emoji: '🧀', disponivel: true },
    { categoria: 'Vegetariano', nome: 'Espeto de Legumes', descricao: 'Pimentão, cebola, abobrinha e tomate', preco: 8.00, emoji: '🥦', disponivel: true },
    { categoria: 'Vegetariano', nome: 'Abacaxi na Brasa', descricao: 'Abacaxi grelhado com canela', preco: 7.00, emoji: '🍍', disponivel: true },

    // Acompanhamentos
    { categoria: 'Acompanhamentos', nome: 'Farofa', descricao: 'Farofa temperada da casa', preco: 6.00, emoji: '🍚', disponivel: true },
    { categoria: 'Acompanhamentos', nome: 'Vinagrete', descricao: 'Vinagrete fresquinho', preco: 5.00, emoji: '🥗', disponivel: true },
    { categoria: 'Acompanhamentos', nome: 'Pão de Alho', descricao: 'Pão de alho na brasa, derretendo manteiga', preco: 7.00, emoji: '🥖', disponivel: true },
    { categoria: 'Acompanhamentos', nome: 'Baião de Dois', descricao: 'Arroz, feijão verde e queijo coalho', preco: 12.00, emoji: '🍛', disponivel: true },
    { categoria: 'Acompanhamentos', nome: 'Batata Frita', descricao: 'Porção crocante, serve bem 2 pessoas', preco: 14.00, emoji: '🍟', disponivel: true },
    { categoria: 'Acompanhamentos', nome: 'Arroz à Grega', descricao: 'Arroz com legumes salteados', preco: 10.00, emoji: '🍚', disponivel: true },

    // Bebidas
    { categoria: 'Bebidas', nome: 'Água Mineral', descricao: '500ml, com ou sem gás', preco: 4.00, emoji: '💧', disponivel: true },
    { categoria: 'Bebidas', nome: 'Refrigerante Lata', descricao: '350ml, sabores variados', preco: 6.00, emoji: '🥤', disponivel: true },
    { categoria: 'Bebidas', nome: 'Suco Natural', descricao: 'Feito na hora, pergunte o sabor do dia', preco: 8.00, emoji: '🧃', disponivel: true },
    { categoria: 'Bebidas', nome: 'Cerveja Long Neck', descricao: 'Long neck gelada', preco: 9.00, emoji: '🍺', disponivel: true },
    { categoria: 'Bebidas', nome: 'Cerveja Lata', descricao: 'Lata 350ml, geladíssima', preco: 7.00, emoji: '🍺', disponivel: true }
  ];

  /* Bairros de Fortaleza e Região Metropolitana com distância aproximada (km)
     em relação à loja. ESTES NÚMEROS SÃO ESTIMADOS — ajuste no painel Admin
     (aba "Entrega") com a distância real assim que souberem, pois eles
     definem o valor do frete cobrado do cliente. */
  const BAIRROS_PADRAO = [
    ['Centro', 3], ['Praia de Iracema', 4], ['Jacarecanga', 5], ['Moura Brasil', 4],
    ['Aldeota', 5], ['Meireles', 6], ['Varjota', 7], ['Dionísio Torres', 6],
    ['Joaquim Távora', 7], ['Bairro de Fátima', 5], ['Benfica', 4], ['Damas', 3],
    ['Montese', 5], ['Parquelândia', 6], ['Presidente Kennedy', 6], ['Rodolfo Teófilo', 6],
    ['Cocó', 9], ['Papicu', 8], ['Mucuripe', 8], ['Vicente Pinzon', 9],
    ['Luciano Cavalcante', 10], ['Cambeba', 11], ['Sapiranga', 12], ['Guararapes', 13],
    ['Água Fria', 8], ['Bom Jardim', 10], ['Barra do Ceará', 9], ['Vila Velha', 8],
    ['Antônio Bezerra', 7], ['Parangaba', 9], ['Maraponga', 11], ['Messejana', 14],
    ['Jangurussu', 15], ['Barroso', 16], ['Cidade dos Funcionários', 12], ['Edson Queiroz', 13],
    ['Passaré', 14], ['Cajazeiras', 15], ['Genibaú', 12], ['Cidade 2000', 10],
    ['Praia do Futuro', 12], ['José de Alencar', 13],
    ['Caucaia (RMF)', 20], ['Maracanaú (RMF)', 18], ['Eusébio (RMF)', 17],
    ['Aquiraz (RMF)', 25], ['Itaitinga (RMF)', 22], ['Pacatuba (RMF)', 19],
    ['Maranguape (RMF)', 24], ['Horizonte (RMF)', 30]
  ].map(([nome, distanciaKm]) => ({ nome, distanciaKm }));

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

  function formatarDataCurta(isoData){
    const [ano, mes, dia] = isoData.split('-');
    return `${dia}/${mes}`;
  }

  function gerarId(prefixo){
    return (prefixo || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
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

  /* Redimensiona e comprime uma imagem no próprio navegador antes de salvar,
     já que aqui não existe servidor: a foto vira um data URL (base64) salvo
     junto com o produto no localStorage. Mantém arquivos pequenos (~30-80KB). */
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
     3. CAMADA DE DADOS (localStorage)
     ======================================================================== */
  const CHAVES = {
    produtos: 'espetolivre_produtos',
    bairros: 'espetolivre_bairros',
    config: 'espetolivre_config',
    pedidos: 'espetolivre_pedidos',
    clientes: 'espetolivre_clientes',
    insumos: 'espetolivre_insumos',
    fichasTecnicas: 'espetolivre_fichas_tecnicas'
  };

  function obter(chave, padrao){
    try{
      const bruto = localStorage.getItem(chave);
      if (!bruto) return padrao;
      return JSON.parse(bruto);
    }catch(e){
      console.error('Erro ao ler', chave, e);
      return padrao;
    }
  }
  function salvar(chave, valor){
    try{
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    }catch(e){
      console.error('Erro ao salvar', chave, e);
      mostrarToast('Não foi possível salvar. Armazenamento cheio ou indisponível.');
      return false;
    }
  }

  function inicializarDados(){
    if (!localStorage.getItem(CHAVES.produtos)){
      const comId = PRODUTOS_PADRAO.map(p => Object.assign({ id: gerarId('prod') }, p));
      salvar(CHAVES.produtos, comId);
    }
    if (!localStorage.getItem(CHAVES.bairros)){
      const comId = BAIRROS_PADRAO.map(b => Object.assign({ id: gerarId('bai') }, b));
      salvar(CHAVES.bairros, comId);
    }
    if (!localStorage.getItem(CHAVES.config)){
      salvar(CHAVES.config, CONFIG_PADRAO);
    } else {
      // mescla configs novas que não existiam em versões antigas salvas
      const atual = obter(CHAVES.config, {});
      // migração: versões antigas guardavam horário como texto livre (sem "aberto"/"abertura").
      // Se detectar esse formato antigo, substitui pela estrutura semanal nova.
      if (!Array.isArray(atual.horarios) || !atual.horarios.length || atual.horarios[0].abertura === undefined){
        atual.horarios = CONFIG_PADRAO.horarios;
      }
      // migração por versão: atualiza campos essenciais que ainda estejam com o
      // valor antigo "de fábrica" — não mexe em nada que o admin já tenha
      // editado manualmente para um valor diferente do padrão antigo.
      const versaoSalva = atual.versaoConfig || 1;
      if (versaoSalva < CONFIG_PADRAO.versaoConfig){
        const PADROES_ANTIGOS = {
          enderecoTexto: 'Fortaleza - CE',
          enderecoMapaBusca: 'Espeto Livre, Fortaleza - CE',
          whatsapp: '5585990000000',
          emailAdmin: 'admin@espetolivre.com.br'
        };
        Object.keys(PADROES_ANTIGOS).forEach(campo => {
          if (atual[campo] === PADROES_ANTIGOS[campo]) atual[campo] = CONFIG_PADRAO[campo];
        });
        // coordenadas antigas (estimadas por CEP) trocadas pelas coordenadas
        // reais e verificadas do local no Google Maps
        if (atual.enderecoLat === -3.7450151) atual.enderecoLat = CONFIG_PADRAO.enderecoLat;
        if (atual.enderecoLng === -38.4766572) atual.enderecoLng = CONFIG_PADRAO.enderecoLng;
        if (typeof atual.enderecoLat !== 'number') atual.enderecoLat = CONFIG_PADRAO.enderecoLat;
        if (typeof atual.enderecoLng !== 'number') atual.enderecoLng = CONFIG_PADRAO.enderecoLng;
        atual.versaoConfig = CONFIG_PADRAO.versaoConfig;
      }
      salvar(CHAVES.config, Object.assign({}, CONFIG_PADRAO, atual));
    }
    if (!localStorage.getItem(CHAVES.pedidos)) salvar(CHAVES.pedidos, []);
    if (!localStorage.getItem(CHAVES.clientes)) salvar(CHAVES.clientes, {});
    if (!localStorage.getItem(CHAVES.insumos)) salvar(CHAVES.insumos, []);
    if (!localStorage.getItem(CHAVES.fichasTecnicas)) salvar(CHAVES.fichasTecnicas, {});
  }

  const Dados = {
    getProdutos: () => obter(CHAVES.produtos, []),
    salvarProdutos: (lista) => salvar(CHAVES.produtos, lista),
    getBairros: () => obter(CHAVES.bairros, []),
    salvarBairros: (lista) => salvar(CHAVES.bairros, lista),
    getConfig: () => obter(CHAVES.config, CONFIG_PADRAO),
    salvarConfig: (cfg) => salvar(CHAVES.config, cfg),
    getPedidos: () => obter(CHAVES.pedidos, []),
    salvarPedidos: (lista) => salvar(CHAVES.pedidos, lista),
    getClientes: () => obter(CHAVES.clientes, {}),
    salvarClientes: (obj) => salvar(CHAVES.clientes, obj),
    getInsumos: () => obter(CHAVES.insumos, []),
    salvarInsumos: (lista) => salvar(CHAVES.insumos, lista),
    getFichasTecnicas: () => obter(CHAVES.fichasTecnicas, {}),
    salvarFichasTecnicas: (obj) => salvar(CHAVES.fichasTecnicas, obj)
  };

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

  /* Deduz do estoque os insumos usados por uma lista de itens vendidos
     (chamado ao finalizar um pedido). Retorna a lista de insumos atualizada
     — quem chamar é responsável por persistir com Dados.salvarInsumos(). */
  function deduzirEstoquePorVenda(itensVendidos, produtos, fichas, insumos){
    const mapaProdutoPorNome = {};
    produtos.forEach(p => { mapaProdutoPorNome[p.nome] = p; });
    const insumosAtualizados = insumos.map(i => Object.assign({}, i));
    const mapaInsumos = {};
    insumosAtualizados.forEach(i => { mapaInsumos[i.id] = i; });

    itensVendidos.forEach(itemVendido => {
      const produto = mapaProdutoPorNome[itemVendido.nome];
      if (!produto) return;
      const ficha = fichas[produto.id];
      if (!ficha) return;
      ficha.forEach(entrada => {
        const insumo = mapaInsumos[entrada.insumoId];
        if (!insumo) return;
        insumo.estoqueAtual = (insumo.estoqueAtual || 0) - (entrada.quantidade || 0) * itemVendido.qtd;
      });
    });
    return insumosAtualizados;
  }

  /* Calcula o frete com base na distância do bairro escolhido.
     fórmula: taxa fixa + (ida e volta * distância * preço do combustível / consumo)
     arredondado para cima, de 50 em 50 centavos. */
  function calcularFrete(distanciaKm, config){
    const cfg = config || Dados.getConfig();
    const custoCombustivel = (distanciaKm * 2 * cfg.precoGasolina) / (cfg.consumoKmLitro || 12);
    const bruto = (cfg.taxaBaseEntrega || 0) + custoCombustivel;
    return Math.ceil(bruto * 2) / 2; // arredonda para cima, múltiplo de R$0,50
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

  /* Junta o que está salvo na sessão (nome/telefone/email do login atual) com
     o cadastro persistido do cliente (que pode ter endereço salvo de pedidos
     ou edições anteriores no perfil). O cadastro persistido tem prioridade
     nos campos extras, já que é a fonte mais completa/atualizada. */
  function obterIdentificacaoAtual(){
    try{
      const bruto = sessionStorage.getItem('espetolivre_identificacao');
      if (!bruto) return null;
      const sessao = JSON.parse(bruto);
      const clientes = Dados.getClientes();
      const perfil = clientes[sessao.telefone];
      return perfil ? Object.assign({}, sessao, perfil) : sessao;
    }catch(e){ return null; }
  }

  function renderizarAreaCliente(){
    const area = $('#area-cliente');
    if (!area) return;
    const id = obterIdentificacaoAtual();
    if (!id){
      area.hidden = true;
      return;
    }
    area.hidden = false;
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
      sessionStorage.removeItem('espetolivre_identificacao');
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
      this.iniciarIdentificacao();

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
    },
    salvarCarrinhoSessao(){
      try{ sessionStorage.setItem('espetolivre_carrinho_sessao', JSON.stringify(this.carrinho)); }catch(e){}
    },

    iniciarIdentificacao(){
      const salvo = obterIdentificacaoAtual();
      if (salvo){
        this.identificacao = salvo;
        this.fecharGate();
      } else {
        this.abrirGate();
      }
      this.ligarGateIdentificacao();
    },

    abrirGate(prefill){
      const portal = $('#portal-identificacao');
      if (!portal) return;
      portal.classList.remove('fechado');
      document.body.classList.add('trava-scroll');
      if (prefill && this.identificacao){
        $('#campo-id-nome').value = this.identificacao.nome;
        $('#campo-id-telefone').value = formatarTelefone(this.identificacao.telefone);
      }
      setTimeout(() => $('#campo-id-nome')?.focus(), 250);
    },

    fecharGate(){
      const portal = $('#portal-identificacao');
      if (!portal) return;
      portal.classList.add('fechado');
      document.body.classList.remove('trava-scroll');
    },

    ligarGateIdentificacao(){
      const form = $('#form-identificacao-cliente');
      const campoEmail = $('#campo-id-email');
      const blocoSenha = $('#bloco-id-senha');
      const campoSenha = $('#campo-id-senha');
      const campoTelefone = $('#campo-id-telefone');
      const btnEnviar = $('#btn-enviar-identificacao');
      const legenda = $('#legenda-identificacao');

      const verificarModoAdmin = () => {
        const cfg = Dados.getConfig();
        const email = (campoEmail?.value || '').trim().toLowerCase();
        const ehAdmin = !!email && email === (cfg.emailAdmin || '').toLowerCase();
        if (blocoSenha) blocoSenha.hidden = !ehAdmin;
        if (campoTelefone) campoTelefone.required = !ehAdmin;
        if (btnEnviar) btnEnviar.textContent = ehAdmin ? 'Entrar no admin 🔐' : 'Começar meu pedido 🍢';
        if (legenda) legenda.textContent = ehAdmin
          ? 'E-mail de administrador reconhecido — informe sua senha para entrar no painel.'
          : 'Antes de montar seu pedido, precisamos do seu nome — é ele que vai ser chamado no balcão na hora da retirada ou entrega.';
        return ehAdmin;
      };

      campoEmail?.addEventListener('input', verificarModoAdmin);

      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const cfg = Dados.getConfig();
        const nome = $('#campo-id-nome').value.trim();
        const email = (campoEmail?.value || '').trim();
        const erro = $('#erro-identificacao');
        const ehAdmin = verificarModoAdmin();

        if (nome.length < 2){
          erro.textContent = 'Preencha seu nome.';
          erro.classList.add('visivel');
          return;
        }

        if (ehAdmin){
          const senha = campoSenha.value;
          if (senha !== cfg.senhaAdmin){
            erro.textContent = 'Senha incorreta. Tente novamente.';
            erro.classList.add('visivel');
            return;
          }
          erro.classList.remove('visivel');
          sessionStorage.setItem('espetolivre_admin_logado', '1');
          window.location.href = 'pages/admin.html';
          return;
        }

        const telefone = somenteDigitos($('#campo-id-telefone').value);
        if (telefone.length < 10){
          erro.textContent = 'Informe um WhatsApp válido com DDD.';
          erro.classList.add('visivel');
          return;
        }
        erro.classList.remove('visivel');
        sessionStorage.setItem('espetolivre_identificacao', JSON.stringify({ nome, telefone, email }));

        // guarda também no cadastro de clientes, preservando dados já salvos (ex: endereço)
        const clientes = Dados.getClientes();
        const registroExistente = clientes[telefone] || {};
        clientes[telefone] = Object.assign({}, registroExistente, { nome, telefone, email: email || registroExistente.email || '' });
        Dados.salvarClientes(clientes);
        sessionStorage.setItem('espetolivre_ultimo_tel', telefone);

        this.identificacao = obterIdentificacaoAtual();
        this.fecharGate();
        renderizarAreaCliente();
      });

      campoTelefone?.addEventListener('input', (e) => {
        e.target.value = formatarTelefone(e.target.value);
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
      const emojisCategoria = { 'Espetos de Carne':'🔥', 'Espetos de Frango':'🍗', 'Suínos & Embutidos':'🐷', 'Camarão & Peixe':'🦐', 'Vegetariano':'🌿', 'Acompanhamentos':'🍽️', 'Bebidas':'🥤' };

      container.innerHTML = this.categorias.map(cat => {
        const itens = this.produtos.filter(p => p.categoria === cat);
        return `
          <section class="secao-cardapio" id="cat-${slugify(cat)}">
            <div class="cabecalho-categoria">
              <h2>${emojisCategoria[cat] || '🍢'} ${escapar(cat)}</h2>
            </div>
            <div class="divisor-espeto"><div class="pedacos"><span></span><span></span><span></span><span></span><span></span></div></div>
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
            <div class="linha-topo">
              <h3>${escapar(p.nome)}</h3>
              <span class="preco">${formatarMoeda(p.preco)}</span>
            </div>
            <p class="descricao">${escapar(p.descricao || '')}</p>
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
        this.carrinho.push({ chave, produtoId: produto.id, nome: produto.nome, preco: produto.preco, qtd, obs });
      }
      this.salvarCarrinhoSessao();
    },

    subtotal(){
      return this.carrinho.reduce((s,i) => s + i.preco * i.qtd, 0);
    },

    atualizarCarrinhoUI(){
      const totalItens = this.carrinho.reduce((s,i)=>s+i.qtd,0);
      $$('.contagem-carrinho').forEach(el => el.textContent = totalItens);
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
            <div class="info">
              <div class="nome">${i.qtd}x ${escapar(i.nome)}</div>
              ${i.obs ? `<div class="obs">"${escapar(i.obs)}"</div>` : ''}
              <div class="preco-unit">${formatarMoeda(i.preco)} un.</div>
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
        this.etapaAtual = 1;
        this.mostrarEtapa(1);
        modal.classList.add('aberto');
        overlay.classList.add('aberto');
        $('#painel-carrinho')?.classList.remove('aberto');
      });
      $$('.fechar-modal').forEach(b => b.addEventListener('click', () => this.fecharCheckout()));

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

      // Pagamento
      $$('.opcao-pagamento').forEach(op => {
        op.addEventListener('click', () => {
          $$('.opcao-pagamento').forEach(o => o.classList.remove('selecionada'));
          op.classList.add('selecionada');
          $('#opcao-' + op.dataset.forma).checked = true;
          $('#campo-troco').hidden = op.dataset.forma !== 'dinheiro';
        });
      });

      $('#btn-entrega-continuar')?.addEventListener('click', () => this.validarEAvancarEntrega());
      $('#btn-revisao-voltar')?.addEventListener('click', () => this.mostrarEtapa(1));
      $('#btn-enviar-pedido')?.addEventListener('click', () => this.finalizarPedido());
      $('#btn-novo-pedido')?.addEventListener('click', () => { this.fecharCheckout(); window.location.reload(); });
    },

    mostrarEtapa(n){
      this.etapaAtual = n;
      $$('.etapa-checkout').forEach(el => el.hidden = Number(el.dataset.etapa) !== n);
      $$('.progresso-etapas span').forEach((el, i) => el.classList.toggle('feita', i < n));
      if (n === 2) this.montarResumoFinal();
    },

    atualizarResumoFrete(){
      const selectBairro = $('#select-bairro');
      const bairros = Dados.getBairros();
      const bairro = bairros.find(b => b.id === selectBairro.value);
      const aviso = $('#aviso-frete');
      if (!bairro){ aviso.hidden = true; this.freteAtual = 0; return; }
      const cfg = Dados.getConfig();
      const frete = calcularFrete(bairro.distanciaKm, cfg);
      this.freteAtual = frete;
      this.bairroAtual = bairro;
      aviso.hidden = false;
      aviso.innerHTML = `Frete para <strong>${escapar(bairro.nome)}</strong> (~${bairro.distanciaKm} km): <strong>${formatarMoeda(frete)}</strong>`;
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
      this.mostrarEtapa(2);
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

    finalizarPedido(){
      const cfg = Dados.getConfig();
      const nome = this.identificacao?.nome || '';
      const telefone = this.identificacao?.telefone || '';
      const telefoneFormatado = formatarTelefone(telefone);
      const formaPagamento = $('input[name="pagamento"]:checked')?.value || 'Não informado';
      const trocoPara = formaPagamento === 'dinheiro' ? $('#campo-troco-valor').value.trim() : '';
      const obsGerais = $('#campo-obs-gerais').value.trim();

      const endereco = this.tipoEntrega === 'delivery' ? {
        bairro: this.bairroAtual?.nome || '',
        rua: $('#campo-rua').value.trim(),
        numero: $('#campo-numero').value.trim(),
        complemento: $('#campo-complemento').value.trim(),
        referencia: $('#campo-referencia').value.trim()
      } : null;

      const subtotal = this.subtotal();
      const frete = this.tipoEntrega === 'delivery' ? (this.freteAtual || 0) : 0;
      const total = subtotal + frete;

      // calcula o custo de cada item no momento da venda (via ficha técnica),
      // pra que o lucro histórico não mude depois se o custo do insumo for atualizado
      const fichas = Dados.getFichasTecnicas();
      const insumosAtuais = Dados.getInsumos();
      const itensComCusto = this.carrinho.map(i => ({
        nome: i.nome, preco: i.preco, qtd: i.qtd, obs: i.obs,
        custoUnitario: calcularCustoProduto(i.produtoId, fichas, insumosAtuais)
      }));

      const pedido = {
        id: gerarId('pedido'),
        numero: Math.floor(1000 + Math.random()*9000),
        dataHora: new Date().toISOString(),
        cliente: { nome, telefone },
        tipoEntrega: this.tipoEntrega,
        endereco,
        itens: itensComCusto,
        observacoesGerais: obsGerais,
        pagamento: { forma: formaPagamento, trocoPara },
        subtotal, frete, total,
        status: 'novo'
      };

      // salva o pedido localmente (para o admin conseguir ver o histórico neste aparelho)
      const pedidos = Dados.getPedidos();
      pedidos.unshift(pedido);
      Dados.salvarPedidos(pedidos);

      // desconta do estoque os insumos usados nesta venda, conforme a ficha técnica
      const insumosAtualizados = deduzirEstoquePorVenda(itensComCusto, this.produtos, fichas, insumosAtuais);
      Dados.salvarInsumos(insumosAtualizados);

      // salva/atualiza o cadastro do cliente para agilizar o próximo pedido,
      // preservando dados já existentes (ex: e-mail) e guardando o endereço
      // de entrega no perfil para facilitar pedidos futuros
      const clientes = Dados.getClientes();
      const registroExistente = clientes[telefone] || {};
      const novoRegistro = Object.assign({}, registroExistente, { nome, telefone });
      if (this.tipoEntrega === 'delivery' && endereco) novoRegistro.endereco = endereco;
      clientes[telefone] = novoRegistro;
      Dados.salvarClientes(clientes);
      sessionStorage.setItem('espetolivre_ultimo_tel', telefone);
      renderizarAreaCliente();

      // monta a mensagem do WhatsApp — é isso que garante que o pedido chega
      // na hora, independente de sincronismo entre aparelhos
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
      if (this.tipoEntrega === 'delivery'){
        linhas.push('*Entrega:* Delivery');
        linhas.push(`${endereco.rua}, ${endereco.numero}${endereco.complemento ? ' - '+endereco.complemento : ''}`);
        linhas.push(`Bairro: ${endereco.bairro}`);
        if (endereco.referencia) linhas.push(`Referência: ${endereco.referencia}`);
      } else {
        linhas.push('*Entrega:* Retirada no local');
      }
      linhas.push('');
      linhas.push(`*Pagamento:* ${rotuloPagamento(formaPagamento)}${trocoPara ? ` (troco para ${formatarMoeda(trocoPara)})` : ''}`);
      if (obsGerais) linhas.push(`*Observações gerais:* ${obsGerais}`);
      linhas.push('');
      linhas.push(`*Subtotal:* ${formatarMoeda(subtotal)}`);
      if (frete > 0) linhas.push(`*Frete:* ${formatarMoeda(frete)}`);
      linhas.push(`*TOTAL: ${formatarMoeda(total)}*`);

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

    salvarEdicao(e){
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

      const clientes = Dados.getClientes();
      const telefoneAntigo = this.identificacao.telefone;
      const registroAtual = clientes[telefoneAntigo] || {};
      const novoRegistro = Object.assign({}, registroAtual, { nome, telefone: telefoneNovo, email, endereco });

      if (telefoneNovo !== telefoneAntigo) delete clientes[telefoneAntigo];
      clientes[telefoneNovo] = novoRegistro;
      Dados.salvarClientes(clientes);

      sessionStorage.setItem('espetolivre_identificacao', JSON.stringify({ nome, telefone: telefoneNovo, email }));
      sessionStorage.setItem('espetolivre_ultimo_tel', telefoneNovo);

      this.identificacao = novoRegistro;
      this.renderizarDados();
      this.sairModoEdicao();
      renderizarAreaCliente();
      mostrarToast('Dados atualizados com sucesso!');
    },

    renderizarHistorico(){
      const telefone = this.identificacao.telefone;
      const pedidos = Dados.getPedidos()
        .filter(p => p.cliente.telefone === telefone)
        .sort((a,b) => new Date(b.dataHora) - new Date(a.dataHora));

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
    formInsumoLigado: false,
    formFichaLigado: false,
    receitaSubNavLigado: false,
    graficoEvolucao: null,
    graficoProdutos: null,

    iniciar(){
      if (!$('#app-admin')) return;
      this.ligarLogin();
      if (sessionStorage.getItem('espetolivre_admin_logado') === '1'){
        this.entrar();
      }
    },

    ligarLogin(){
      const form = $('#form-login-admin');
      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('#campo-email-admin').value.trim().toLowerCase();
        const senha = $('#campo-senha-admin').value;
        const cfg = Dados.getConfig();
        if (email === (cfg.emailAdmin || '').toLowerCase() && senha === cfg.senhaAdmin){
          sessionStorage.setItem('espetolivre_admin_logado', '1');
          this.entrar();
        } else {
          $('#erro-login-admin').classList.add('visivel');
        }
      });
    },

    entrar(){
      $('.tela-login-admin').style.display = 'none';
      $('#app-admin').classList.add('visivel');
      this.ligarNavegacao();
      this.ligarSair();
      this.renderizarPainel();
      this.renderizarCardapio();
      this.renderizarPedidos();
      this.renderizarEntrega();
      this.renderizarReceita();
      this.renderizarConfiguracoes();
      this.mostrarAba('painel');
    },

    ligarSair(){
      $('#btn-sair-admin')?.addEventListener('click', () => {
        sessionStorage.removeItem('espetolivre_admin_logado');
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
        const lista = Dados.getProdutos();
        const item = lista.find(p => p.id === chk.dataset.id);
        if (item){ item.disponivel = chk.checked; Dados.salvarProdutos(lista); mostrarToast(item.disponivel ? 'Produto disponível' : 'Produto marcado como indisponível'); this.renderizarPainel(); }
      }));
      $$('.btn-editar-produto', tbody).forEach(btn => btn.addEventListener('click', () => this.abrirFormProduto(btn.dataset.id)));
      $$('.btn-excluir-produto', tbody).forEach(btn => btn.addEventListener('click', () => {
        if (!confirm('Excluir este produto do cardápio?')) return;
        const lista = Dados.getProdutos().filter(p => p.id !== btn.dataset.id);
        Dados.salvarProdutos(lista);
        this.renderizarCardapio(); this.renderizarPainel();
        mostrarToast('Produto excluído.');
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
      } else {
        $('#titulo-form-produto').textContent = 'Novo produto';
        $('#form-produto').reset();
        $('#campo-produto-disponivel').checked = true;
        this.fotoProdutoAtual = null;
      }

      if (this.fotoProdutoAtual){
        $('#preview-foto-produto-img').src = this.fotoProdutoAtual;
        $('#preview-foto-produto').hidden = false;
      } else {
        $('#preview-foto-produto').hidden = true;
        $('#preview-foto-produto-img').src = '';
      }
    },
    fecharFormProduto(){
      $('#painel-form-produto').hidden = true;
      this.editandoProdutoId = null;
      this.fotoProdutoAtual = null;
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
      const lista = Dados.getProdutos();
      if (this.editandoProdutoId){
        const item = lista.find(p=>p.id===this.editandoProdutoId);
        Object.assign(item, dados);
      } else {
        lista.push(Object.assign({ id: gerarId('prod') }, dados));
      }
      Dados.salvarProdutos(lista);
      this.fecharFormProduto();
      this.renderizarCardapio();
      this.renderizarPainel();
      mostrarToast('Cardápio atualizado!');
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

      $$('.select-status-pedido', tbody).forEach(sel => sel.addEventListener('change', () => {
        const lista = Dados.getPedidos();
        const pedido = lista.find(p=>p.id===sel.dataset.id);
        if (pedido){ pedido.status = sel.value; Dados.salvarPedidos(lista); this.renderizarPainel(); mostrarToast('Status do pedido #' + pedido.numero + ' atualizado.'); }
      }));
      $$('.btn-ver-pedido', tbody).forEach(btn => btn.addEventListener('click', () => {
        const linha = $(`.linha-detalhe[data-detalhe-de="${btn.dataset.id}"]`);
        if (linha) linha.hidden = !linha.hidden;
      }));

      $$('.filtros-chip button').forEach(btn => btn.addEventListener('click', () => {
        $$('.filtros-chip button').forEach(b=>b.classList.remove('ativa'));
        btn.classList.add('ativa');
        this.filtroStatusPedido = btn.dataset.status;
        this.renderizarPedidos();
      }));
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
        Dados.salvarBairros(Dados.getBairros().filter(b=>b.id!==btn.dataset.id));
        this.renderizarEntrega();
        mostrarToast('Bairro removido.');
      }));

      $('#campo-preco-gasolina').value = cfg.precoGasolina;
      $('#campo-consumo-km').value = cfg.consumoKmLitro;
      $('#campo-taxa-base').value = cfg.taxaBaseEntrega;

      $('#form-parametros-frete')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const cfgAtual = Dados.getConfig();
        cfgAtual.precoGasolina = parseFloat($('#campo-preco-gasolina').value) || 0;
        cfgAtual.consumoKmLitro = parseFloat($('#campo-consumo-km').value) || 1;
        cfgAtual.taxaBaseEntrega = parseFloat($('#campo-taxa-base').value) || 0;
        Dados.salvarConfig(cfgAtual);
        this.renderizarEntrega();
        mostrarToast('Parâmetros de frete atualizados!');
      });

      $('#btn-novo-bairro')?.addEventListener('click', () => this.abrirFormBairro(null));
      $('#form-bairro')?.addEventListener('submit', (e) => this.salvarFormBairro(e));
      $('#btn-cancelar-bairro')?.addEventListener('click', () => { $('#painel-form-bairro').hidden = true; });
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
      const lista = Dados.getBairros();
      if (this.editandoBairroId){
        const item = lista.find(b=>b.id===this.editandoBairroId);
        item.nome = nome; item.distanciaKm = distanciaKm;
      } else {
        lista.push({ id: gerarId('bai'), nome, distanciaKm });
      }
      Dados.salvarBairros(lista);
      $('#painel-form-bairro').hidden = true;
      this.renderizarEntrega();
      mostrarToast('Bairro salvo!');
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

      pedidos.forEach(p => {
        const diaChave = p.dataHora.slice(0,10);
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
        }
        porDia[diaChave].lucro = porDia[diaChave].faturamento - porDia[diaChave].custo;
      });

      const lucroTotal = faturamentoTotal - custoTotalConhecido;
      const margemMedia = faturamentoTotal > 0 ? (lucroTotal / faturamentoTotal) * 100 : null;

      const ranking = Object.values(porProduto).map(p => {
        const lucro = p.faturamento - p.custo;
        return Object.assign({}, p, { lucro, margem: p.faturamento > 0 ? (lucro / p.faturamento) * 100 : null });
      }).sort((a,b) => b.lucro - a.lucro);

      return { porDia, porProduto: ranking, faturamentoTotal, custoTotalConhecido, lucroTotal, margemMedia, temCustoDesconhecido };
    },

    renderizarReceitaPainel(){
      const { inicio, fim } = this.obterIntervaloPeriodo(this.periodoReceita);
      const pedidos = Dados.getPedidos().filter(p => {
        if (p.status === 'cancelado') return false;
        const d = new Date(p.dataHora);
        return d >= inicio && d <= fim;
      });

      const dados = this.calcularDadosReceita(pedidos);

      $('#metrica-receita-faturamento').textContent = formatarMoeda(dados.faturamentoTotal);
      $('#metrica-receita-custo').textContent = formatarMoeda(dados.custoTotalConhecido);
      $('#metrica-receita-lucro').textContent = formatarMoeda(dados.lucroTotal);
      $('#metrica-receita-margem').textContent = dados.margemMedia != null ? formatarNumero(dados.margemMedia) + '%' : '—';
      $('#aviso-custo-incompleto').hidden = !dados.temCustoDesconhecido;

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
        Dados.salvarInsumos(Dados.getInsumos().filter(i => i.id !== btn.dataset.id));
        const fichas = Dados.getFichasTecnicas();
        Object.keys(fichas).forEach(produtoId => {
          fichas[produtoId] = fichas[produtoId].filter(item => item.insumoId !== btn.dataset.id);
        });
        Dados.salvarFichasTecnicas(fichas);
        this.renderizarInsumos();
        this.atualizarSelectsFicha();
        mostrarToast('Insumo excluído.');
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
      const lista = Dados.getInsumos();
      if (this.editandoInsumoId){
        Object.assign(lista.find(i=>i.id===this.editandoInsumoId), dados);
      } else {
        lista.push(Object.assign({ id: gerarId('insumo') }, dados));
      }
      Dados.salvarInsumos(lista);
      this.fecharFormInsumo();
      this.renderizarInsumos();
      this.atualizarSelectsFicha();
      mostrarToast('Insumo salvo!');
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
        const fichasAtuais = Dados.getFichasTecnicas();
        fichasAtuais[produtoId].splice(idx, 1);
        Dados.salvarFichasTecnicas(fichasAtuais);
        this.renderizarListaFicha();
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

      const fichas = Dados.getFichasTecnicas();
      if (!fichas[produtoId]) fichas[produtoId] = [];
      const existente = fichas[produtoId].find(item => item.insumoId === insumoId);
      if (existente){
        existente.quantidade = quantidade;
      } else {
        fichas[produtoId].push({ insumoId, quantidade });
      }
      Dados.salvarFichasTecnicas(fichas);
      $('#campo-ficha-insumo').value = '';
      $('#campo-ficha-quantidade').value = '';
      this.renderizarListaFicha();
      mostrarToast('Insumo adicionado à ficha técnica!');
    },

    /* ---- Configurações gerais ---- */
    renderizarConfiguracoes(){
      const cfg = Dados.getConfig();
      if (!$('#form-config-loja')) return;
      $('#cfg-nome-loja').value = cfg.nomeLoja;
      $('#cfg-tagline').value = cfg.tagline;
      $('#cfg-whatsapp').value = cfg.whatsapp;
      $('#cfg-instagram').value = cfg.instagram;
      $('#cfg-facebook').value = cfg.facebook;
      $('#cfg-endereco-texto').value = cfg.enderecoTexto;
      $('#cfg-endereco-mapa').value = cfg.enderecoMapaBusca;
      $('#cfg-endereco-url-maps').value = cfg.enderecoUrlGoogleMaps || '';
      $('#cfg-endereco-lat').value = typeof cfg.enderecoLat === 'number' ? cfg.enderecoLat : '';
      $('#cfg-endereco-lng').value = typeof cfg.enderecoLng === 'number' ? cfg.enderecoLng : '';

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
        const novoCfg = Dados.getConfig();
        novoCfg.nomeLoja = $('#cfg-nome-loja').value.trim();
        novoCfg.tagline = $('#cfg-tagline').value.trim();
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
        Dados.salvarConfig(novoCfg);
        mostrarToast('Dados da loja atualizados!');
      });

      $('#cfg-email-admin-novo').value = cfg.emailAdmin;

      $('#form-config-senha')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const senhaAtual = $('#cfg-senha-atual').value;
        const novoEmail = $('#cfg-email-admin-novo').value.trim();
        const novaSenha = $('#cfg-senha-nova').value;
        const cfgAtual = Dados.getConfig();
        if (senhaAtual !== cfgAtual.senhaAdmin){ mostrarToast('Senha atual incorreta.'); return; }
        if (!novoEmail || !novoEmail.includes('@')){ mostrarToast('Informe um e-mail válido.'); return; }
        if (novaSenha && novaSenha.length < 4){ mostrarToast('A nova senha deve ter ao menos 4 caracteres.'); return; }
        cfgAtual.emailAdmin = novoEmail;
        if (novaSenha) cfgAtual.senhaAdmin = novaSenha;
        Dados.salvarConfig(cfgAtual);
        $('#cfg-senha-atual').value = '';
        $('#cfg-senha-nova').value = '';
        mostrarToast('Dados de segurança atualizados com sucesso!');
      });

      // Backup / restauração
      $('#btn-exportar-dados')?.addEventListener('click', () => {
        const tudo = {
          produtos: Dados.getProdutos(),
          bairros: Dados.getBairros(),
          config: Dados.getConfig(),
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

      $('#input-importar-dados')?.addEventListener('change', (e) => {
        const arquivo = e.target.files[0];
        if (!arquivo) return;
        const leitor = new FileReader();
        leitor.onload = () => {
          try{
            const dados = JSON.parse(leitor.result);
            if (dados.produtos) Dados.salvarProdutos(dados.produtos);
            if (dados.bairros) Dados.salvarBairros(dados.bairros);
            if (dados.config) Dados.salvarConfig(dados.config);
            if (dados.pedidos) Dados.salvarPedidos(dados.pedidos);
            if (dados.clientes) Dados.salvarClientes(dados.clientes);
            mostrarToast('Dados importados com sucesso! Recarregando...');
            setTimeout(()=>window.location.reload(), 1200);
          }catch(err){
            mostrarToast('Arquivo inválido. Verifique se é um backup do Espeto Livre.');
          }
        };
        leitor.readAsText(arquivo);
      });

      $('#btn-restaurar-fabrica')?.addEventListener('click', () => {
        const ok = confirm('Isso vai apagar TODOS os dados salvos neste navegador (cardápio, bairros, pedidos, clientes, configurações) e recarregar os valores originais do site. Essa ação não pode ser desfeita. Deseja continuar?');
        if (!ok) return;
        Object.values(CHAVES).forEach(chave => localStorage.removeItem(chave));
        sessionStorage.clear();
        mostrarToast('Dados restaurados! Recarregando...');
        setTimeout(() => { window.location.href = '../index.html'; }, 1000);
      });
    }
  };

  function rotuloStatus(s){
    return { novo:'Novo', preparando:'Preparando', pronto:'Pronto', entregue:'Entregue', cancelado:'Cancelado' }[s] || s;
  }

  /* ========================================================================
     7. INICIALIZAÇÃO GERAL
     ======================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    inicializarDados();
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
