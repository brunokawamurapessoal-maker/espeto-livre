-- ============================================================================
-- ESPETO LIVRE — Backend completo no Supabase (PostgreSQL)
-- ============================================================================
-- Como rodar: Supabase → seu projeto → SQL Editor → New query → cole este
-- arquivo inteiro → Run. É IDEMPOTENTE: pode rodar de novo a qualquer momento
-- (por exemplo, depois de atualizar o repositório) sem perder dados.
--
-- O que este arquivo cria:
--   1. Tabelas (cardápio, entrega, insumos, clientes, pedidos, funcionários…)
--   2. Regras de segurança (RLS) por nível de acesso
--   3. Funções de negócio (RPC) — o servidor calcula preço/frete/estoque,
--      o navegador não decide valores
--   4. Realtime na tabela de pedidos (a esteira atualiza sozinha)
--   5. Storage: buckets "produtos" (público) e "documentos" (privado)
--
-- ACESSO POR PERFIL
--   público (sem login) : lê cardápio, bairros e dados da loja; cria pedido
--                         e cuida do próprio cadastro SÓ pelas funções abaixo
--   funcionario         : vê pedidos, avança status, estorna (Esteira)
--   gestor              : + cardápio, entrega, receita, configurações, equipe
--   admin               : tudo (é o único que cria/edita outros admins)
--
-- Funcionários usam o Supabase Auth de verdade (senha com hash, sessão JWT).
-- A tabela `funcionarios` guarda só o PERFIL de cada usuário autenticado.
-- Criar/editar/excluir funcionários é feito pela Edge Function
-- "gerenciar-funcionarios" (supabase/functions/), porque criar usuário no
-- Auth exige a chave de serviço, que nunca pode ficar no navegador.
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1. TABELAS
-- ----------------------------------------------------------------------------

-- 1.1 Configuração da loja (linha única)
create table if not exists loja_config (
  id smallint primary key default 1 check (id = 1), -- garante 1 linha só
  nome_loja text not null default 'Espeto Livre',
  tagline text default 'Na brasa, do seu jeito',
  whatsapp text not null default '',
  instagram text default '',
  facebook text default '',
  endereco_texto text default '',
  endereco_mapa_busca text default '',
  endereco_lat double precision,
  endereco_lng double precision,
  endereco_url_google_maps text default '',
  cidade_uf text default '',
  -- Chave do Google Maps (Distance Matrix, usada no navegador). Como toda chave
  -- de navegador, ela é pública: RESTRINJA-A por domínio (HTTP referrer) e só à
  -- API Distance Matrix no Google Cloud Console.
  google_maps_api_key text default '',
  horarios jsonb not null default '[]', -- [{dia,nome,aberto,abertura,fechamento}]
  preco_gasolina numeric(10,2) not null default 6.43,
  consumo_km_litro numeric(10,2) not null default 12,
  taxa_base_entrega numeric(10,2) not null default 4.00, -- repassada integralmente ao entregador
  atualizado_em timestamptz not null default now()
);
insert into loja_config (id) values (1) on conflict (id) do nothing;

-- 1.2 Funcionários (perfil vinculado ao Supabase Auth)
create table if not exists funcionarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  perfil text not null check (perfil in ('funcionario','gestor','admin')),
  ativo boolean not null default true,
  foto text,
  criado_em timestamptz not null default now()
);

-- O usuário logado é funcionário ativo com um dos perfis dados?
-- SECURITY DEFINER é obrigatório: as políticas da própria tabela `funcionarios`
-- chamam esta função; sem isso a política consulta a tabela, que dispara a
-- política de novo… e o Postgres estoura a pilha (recursão infinita).
create or replace function auth_tem_perfil(perfis text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from funcionarios
    where id = auth.uid() and ativo = true and perfil = any(perfis)
  );
$$;

-- 1.3 Cardápio
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null,
  preco numeric(10,2) not null check (preco >= 0),
  descricao text default '',
  emoji text default '🍢',
  foto text, -- URL pública no Storage (bucket "produtos")
  disponivel boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists idx_produtos_categoria on produtos(categoria);

