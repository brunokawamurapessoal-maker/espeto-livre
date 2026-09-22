/* ==========================================================================
   ESPETO LIVRE — banco.js
   --------------------------------------------------------------------------
   Camada de dados: conversa com o Supabase (PostgreSQL + Auth + Storage +
   Realtime) e entrega ao resto do site (scripts.js) uma API simples.

   Como funciona:
   - Os dados ficam num cache em memória. `Banco.dados.getX()` lê do cache
     (síncrono, devolve uma CÓPIA — pode alterar à vontade).
   - `Banco.dados.salvarX(lista)` compara com o que já está no banco e grava
     só o que mudou (inserir / atualizar / excluir), em fila, na ordem certa.
     Devolve uma Promise<boolean>: true = gravou, false = falhou (o cache é
     recarregado do banco e o erro aparece pra pessoa).
   - Pedido, cadastro de cliente, status e estorno NÃO passam por aqui como
     "salvar tabela": usam funções do servidor (RPC), que aplicam as regras.
   - Segurança de verdade está no banco (RLS). Este arquivo só conversa.
   ========================================================================== */
(function(){
  'use strict';

  const cfg = window.ESPETO_SUPABASE || {};
  const temBiblioteca = !!(window.supabase && window.supabase.createClient);
  const configurado = !!(cfg.url && cfg.anonKey);

  let sb = null;
  if (temBiblioteca && configurado){
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  }

  /* ---------- utilidades ---------- */
  const num = (v) => (v === null || v === undefined || v === '') ? null : Number(v);
  const num0 = (v) => Number(v) || 0;
  const clonar = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

  function uuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // fallback (navegadores muito antigos)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function erroAmigavel(e){
    if (!e) return 'Erro desconhecido.';
    // erros de regra de negócio levantados pelo banco (errcode P0001) já vêm em português
    if (e.code === 'P0001' && e.message) return e.message;
    if (e.code === '22P02') return 'Os dados estão desatualizados. Atualize a página e tente de novo.';
    if (e.code === '23505') return 'Já existe um registro igual a esse.';
    if (e.code === '23503') return 'Esse registro está sendo usado em outro lugar e não pode ser removido.';
    if (e.code === '42501' && e.message && !/row-level security|permission denied/i.test(e.message)) return e.message; // ex.: "Sem permissão."
    if (e.code === '42501' || /row-level security|permission denied/i.test(e.message || '')) return 'Você não tem permissão para fazer isso.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(e.message || '')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    return e.message || 'Erro inesperado.';
  }

  function exigirConexao(){
    if (!sb) throw new Error(!temBiblioteca
      ? 'A biblioteca do Supabase não carregou.'
      : 'Supabase não configurado: preencha a chave "anonKey" em assets/js/config.js.');
  }

  async function ok(promessa){
    const { data, error } = await promessa;
    if (error) throw error;
    return data;
  }

  /* ---------- conversões banco <-> formato usado pelo site ---------- */
  const Mapa = {
    config: {
      de(r){
        return {
          nomeLoja: r.nome_loja, tagline: r.tagline || '', whatsapp: r.whatsapp || '',
          instagram: r.instagram || '', facebook: r.facebook || '',
          enderecoTexto: r.endereco_texto || '', enderecoMapaBusca: r.endereco_mapa_busca || '',
          enderecoLat: num(r.endereco_lat), enderecoLng: num(r.endereco_lng),
          enderecoUrlGoogleMaps: r.endereco_url_google_maps || '', cidadeUf: r.cidade_uf || '',
          googleMapsApiKey: r.google_maps_api_key || '',
          horarios: Array.isArray(r.horarios) ? r.horarios : [],
          precoGasolina: num0(r.preco_gasolina), consumoKmLitro: num0(r.consumo_km_litro) || 12,
          taxaBaseEntrega: num0(r.taxa_base_entrega)
        };
      },
      para(c){
        return {
          nome_loja: c.nomeLoja, tagline: c.tagline, whatsapp: c.whatsapp, instagram: c.instagram,
          facebook: c.facebook, endereco_texto: c.enderecoTexto, endereco_mapa_busca: c.enderecoMapaBusca,
          endereco_lat: c.enderecoLat, endereco_lng: c.enderecoLng,
          endereco_url_google_maps: c.enderecoUrlGoogleMaps, cidade_uf: c.cidadeUf,
          google_maps_api_key: c.googleMapsApiKey, horarios: c.horarios,
          preco_gasolina: c.precoGasolina, consumo_km_litro: c.consumoKmLitro,
          taxa_base_entrega: c.taxaBaseEntrega
        };
      }
    },
    produto: {
      de: (r) => ({ id: r.id, nome: r.nome, categoria: r.categoria, preco: num0(r.preco), descricao: r.descricao || '',
                    emoji: r.emoji || '🍢', foto: r.foto || null, disponivel: !!r.disponivel }),
      para: (p) => ({ id: p.id, nome: p.nome, categoria: p.categoria, preco: p.preco, descricao: p.descricao || '',
                      emoji: p.emoji || '🍢', foto: p.foto || null, disponivel: !!p.disponivel })
    },
    bairro: {
      de: (r) => ({ id: r.id, nome: r.nome, distanciaKm: num0(r.distancia_km) }),
      para: (b) => ({ id: b.id, nome: b.nome, distancia_km: b.distanciaKm })
    },
    insumo: {
      de: (r) => ({ id: r.id, nome: r.nome, unidade: r.unidade, custoUnidade: num0(r.preco_unidade),
                    estoqueAtual: num0(r.estoque_atual), estoqueMinimo: num0(r.estoque_minimo), ativo: r.ativo !== false }),
      para: (i) => ({ id: i.id, nome: i.nome, unidade: i.unidade, preco_unidade: i.custoUnidade,
                      estoque_atual: i.estoqueAtual, estoque_minimo: i.estoqueMinimo || 0, ativo: i.ativo !== false })
    },
    entregador: {
      de: (r) => ({ id: r.id, nome: r.nome, telefone: r.telefone || '', placa: r.moto_placa || '', chassi: r.moto_chassi || '',
                    fotoDocMoto: r.foto_documento_moto || null, fotoDocCondutor: r.foto_documento_condutor || null,
                    ativo: r.ativo !== false }),
      para: (e) => ({ id: e.id, nome: e.nome, telefone: e.telefone || '', moto_placa: e.placa || '', moto_chassi: e.chassi || '',
                      foto_documento_moto: e.fotoDocMoto || null, foto_documento_condutor: e.fotoDocCondutor || null,
                      ativo: e.ativo !== false })
    },
    funcionario: {
      de: (r) => ({ id: r.id, nome: r.nome, email: r.email, perfil: r.perfil, ativo: !!r.ativo, foto: r.foto || null })
    },
    pedido: {
      de(r){
        const endereco = r.endereco ? Object.assign({}, r.endereco, {
          distanciaKm: num(r.distancia_km), origemDistancia: r.origem_distancia || null
        }) : null;
        return {
          id: r.id, numero: r.numero, dataHora: r.criado_em,
          cliente: { nome: r.cliente_nome, telefone: r.cliente_telefone },
          tipoEntrega: r.tipo_entrega, endereco,
          itens: (r.pedido_itens || []).map(i => ({
            nome: i.nome, preco: num0(i.preco), qtd: i.qtd, obs: i.obs || '', custoUnitario: num(i.custo_unitario)
          })),
          observacoesGerais: r.observacoes_gerais || '',
          pagamento: { forma: r.forma_pagamento, trocoPara: r.troco_para || '' },
          subtotal: num0(r.subtotal), frete: num0(r.frete), taxaEntregador: num(r.taxa_entregador), total: num0(r.total),
          status: r.status, estornado: !!r.estornado, valorEstornado: num(r.valor_estornado),
          dataEstorno: r.data_estorno || null, estornadoPor: r.estornado_por || null
        };
      }
    }
  };

  /* ---------- cache em memória ---------- */
  const cache = {
    config: null, produtos: [], bairros: [], pedidos: [], insumos: [], fichas: {},
    funcionarios: [], entregadores: [], clientes: {}
  };
  // estado "lógico" já gravado (ou enfileirado pra gravar) no banco, por tabela: Map(chave -> json da linha)
  const gravado = { config: '', produtos: new Map(), bairros: new Map(), insumos: new Map(), fichas: new Map(), entregadores: new Map() };

  function registrarGravado(tabela, linhas, chaveDe){
    const m = new Map();
    linhas.forEach(l => m.set(chaveDe(l), JSON.stringify(l)));
    gravado[tabela] = m;
  }
  const chaveId = (l) => l.id;
  const chaveFicha = (l) => l.produto_id + '|' + l.insumo_id;

  function fichasParaLinhas(fichas){
    const linhas = [];
    Object.keys(fichas || {}).forEach(produtoId => {
      (fichas[produtoId] || []).forEach(i => linhas.push({ produto_id: produtoId, insumo_id: i.insumoId, quantidade: i.quantidade }));
    });
    return linhas;
  }
  function fichasDeLinhas(rows){
    const f = {};
    rows.forEach(r => { (f[r.produto_id] = f[r.produto_id] || []).push({ insumoId: r.insumo_id, quantidade: num0(r.quantidade) }); });
    return f;
  }

  /* ---------- fila de gravação (uma por vez, na ordem) ---------- */
  let fila = Promise.resolve();
  function enfileirar(tarefa){
    const p = fila.then(tarefa);
    fila = p.catch(() => {}); // uma falha não trava as próximas
    return p;
  }

  let aoFalhar = () => {};

  async function persistirLista(tabela, nomeSql, novasLinhas, chaveDe, opcoes){
    opcoes = opcoes || {};
    const anterior = gravado[tabela];
    const atual = new Map();
    novasLinhas.forEach(l => atual.set(chaveDe(l), l));

    const upserts = [];
    atual.forEach((linha, chave) => { if (anterior.get(chave) !== JSON.stringify(linha)) upserts.push(linha); });
    const remocoes = [];
    anterior.forEach((_json, chave) => { if (!atual.has(chave)) remocoes.push(chave); });

    // atualiza o "estado lógico" já na hora, pra próximas chamadas compararem com o certo
    const novoGravado = new Map();
    atual.forEach((linha, chave) => novoGravado.set(chave, JSON.stringify(linha)));
    gravado[tabela] = novoGravado;

    if (!upserts.length && !remocoes.length) return true;

    return enfileirar(async () => {
      // exclui primeiro (evita conflito de chaves únicas, ex.: nome de bairro), depois grava
      if (remocoes.length){
        if (opcoes.excluir){
          for (const chave of remocoes) await opcoes.excluir(chave);
        } else {
          await ok(sb.from(nomeSql).delete().in('id', remocoes));
        }
      }
      if (upserts.length){
        await ok(sb.from(nomeSql).upsert(upserts, { onConflict: opcoes.conflito || 'id' }));
      }
      return true;
    });
  }

  async function seFalhar(tabela, erro){
    console.error('Falha ao gravar', tabela, erro);
    try { await recarregar(tabela); } catch (e) { /* segue */ }
    aoFalhar(tabela, erroAmigavel(erro));
    return false;
  }

  /* ---------- leitura ---------- */
  async function carregarConfig(){
    const r = await ok(sb.from('loja_config').select('*').eq('id', 1).single());
    cache.config = Mapa.config.de(r);
    gravado.config = JSON.stringify(Mapa.config.para(cache.config));
  }
  async function carregarProdutos(){
    const rows = await ok(sb.from('produtos').select('*').order('categoria').order('nome'));
    cache.produtos = rows.map(Mapa.produto.de);
    registrarGravado('produtos', cache.produtos.map(Mapa.produto.para), chaveId);
  }
  async function carregarBairros(){
    const rows = await ok(sb.from('bairros').select('*').order('nome'));
    cache.bairros = rows.map(Mapa.bairro.de);
    registrarGravado('bairros', cache.bairros.map(Mapa.bairro.para), chaveId);
  }
  async function carregarPedidos(){
    const todos = [];
    const TAMANHO = 1000; // limite por consulta do PostgREST
    for (let de = 0; ; de += TAMANHO){
      const lote = await ok(sb.from('pedidos').select('*, pedido_itens(*)')
        .order('criado_em', { ascending: false }).range(de, de + TAMANHO - 1));
      todos.push(...lote);
      if (lote.length < TAMANHO) break;
    }
    cache.pedidos = todos.map(Mapa.pedido.de);
  }
  async function carregarInsumos(){
    const rows = await ok(sb.from('insumos').select('*').order('nome'));
    cache.insumos = rows.map(Mapa.insumo.de);
    registrarGravado('insumos', cache.insumos.map(Mapa.insumo.para), chaveId);
  }
  async function carregarFichas(){
    const rows = await ok(sb.from('fichas_tecnicas').select('produto_id, insumo_id, quantidade'));
    cache.fichas = fichasDeLinhas(rows);
    registrarGravado('fichas', fichasParaLinhas(cache.fichas), chaveFicha);
  }
  async function carregarEntregadores(){
    const rows = await ok(sb.from('entregadores').select('*').order('nome'));
    cache.entregadores = rows.map(Mapa.entregador.de);
    registrarGravado('entregadores', cache.entregadores.map(Mapa.entregador.para), chaveId);
  }
  async function carregarFuncionarios(){
    const rows = await ok(sb.from('funcionarios').select('*').order('nome'));
    cache.funcionarios = rows.map(Mapa.funcionario.de);
  }
  async function carregarClientes(){
    const rows = await ok(sb.from('clientes').select('*'));
    const obj = {};
    rows.forEach(r => { obj[r.telefone] = { nome: r.nome, telefone: r.telefone, email: r.email || '', endereco: r.endereco || {} }; });
    cache.clientes = obj;
  }

  const carregadores = {
    config: carregarConfig, produtos: carregarProdutos, bairros: carregarBairros, pedidos: carregarPedidos,
    insumos: carregarInsumos, fichas: carregarFichas, entregadores: carregarEntregadores,
    funcionarios: carregarFuncionarios, clientes: carregarClientes
  };
  async function recarregar(tabela){ return carregadores[tabela](); }

  // Ao excluir um produto/insumo o banco apaga as fichas ligadas a ele (on delete cascade).
  // Aqui tiramos essas fichas do cache e do "estado gravado", pra não tentar regravá-las depois.
  function limparFichasOrfas(coluna, idsQueRestam){
    Object.keys(cache.fichas).forEach(produtoId => {
      if (coluna === 'produto_id' && !idsQueRestam.has(produtoId) && cache.produtos.some(p => p.id === produtoId)) delete cache.fichas[produtoId];
      if (coluna === 'insumo_id') cache.fichas[produtoId] = cache.fichas[produtoId].filter(i => idsQueRestam.has(i.insumoId));
    });
    gravado.fichas.forEach((_json, chave) => {
      const [produtoId, insumoId] = chave.split('|');
      const id = coluna === 'produto_id' ? produtoId : insumoId;
      if (!idsQueRestam.has(id)) gravado.fichas.delete(chave);
    });
  }

  /* ---------- API de dados (mesmo formato que o site já usava) ---------- */
  const dados = {
    getProdutos: () => clonar(cache.produtos),
    getBairros: () => clonar(cache.bairros),
    getConfig: () => clonar(cache.config),
    getPedidos: () => clonar(cache.pedidos),
    getInsumos: () => clonar(cache.insumos),
    getFichasTecnicas: () => clonar(cache.fichas),
    getFuncionarios: () => clonar(cache.funcionarios),
    getEntregadores: () => clonar(cache.entregadores),
    getClientes: () => clonar(cache.clientes),

    async salvarProdutos(lista){
      limparFichasOrfas('produto_id', new Set(lista.map(p => p.id)));
      cache.produtos = clonar(lista);
      try { return await persistirLista('produtos', 'produtos', lista.map(Mapa.produto.para), chaveId); }
      catch (e) { return seFalhar('produtos', e); }
    },
    async salvarBairros(lista){
      cache.bairros = clonar(lista);
      try { return await persistirLista('bairros', 'bairros', lista.map(Mapa.bairro.para), chaveId); }
      catch (e) { return seFalhar('bairros', e); }
    },
    async salvarInsumos(lista){
      limparFichasOrfas('insumo_id', new Set(lista.map(i => i.id)));
      cache.insumos = clonar(lista);
      try { return await persistirLista('insumos', 'insumos', lista.map(Mapa.insumo.para), chaveId); }
      catch (e) { return seFalhar('insumos', e); }
    },
    async salvarEntregadores(lista){
      cache.entregadores = clonar(lista);
      try { return await persistirLista('entregadores', 'entregadores', lista.map(Mapa.entregador.para), chaveId); }
      catch (e) { return seFalhar('entregadores', e); }
    },
    async salvarFichasTecnicas(fichas){
      cache.fichas = clonar(fichas);
      try {
        return await persistirLista('fichas', 'fichas_tecnicas', fichasParaLinhas(fichas), chaveFicha, {
          conflito: 'produto_id,insumo_id',
          excluir: async (chave) => {
            const [produtoId, insumoId] = chave.split('|');
            await ok(sb.from('fichas_tecnicas').delete().eq('produto_id', produtoId).eq('insumo_id', insumoId));
          }
        });
      } catch (e) { return seFalhar('fichas', e); }
    },
    async salvarConfig(c){
      cache.config = clonar(c);
      const linha = Mapa.config.para(c);
      const json = JSON.stringify(linha);
      if (json === gravado.config) return true;
      gravado.config = json;
      try {
        return await enfileirar(async () => { await ok(sb.from('loja_config').update(linha).eq('id', 1)); return true; });
      } catch (e) { return seFalhar('config', e); }
    }
  };

  /* ---------- carregamento inicial ---------- */
  async function iniciar(){
    exigirConexao();
    await Promise.all([carregarConfig(), carregarProdutos(), carregarBairros()]);
  }

  async function carregarEquipe(perfil){
    const tarefas = [carregarPedidos()];
    if (perfil === 'gestor' || perfil === 'admin'){
      tarefas.push(carregarInsumos(), carregarFichas(), carregarEntregadores(), carregarFuncionarios());
    }
    await Promise.all(tarefas);
  }

  /* ---------- pedido (cliente) ---------- */
  async function criarPedido(payload){
    exigirConexao();
    return ok(sb.rpc('criar_pedido', { p_dados: payload }));
  }

  /* ---------- cadastro / perfil do cliente ---------- */
  const cliente = {
    async identificar(nome, telefone, email){
      exigirConexao();
      const perfil = await ok(sb.rpc('identificar_cliente', { p_nome: nome, p_telefone: telefone, p_email: email || '' }));
      cache.clientes[perfil.telefone] = perfil;
      return perfil;
    },
    async obter(telefone){
      exigirConexao();
      const perfil = await ok(sb.rpc('obter_cliente', { p_telefone: telefone }));
      if (perfil) cache.clientes[perfil.telefone] = perfil;
      return perfil;
    },
    async atualizar(telefoneAtual, nome, telefoneNovo, email, endereco){
      exigirConexao();
      const perfil = await ok(sb.rpc('atualizar_cliente', {
        p_telefone_atual: telefoneAtual, p_nome: nome, p_telefone_novo: telefoneNovo, p_email: email, p_endereco: endereco
      }));
      delete cache.clientes[telefoneAtual];
      cache.clientes[perfil.telefone] = perfil;
      return perfil;
    },
    async pedidos(telefone){
      exigirConexao();
      const rows = await ok(sb.rpc('meus_pedidos', { p_telefone: telefone }));
      return (rows || []).map(p => ({
        id: p.id, numero: p.numero, dataHora: p.criado_em, tipoEntrega: p.tipo_entrega, status: p.status,
        total: num0(p.total), itens: (p.itens || []).map(i => ({ nome: i.nome, qtd: i.qtd, preco: num0(i.preco) }))
      }));
    }
  };

  /* ---------- pedidos (equipe) ---------- */
  async function atualizarStatusPedido(id, status){
    await ok(sb.rpc('atualizar_status_pedido', { p_pedido_id: id, p_status: status }));
    const p = cache.pedidos.find(x => x.id === id);
    if (p) p.status = status;
  }
  async function estornarPedido(id, valor){
    await ok(sb.rpc('estornar_pedido', { p_pedido_id: id, p_valor: valor }));
    await carregarPedidos(); // traz estornadoPor/data exatamente como o servidor gravou
  }

  let canalPedidos = null;
  function assinarPedidos(aoMudar){
    if (!sb) return;
    if (canalPedidos) sb.removeChannel(canalPedidos);
    let timer = null;
    canalPedidos = sb.channel('pedidos-equipe')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (evento) => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try { await carregarPedidos(); aoMudar(evento.eventType); } catch (e) { console.warn('Realtime:', e); }
        }, 400);
      })
      .subscribe();
  }
  function pararRealtime(){
    if (sb && canalPedidos){ sb.removeChannel(canalPedidos); canalPedidos = null; }
  }

  /* ---------- autenticação da equipe ---------- */
  async function perfilDoUsuario(userId){
    const { data, error } = await sb.from('funcionarios').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!data || !data.ativo) return null;
    return { id: data.id, nome: data.nome, email: data.email, perfil: data.perfil };
  }

  const auth = {
    async entrar(email, senha){
      exigirConexao();
      const { data, error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password: senha });
      if (error) {
        const e = new Error('E-mail ou senha incorretos.');
        e.credenciais = true;
        throw e;
      }
      const perfil = await perfilDoUsuario(data.user.id);
      if (!perfil){
        await sb.auth.signOut();
        throw new Error('Este usuário não tem acesso ao painel (não cadastrado como funcionário ou está inativo).');
      }
      return perfil;
    },
    async sessaoAtual(){
      exigirConexao();
      const { data } = await sb.auth.getSession();
      if (!data || !data.session) return null;
      try {
        const perfil = await perfilDoUsuario(data.session.user.id);
        if (!perfil) { await sb.auth.signOut(); return null; }
        return perfil;
      } catch (e) {
        console.warn('Não foi possível validar a sessão:', e);
        return null;
      }
    },
    async sair(){
      pararRealtime();
      if (sb) await sb.auth.signOut();
    },
    // Confere a senha de algum administrador ativo SEM trocar a sessão de quem está logado
    // (usa um cliente descartável). Serve pra "gestor precisa da senha de um admin".
    async verificarSenhaAdmin(senha){
      exigirConexao();
      if (!senha) return false;
      const admins = cache.funcionarios.filter(f => f.ativo && f.perfil === 'admin');
      for (const a of admins){
        const temp = window.supabase.createClient(cfg.url, cfg.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        const { error } = await temp.auth.signInWithPassword({ email: a.email, password: senha });
        if (!error) return true;
      }
      return false;
    }
  };

  /* ---------- funcionários (via Edge Function, que usa a chave de serviço) ---------- */
  async function chamarGerenciarFuncionarios(corpo){
    exigirConexao();
    const { data, error } = await sb.functions.invoke('gerenciar-funcionarios', { body: corpo });
    if (error){
      let msg = 'Não foi possível concluir a operação.';
      try {
        if (error.context && typeof error.context.json === 'function'){
          const j = await error.context.json();
          if (j && j.erro) msg = j.erro;
        } else if (error.message) msg = error.message;
      } catch (e) { /* mantém a mensagem padrão */ }
      if (/Failed to send a request|not found|404/i.test(msg)) msg = 'O serviço de funcionários (Edge Function "gerenciar-funcionarios") não está publicado no Supabase.';
      throw new Error(msg);
    }
    if (data && data.erro) throw new Error(data.erro);
    await carregarFuncionarios();
    return data;
  }
  const funcionarios = {
    criar: (f) => chamarGerenciarFuncionarios({ acao: 'criar', nome: f.nome, email: f.email, senha: f.senha, perfil: f.perfil, ativo: f.ativo, foto: f.foto || null }),
    atualizar: (f) => chamarGerenciarFuncionarios({ acao: 'atualizar', id: f.id, nome: f.nome, email: f.email, senha: f.senha || undefined, perfil: f.perfil, ativo: f.ativo, foto: f.foto || null }),
    excluir: (id) => chamarGerenciarFuncionarios({ acao: 'excluir', id })
  };

  /* ---------- imagens (Storage) ---------- */
  async function dataUrlParaBlob(dataUrl){
    const r = await fetch(dataUrl);
    return r.blob();
  }
  const imagens = {
    // Envia uma imagem (data URL) e devolve { path, url }. `url` só existe em bucket público.
    async enviar(bucket, dataUrl, pasta){
      exigirConexao();
      const blob = await dataUrlParaBlob(dataUrl);
      const path = (pasta ? pasta + '/' : '') + uuid() + '.jpg';
      await ok(sb.storage.from(bucket).upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000', upsert: false }));
      const url = bucket === 'produtos' ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
      return { path, url };
    },
    // Aceita o caminho ou a URL pública; falha silenciosa (é só limpeza)
    async remover(bucket, caminhoOuUrl){
      if (!sb || !caminhoOuUrl) return;
      let path = caminhoOuUrl;
      const marca = '/object/public/' + bucket + '/';
      const i = String(caminhoOuUrl).indexOf(marca);
      if (i >= 0) path = decodeURIComponent(String(caminhoOuUrl).slice(i + marca.length));
      else if (/^https?:|^data:/.test(path)) return; // não é arquivo nosso
      try { await sb.storage.from(bucket).remove([path]); } catch (e) { console.warn('Não removeu imagem antiga:', e); }
    },
    async urlAssinada(bucket, path, segundos){
      if (!sb || !path) return null;
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, segundos || 300);
      return error ? null : data.signedUrl;
    }
  };

  /* ---------- API pública ---------- */
  window.Banco = {
    configurado, temBiblioteca,
    uuid, erroAmigavel,
    iniciar, carregarEquipe, carregarPedidos, recarregar,
    dados, cache, criarPedido, cliente,
    atualizarStatusPedido, estornarPedido, assinarPedidos, pararRealtime,
    auth, funcionarios, imagens,
    aoFalhar(fn){ aoFalhar = fn; }
  };
})();