-- 1.4 Entrega — bairros e entregadores
create table if not exists bairros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  distancia_km numeric(10,2) not null check (distancia_km >= 0) -- estimativa usada quando o Google Maps não está disponível
);
create unique index if not exists idx_bairros_nome on bairros (lower(nome));

create table if not exists entregadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text default '',
  moto_placa text default '',
  moto_chassi text default '',
  foto_documento_moto text,      -- caminho no Storage (bucket "documentos", privado)
  foto_documento_condutor text,  -- caminho no Storage (bucket "documentos", privado)
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- 1.5 Receita — insumos e ficha técnica
create table if not exists insumos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade text not null default 'un', -- kg, g, L, ml, un
  preco_unidade numeric(10,4) not null default 0, -- custo por unidade
  estoque_atual numeric(10,3) not null default 0,
  estoque_minimo numeric(10,3) not null default 0,
  ativo boolean not null default true
);

create table if not exists fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  insumo_id uuid not null references insumos(id) on delete cascade,
  quantidade numeric(10,4) not null check (quantidade > 0),
  unique (produto_id, insumo_id)
);
create index if not exists idx_fichas_produto on fichas_tecnicas(produto_id);

-- 1.6 Clientes (identificados por WhatsApp, sem senha — decisão de produto)
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null unique, -- só dígitos, com DDD
  email text default '',
  endereco jsonb default '{}', -- {rua,numero,complemento,bairro,referencia}
  criado_em timestamptz not null default now()
);

-- 1.7 Pedidos
create sequence if not exists pedidos_numero_seq start 1001;

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  numero int not null default nextval('pedidos_numero_seq'),
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nome text not null,
  cliente_telefone text not null,
  tipo_entrega text not null check (tipo_entrega in ('retirada','delivery')),
  endereco jsonb, -- null se for retirada
  distancia_km numeric(10,2),        -- distância usada no cálculo desse frete
  origem_distancia text,             -- 'google' (real) ou 'estimado' (por bairro) — auditoria
  observacoes_gerais text default '',
  forma_pagamento text not null,
  troco_para text default '',
  subtotal numeric(10,2) not null default 0,
  frete numeric(10,2) not null default 0,
  taxa_entregador numeric(10,2) default 0, -- snapshot do repasse ao entregador nessa venda
  total numeric(10,2) not null default 0,
  status text not null default 'novo' check (status in ('novo','preparando','pronto','entregue','cancelado')),
  estornado boolean not null default false,
  valor_estornado numeric(10,2),
  data_estorno timestamptz,
  estornado_por text, -- nome do funcionário que fez o estorno
  criado_em timestamptz not null default now()
);
-- bancos criados com a versão anterior deste schema:
alter table pedidos add column if not exists cliente_id uuid references clientes(id) on delete set null;
alter table pedidos alter column numero set default nextval('pedidos_numero_seq');
create unique index if not exists idx_pedidos_numero on pedidos(numero);
create index if not exists idx_pedidos_status on pedidos(status);
create index if not exists idx_pedidos_telefone on pedidos(cliente_telefone);
create index if not exists idx_pedidos_cliente on pedidos(cliente_id);
create index if not exists idx_pedidos_criado on pedidos(criado_em desc);

create table if not exists pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  nome text not null, -- snapshot do nome (mesmo se o produto for renomeado/excluído depois)
  preco numeric(10,2) not null,
  qtd int not null check (qtd > 0),
  obs text default '',
  custo_unitario numeric(10,4) -- snapshot do custo no momento da venda (via ficha técnica)
);
create index if not exists idx_itens_pedido on pedido_itens(pedido_id);

-- mantém loja_config.atualizado_em sempre correto
create or replace function trg_loja_config_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end; $$;
drop trigger if exists trg_loja_config_atualizado on loja_config;
create trigger trg_loja_config_atualizado before update on loja_config
  for each row execute function trg_loja_config_atualizado();

-- ----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table loja_config     enable row level security;
alter table funcionarios    enable row level security;
alter table produtos        enable row level security;
alter table bairros         enable row level security;
alter table entregadores    enable row level security;
alter table insumos         enable row level security;
alter table fichas_tecnicas enable row level security;
alter table clientes        enable row level security;
alter table pedidos         enable row level security;
alter table pedido_itens    enable row level security;

-- Recomeça do zero nas tabelas acima: as políticas da versão anterior deixavam
-- clientes e pedidos legíveis por qualquer pessoa. Só as políticas abaixo valem.
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('loja_config','funcionarios','produtos','bairros','entregadores',
                        'insumos','fichas_tecnicas','clientes','pedidos','pedido_itens')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---- Leitura pública: o site do cliente lê isso sem login ----
create policy "leitura publica" on loja_config for select using (true);
create policy "leitura publica" on produtos    for select using (true);
create policy "leitura publica" on bairros     for select using (true);

-- ---- Gestor e Admin: administram loja, cardápio, entrega e receita ----
create policy "gestao atualiza config" on loja_config for update
  using (auth_tem_perfil(array['gestor','admin']))
  with check (auth_tem_perfil(array['gestor','admin']));

create policy "gestao gerencia produtos" on produtos for all
  using (auth_tem_perfil(array['gestor','admin']))
  with check (auth_tem_perfil(array['gestor','admin']));

create policy "gestao gerencia bairros" on bairros for all
  using (auth_tem_perfil(array['gestor','admin']))
  with check (auth_tem_perfil(array['gestor','admin']));

create policy "gestao gerencia entregadores" on entregadores for all
  using (auth_tem_perfil(array['gestor','admin']))
  with check (auth_tem_perfil(array['gestor','admin']));

create policy "gestao gerencia insumos" on insumos for all
  using (auth_tem_perfil(array['gestor','admin']))
  with check (auth_tem_perfil(array['gestor','admin']));

create policy "gestao gerencia fichas tecnicas" on fichas_tecnicas for all
  using (auth_tem_perfil(array['gestor','admin']))
  with check (auth_tem_perfil(array['gestor','admin']));

create policy "gestao le clientes" on clientes for select
  using (auth_tem_perfil(array['gestor','admin']));

-- ---- Pedidos: equipe só LÊ. Criar/alterar/estornar passa pelas funções da seção 3 ----
create policy "equipe le pedidos" on pedidos for select
  using (auth_tem_perfil(array['funcionario','gestor','admin']));
create policy "equipe le itens" on pedido_itens for select
  using (auth_tem_perfil(array['funcionario','gestor','admin']));

-- ---- Funcionários: cada um lê o próprio perfil; gestor/admin leem todos.
-- Sem política de escrita: criar/editar/excluir só pela Edge Function (chave de serviço),
-- assim ninguém se promove a admin pelo navegador.
create policy "le o proprio perfil" on funcionarios for select using (id = auth.uid());
create policy "gestao le funcionarios" on funcionarios for select
  using (auth_tem_perfil(array['gestor','admin']));

-- ----------------------------------------------------------------------------
-- 3. FUNÇÕES DE NEGÓCIO (RPC) — rodam no servidor, com as regras do negócio
-- ----------------------------------------------------------------------------

-- 3.1 Frete: taxa fixa + (ida e volta × km × gasolina ÷ consumo), arredondado
-- pra cima de 50 em 50 centavos. Mesma fórmula que o site mostra na tela.
create or replace function calcular_frete(p_km numeric)
returns numeric language sql stable set search_path = public as $$
  select (ceil(
           (c.taxa_base_entrega
            + (p_km * 2 * c.preco_gasolina) / coalesce(nullif(c.consumo_km_litro, 0), 12)
           ) * 2
         ) / 2)::numeric(10,2)
  from loja_config c where c.id = 1;
$$;

-- 3.2 Criar pedido. O navegador manda só O QUE foi pedido (ids e quantidades);
-- preços, frete, custo e baixa de estoque são calculados aqui.
-- Payload:
-- { cliente:{nome,telefone}, tipo_entrega:'retirada'|'delivery', bairro_id, endereco:{rua,numero,complemento,referencia},
--   distancia_km, origem_distancia:'google'|'estimado', forma_pagamento, troco_para, observacoes_gerais,
--   itens:[{produto_id,qtd,obs}] }
create or replace function criar_pedido(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome text := trim(coalesce(p_dados #>> '{cliente,nome}', ''));
  v_tel text := regexp_replace(coalesce(p_dados #>> '{cliente,telefone}', ''), '\D', '', 'g');
  v_tipo text := coalesce(p_dados ->> 'tipo_entrega', '');
  v_forma text := coalesce(p_dados ->> 'forma_pagamento', '');
  v_troco text := left(trim(coalesce(p_dados ->> 'troco_para', '')), 20);
  v_obs_gerais text := left(trim(coalesce(p_dados ->> 'observacoes_gerais', '')), 500);
  v_itens jsonb := p_dados -> 'itens';
  v_cfg loja_config%rowtype;
  v_bairro bairros%rowtype;
  v_cliente_id uuid;
  v_pedido_id uuid;
  v_numero int;
  v_criado timestamptz;
  v_endereco jsonb := null;
  v_dist numeric := null;
  v_dist_cliente numeric;
  v_origem text := null;
  v_subtotal numeric := 0;
  v_frete numeric := 0;
  v_taxa_entregador numeric := 0;
  v_total numeric;
  v_item record;
  v_prod produtos%rowtype;
  v_custo numeric;
  v_qtd int;
  v_itens_out jsonb := '[]'::jsonb;
begin
  if length(v_nome) < 2 or length(v_nome) > 100 then
    raise exception 'Informe seu nome.' using errcode = 'P0001';
  end if;
  if length(v_tel) < 10 or length(v_tel) > 13 then
    raise exception 'Informe um WhatsApp válido com DDD.' using errcode = 'P0001';
  end if;
  if v_tipo not in ('retirada', 'delivery') then
    raise exception 'Escolha retirada no local ou entrega.' using errcode = 'P0001';
  end if;
  if v_forma not in ('pix', 'dinheiro', 'credito', 'debito') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;
  if v_itens is null or jsonb_typeof(v_itens) <> 'array'
     or jsonb_array_length(v_itens) < 1 or jsonb_array_length(v_itens) > 50 then
    raise exception 'O pedido precisa ter entre 1 e 50 itens.' using errcode = 'P0001';
  end if;

  -- proteção simples contra abuso: no máximo 10 pedidos por hora por WhatsApp
  if (select count(*) from pedidos
      where cliente_telefone = v_tel and criado_em > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos pedidos em pouco tempo. Fale com a gente pelo WhatsApp.' using errcode = 'P0001';
  end if;

  select * into v_cfg from loja_config where id = 1;

  -- entrega: bairro, endereço e frete
  if v_tipo = 'delivery' then
    select * into v_bairro from bairros where id = nullif(p_dados ->> 'bairro_id', '')::uuid;
    if not found then
      raise exception 'Selecione o bairro de entrega.' using errcode = 'P0001';
    end if;
    if length(trim(coalesce(p_dados #>> '{endereco,rua}', ''))) < 2
       or length(trim(coalesce(p_dados #>> '{endereco,numero}', ''))) < 1 then
      raise exception 'Informe rua e número para entrega.' using errcode = 'P0001';
    end if;

    v_endereco := jsonb_build_object(
      'bairro', v_bairro.nome,
      'rua', left(trim(p_dados #>> '{endereco,rua}'), 200),
      'numero', left(trim(p_dados #>> '{endereco,numero}'), 20),
      'complemento', left(trim(coalesce(p_dados #>> '{endereco,complemento}', '')), 100),
      'referencia', left(trim(coalesce(p_dados #>> '{endereco,referencia}', '')), 200)
    );

    v_dist := v_bairro.distancia_km;
    v_origem := 'estimado';
    -- distância real medida no navegador via Google Maps: aceita se estiver numa faixa plausível.
    -- (Fica registrada em origem_distancia para auditoria.)
    if p_dados ->> 'origem_distancia' = 'google' and coalesce(p_dados ->> 'distancia_km', '') ~ '^[0-9]+(\.[0-9]+)?$' then
      v_dist_cliente := (p_dados ->> 'distancia_km')::numeric;
      if v_dist_cliente between 0.1 and 100 then
        v_dist := round(v_dist_cliente, 2);
        v_origem := 'google';
      end if;
    end if;
    v_frete := calcular_frete(v_dist);
    v_taxa_entregador := v_cfg.taxa_base_entrega;
  end if;

  -- cliente: cria ou atualiza (mantém e-mail já cadastrado; guarda o endereço da entrega)
  insert into clientes (nome, telefone, endereco)
  values (v_nome, v_tel, coalesce(v_endereco, '{}'::jsonb))
  on conflict (telefone) do update
    set nome = excluded.nome,
        endereco = case when v_tipo = 'delivery' then excluded.endereco else clientes.endereco end
  returning id into v_cliente_id;

  insert into pedidos (cliente_id, cliente_nome, cliente_telefone, tipo_entrega, endereco, distancia_km,
                       origem_distancia, observacoes_gerais, forma_pagamento, troco_para,
                       frete, taxa_entregador)
  values (v_cliente_id, v_nome, v_tel, v_tipo, v_endereco, v_dist,
          v_origem, v_obs_gerais, v_forma, case when v_forma = 'dinheiro' then v_troco else '' end,
          v_frete, v_taxa_entregador)
  returning id, numero, criado_em into v_pedido_id, v_numero, v_criado;

  -- itens: preço vem do cardápio (não do navegador); custo vem da ficha técnica
  for v_item in
    select * from jsonb_to_recordset(v_itens) as x(produto_id uuid, qtd int, obs text)
  loop
    v_qtd := coalesce(v_item.qtd, 0);
    if v_qtd < 1 or v_qtd > 99 then
      raise exception 'Quantidade inválida em um dos itens.' using errcode = 'P0001';
    end if;
    select * into v_prod from produtos where id = v_item.produto_id;
    if not found or not v_prod.disponivel then
      raise exception 'Um dos itens não está mais disponível. Atualize o cardápio.' using errcode = 'P0001';
    end if;

    select sum(ft.quantidade * i.preco_unidade) into v_custo
    from fichas_tecnicas ft join insumos i on i.id = ft.insumo_id
    where ft.produto_id = v_prod.id;

    insert into pedido_itens (pedido_id, produto_id, nome, preco, qtd, obs, custo_unitario)
    values (v_pedido_id, v_prod.id, v_prod.nome, v_prod.preco, v_qtd,
            left(trim(coalesce(v_item.obs, '')), 200), v_custo);

    v_subtotal := v_subtotal + v_prod.preco * v_qtd;
    v_itens_out := v_itens_out || jsonb_build_object(
      'nome', v_prod.nome, 'preco', v_prod.preco, 'qtd', v_qtd,
      'obs', left(trim(coalesce(v_item.obs, '')), 200));
  end loop;

  v_total := v_subtotal + v_frete;
  update pedidos set subtotal = v_subtotal, total = v_total where id = v_pedido_id;

  -- baixa de estoque dos insumos conforme a ficha técnica (atômico; pode ficar negativo, como antes)
  update insumos i set estoque_atual = i.estoque_atual - s.usado
  from (
    select ft.insumo_id, sum(ft.quantidade * pi.qtd) as usado
    from pedido_itens pi join fichas_tecnicas ft on ft.produto_id = pi.produto_id
    where pi.pedido_id = v_pedido_id
    group by ft.insumo_id
  ) s
  where i.id = s.insumo_id;

  return jsonb_build_object(
    'id', v_pedido_id, 'numero', v_numero, 'criado_em', v_criado,
    'subtotal', v_subtotal, 'frete', v_frete, 'taxa_entregador', v_taxa_entregador, 'total', v_total,
    'distancia_km', v_dist, 'origem_distancia', v_origem, 'itens', v_itens_out
  );
end;
$$;

-- 3.3 Cadastro do cliente (identificação por nome + WhatsApp)
create or replace function identificar_cliente(p_nome text, p_telefone text, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome text := trim(coalesce(p_nome, ''));
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_email text := left(trim(coalesce(p_email, '')), 200);
  v_c clientes%rowtype;
begin
  if length(v_nome) < 2 or length(v_nome) > 100 then
    raise exception 'Preencha seu nome.' using errcode = 'P0001';
  end if;
  if length(v_tel) < 10 or length(v_tel) > 13 then
    raise exception 'Informe um WhatsApp válido com DDD.' using errcode = 'P0001';
  end if;

  insert into clientes (nome, telefone, email) values (v_nome, v_tel, v_email)
  on conflict (telefone) do update
    set nome = excluded.nome,
        email = case when excluded.email <> '' then excluded.email else clientes.email end
  returning * into v_c;

  return jsonb_build_object('nome', v_c.nome, 'telefone', v_c.telefone, 'email', v_c.email, 'endereco', v_c.endereco);
end;
$$;

create or replace function obter_cliente(p_telefone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_c clientes%rowtype;
begin
  select * into v_c from clientes where telefone = v_tel;
  if not found then return null; end if;
  return jsonb_build_object('nome', v_c.nome, 'telefone', v_c.telefone, 'email', v_c.email, 'endereco', v_c.endereco);
end;
$$;

-- Edição do perfil pelo próprio cliente (inclui trocar o WhatsApp; o histórico acompanha via cliente_id)
create or replace function atualizar_cliente(
  p_telefone_atual text, p_nome text, p_telefone_novo text, p_email text, p_endereco jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_atual text := regexp_replace(coalesce(p_telefone_atual, ''), '\D', '', 'g');
  v_novo text := regexp_replace(coalesce(p_telefone_novo, ''), '\D', '', 'g');
  v_nome text := trim(coalesce(p_nome, ''));
  v_email text := left(trim(coalesce(p_email, '')), 200);
  v_end jsonb;
  v_c clientes%rowtype;
begin
  if length(v_nome) < 2 or length(v_nome) > 100 then
    raise exception 'Informe um nome válido.' using errcode = 'P0001';
  end if;
  if length(v_novo) < 10 or length(v_novo) > 13 then
    raise exception 'Informe um WhatsApp válido com DDD.' using errcode = 'P0001';
  end if;
  if v_email <> '' and position('@' in v_email) = 0 then
    raise exception 'Informe um e-mail válido ou deixe em branco.' using errcode = 'P0001';
  end if;
  if v_novo <> v_atual and exists (select 1 from clientes where telefone = v_novo) then
    raise exception 'Já existe um cadastro com esse WhatsApp.' using errcode = 'P0001';
  end if;

  v_end := jsonb_build_object(
    'rua', left(trim(coalesce(p_endereco ->> 'rua', '')), 200),
    'numero', left(trim(coalesce(p_endereco ->> 'numero', '')), 20),
    'complemento', left(trim(coalesce(p_endereco ->> 'complemento', '')), 100),
    'bairro', left(trim(coalesce(p_endereco ->> 'bairro', '')), 100),
    'referencia', left(trim(coalesce(p_endereco ->> 'referencia', '')), 200)
  );

  update clientes set nome = v_nome, telefone = v_novo, email = v_email, endereco = v_end
  where telefone = v_atual
  returning * into v_c;

  if not found then
    insert into clientes (nome, telefone, email, endereco) values (v_nome, v_novo, v_email, v_end)
    returning * into v_c;
  end if;

  return jsonb_build_object('nome', v_c.nome, 'telefone', v_c.telefone, 'email', v_c.email, 'endereco', v_c.endereco);
end;
$$;

-- Histórico do cliente (área "Meu perfil")
create or replace function meus_pedidos(p_telefone text, p_limite int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_cid uuid;
  v_res jsonb;
begin
  select id into v_cid from clientes where telefone = v_tel;
  select coalesce(jsonb_agg(x.pedido order by x.criado desc), '[]'::jsonb) into v_res
  from (
    select p.criado_em as criado,
      jsonb_build_object(
        'id', p.id, 'numero', p.numero, 'criado_em', p.criado_em, 'tipo_entrega', p.tipo_entrega,
        'status', p.status, 'total', p.total,
        'itens', coalesce((select jsonb_agg(jsonb_build_object('nome', i.nome, 'qtd', i.qtd, 'preco', i.preco))
                           from pedido_itens i where i.pedido_id = p.id), '[]'::jsonb)
      ) as pedido
    from pedidos p
    where (v_cid is not null and p.cliente_id = v_cid) or (p.cliente_id is null and p.cliente_telefone = v_tel)
    order by p.criado_em desc
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) x;
  return v_res;
end;
$$;

-- 3.4 Equipe: avançar status e estornar (validados e registrados no servidor)
create or replace function atualizar_status_pedido(p_pedido_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not auth_tem_perfil(array['funcionario','gestor','admin']) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_status not in ('novo','preparando','pronto','entregue','cancelado') then
    raise exception 'Status inválido.' using errcode = 'P0001';
  end if;
  update pedidos set status = p_status where id = p_pedido_id and not estornado;
  if not found then
    raise exception 'Pedido não encontrado ou já estornado.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function estornar_pedido(p_pedido_id uuid, p_valor numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
  v_quem text;
begin
  if not auth_tem_perfil(array['funcionario','gestor','admin']) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select total into v_total from pedidos where id = p_pedido_id and not estornado;
  if not found then
    raise exception 'Pedido não encontrado ou já estornado.' using errcode = 'P0001';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor > v_total then
    raise exception 'Valor de estorno inválido (máximo: %).', v_total using errcode = 'P0001';
  end if;
  select nome into v_quem from funcionarios where id = auth.uid();
  update pedidos
     set estornado = true, valor_estornado = p_valor, data_estorno = now(),
         estornado_por = coalesce(v_quem, 'Desconhecido'), status = 'cancelado'
   where id = p_pedido_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. PERMISSÕES DAS FUNÇÕES E TABELAS
-- ----------------------------------------------------------------------------
-- Tabelas internas: nada de acesso anônimo direto (defesa em profundidade além do RLS).
revoke all on clientes, pedidos, pedido_itens, funcionarios, entregadores, insumos, fichas_tecnicas from anon;

-- O Supabase concede EXECUTE a anon/authenticated por padrão em funções novas,
-- então revogamos de todos e liberamos só o que cada perfil precisa.
revoke all on function criar_pedido(jsonb) from public, anon, authenticated;
revoke all on function identificar_cliente(text, text, text) from public, anon, authenticated;
revoke all on function obter_cliente(text) from public, anon, authenticated;
revoke all on function atualizar_cliente(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function meus_pedidos(text, int) from public, anon, authenticated;
revoke all on function atualizar_status_pedido(uuid, text) from public, anon, authenticated;
revoke all on function estornar_pedido(uuid, numeric) from public, anon, authenticated;
revoke all on function calcular_frete(numeric) from public, anon, authenticated;
revoke all on function auth_tem_perfil(text[]) from public, anon, authenticated;

grant execute on function criar_pedido(jsonb) to anon, authenticated;
grant execute on function identificar_cliente(text, text, text) to anon, authenticated;
grant execute on function obter_cliente(text) to anon, authenticated;
grant execute on function atualizar_cliente(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function meus_pedidos(text, int) to anon, authenticated;
grant execute on function atualizar_status_pedido(uuid, text) to authenticated;
grant execute on function estornar_pedido(uuid, numeric) to authenticated;
grant execute on function calcular_frete(numeric) to anon, authenticated;
grant execute on function auth_tem_perfil(text[]) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. REALTIME — a esteira de pedidos atualiza sozinha nos aparelhos da equipe
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos') then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. STORAGE — fotos do cardápio (públicas) e documentos dos entregadores (privados)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "produtos: leitura publica" on storage.objects;
drop policy if exists "produtos: gestao escreve" on storage.objects;
drop policy if exists "documentos: gestao total" on storage.objects;

create policy "produtos: leitura publica" on storage.objects for select
  using (bucket_id = 'produtos');
create policy "produtos: gestao escreve" on storage.objects for all
  using (bucket_id = 'produtos' and auth_tem_perfil(array['gestor','admin']))
  with check (bucket_id = 'produtos' and auth_tem_perfil(array['gestor','admin']));
create policy "documentos: gestao total" on storage.objects for all
  using (bucket_id = 'documentos' and auth_tem_perfil(array['gestor','admin']))
  with check (bucket_id = 'documentos' and auth_tem_perfil(array['gestor','admin']));

-- ============================================================================
-- NOTA DE SEGURANÇA — identificação do cliente só por WhatsApp
-- Clientes não têm senha (decisão de produto: pedir sem cadastro). As tabelas
-- `clientes` e `pedidos` NÃO são mais legíveis pela API; o site só acessa por
-- funções que exigem o número de WhatsApp. Ainda assim, quem souber o WhatsApp
-- de outra pessoa consegue ver o histórico/endereço dela pelo site. Se quiser
-- fechar isso por completo, o próximo passo é login de cliente com código por
-- SMS/WhatsApp (Supabase Auth com telefone).
-- ============================================================================
