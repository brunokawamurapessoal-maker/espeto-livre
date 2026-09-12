-- ============================================================================
-- ESPETO LIVRE — Schema do banco de dados (PostgreSQL / Supabase)
-- ============================================================================
-- Como rodar: Supabase → seu projeto → SQL Editor → cole este arquivo inteiro
-- → Run. Pode rodar de uma vez só, na ordem em que está.
--
-- Autenticação: FUNCIONÁRIOS (admin/gestor/funcionário) usam o Supabase Auth
-- de verdade (auth.users) — login com senha em hash, sessão JWT, tudo
-- gerenciado pelo Supabase. A tabela `funcionarios` abaixo só guarda o PERFIL
-- (nome, cargo, foto) de cada usuário autenticado, nunca a senha.
--
-- Clientes (quem faz pedido no site) continuam se identificando só por nome
-- e WhatsApp, sem senha — do mesmo jeito que já funcionava no localStorage,
-- só que agora salvo num banco real em vez do navegador.
-- ============================================================================

create extension if not exists "pgcrypto"; -- para gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1. CONFIGURAÇÃO DA LOJA (linha única)
-- ----------------------------------------------------------------------------
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
  cidade_uf text default '', -- usado para montar o endereço completo na consulta ao Google Maps
  google_maps_api_key text default '', -- Distance Matrix API (opcional — sem ela, usa distância estimada por bairro)
  horarios jsonb not null default '[]', -- array [{dia,nome,aberto,abertura,fechamento}]
  preco_gasolina numeric(10,2) not null default 6.43,
  consumo_km_litro numeric(10,2) not null default 12,
  taxa_base_entrega numeric(10,2) not null default 4.00, -- repassada integralmente ao entregador
  atualizado_em timestamptz not null default now()
);
insert into loja_config (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. FUNCIONÁRIOS (perfil vinculado ao Supabase Auth)
-- ----------------------------------------------------------------------------
create table if not exists funcionarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  perfil text not null check (perfil in ('funcionario','gestor','admin')),
  ativo boolean not null default true,
  foto text,
  criado_em timestamptz not null default now()
);

-- função auxiliar: o usuário logado é funcionário ativo com um dos perfis dados?
create or replace function auth_tem_perfil(perfis text[])
returns boolean language sql stable as $$
  select exists (
    select 1 from funcionarios
    where id = auth.uid() and ativo = true and perfil = any(perfis)
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. CARDÁPIO
-- ----------------------------------------------------------------------------
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null,
  preco numeric(10,2) not null check (preco >= 0),
  descricao text default '',
  emoji text default '🍢',
  foto text, -- URL de arquivo no Supabase Storage (bucket "produtos")
  disponivel boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists idx_produtos_categoria on produtos(categoria);

-- ----------------------------------------------------------------------------
-- 4. ENTREGA — bairros e entregadores (motoqueiro + dados da moto)
-- ----------------------------------------------------------------------------
create table if not exists bairros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  distancia_km numeric(10,2) not null check (distancia_km >= 0) -- usada como estimativa quando o Google Maps não estiver configurado/disponível
);

create table if not exists entregadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text default '',
  moto_placa text default '',
  moto_chassi text default '',
  foto_documento_moto text,      -- URL no Storage (bucket "documentos", privado)
  foto_documento_condutor text,  -- URL no Storage (bucket "documentos", privado)
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. RECEITA — insumos e ficha técnica
-- ----------------------------------------------------------------------------
create table if not exists insumos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade text not null default 'un', -- kg, g, L, ml, un
  preco_unidade numeric(10,4) not null default 0,
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

-- ----------------------------------------------------------------------------
-- 6. CLIENTES
-- ----------------------------------------------------------------------------
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null unique,
  email text default '',
  endereco jsonb default '{}', -- {rua,numero,complemento,bairro,referencia}
  criado_em timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. PEDIDOS
-- ----------------------------------------------------------------------------
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  numero int not null,
  cliente_nome text not null,
  cliente_telefone text not null,
  tipo_entrega text not null check (tipo_entrega in ('retirada','delivery')),
  endereco jsonb, -- null se for retirada
  distancia_km numeric(10,2),        -- distância usada no cálculo desse frete
  origem_distancia text,             -- 'google' (real) ou 'estimado' (por bairro) — pra auditoria
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
create index if not exists idx_pedidos_status on pedidos(status);
create index if not exists idx_pedidos_telefone on pedidos(cliente_telefone);
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

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) — quem pode ver/alterar o quê
-- ============================================================================
alter table loja_config enable row level security;
alter table funcionarios enable row level security;
alter table produtos enable row level security;
alter table bairros enable row level security;
alter table entregadores enable row level security;
alter table insumos enable row level security;
alter table fichas_tecnicas enable row level security;
alter table clientes enable row level security;
alter table pedidos enable row level security;
alter table pedido_itens enable row level security;

-- ---- Leitura pública (site do cliente precisa ler isso sem estar logado) ----
create policy "leitura publica" on loja_config for select using (true);
create policy "leitura publica" on produtos for select using (true);
create policy "leitura publica" on bairros for select using (true);

-- ---- Clientes: o site cria/edita o próprio cadastro (sem senha, como já era) ----
create policy "clientes podem se cadastrar" on clientes for insert with check (true);
create policy "clientes podem ler e editar seu cadastro" on clientes for select using (true);
create policy "clientes podem atualizar seu cadastro" on clientes for update using (true);

-- ---- Pedidos: cliente cria e lê (pra ver o próprio histórico); só a equipe altera ----
create policy "qualquer um pode criar pedido" on pedidos for insert with check (true);
create policy "leitura publica de pedidos" on pedidos for select using (true);
create policy "equipe atualiza pedidos" on pedidos for update
  using (auth_tem_perfil(array['funcionario','gestor','admin']));

create policy "qualquer um insere itens do pedido" on pedido_itens for insert with check (true);
create policy "leitura publica de itens" on pedido_itens for select using (true);

-- ---- Dados internos: só equipe logada (funcionário/gestor/admin) ----
create policy "equipe le funcionarios" on funcionarios for select
  using (auth_tem_perfil(array['funcionario','gestor','admin']));
create policy "gestor e admin gerenciam funcionarios" on funcionarios for all
  using (auth_tem_perfil(array['gestor','admin']))
  with check (auth_tem_perfil(array['gestor','admin']));

create policy "equipe gerencia produtos" on produtos for all
  using (auth_tem_perfil(array['funcionario','gestor','admin']))
  with check (auth_tem_perfil(array['funcionario','gestor','admin']));

create policy "equipe gerencia bairros" on bairros for all
  using (auth_tem_perfil(array['funcionario','gestor','admin']))
  with check (auth_tem_perfil(array['funcionario','gestor','admin']));

create policy "equipe gerencia entregadores" on entregadores for all
  using (auth_tem_perfil(array['funcionario','gestor','admin']))
  with check (auth_tem_perfil(array['funcionario','gestor','admin']));

create policy "equipe gerencia insumos" on insumos for all
  using (auth_tem_perfil(array['funcionario','gestor','admin']))
  with check (auth_tem_perfil(array['funcionario','gestor','admin']));

create policy "equipe gerencia fichas tecnicas" on fichas_tecnicas for all
  using (auth_tem_perfil(array['funcionario','gestor','admin']))
  with check (auth_tem_perfil(array['funcionario','gestor','admin']));

create policy "equipe atualiza config" on loja_config for update
  using (auth_tem_perfil(array['funcionario','gestor','admin']));

-- ============================================================================
-- NOTA DE SEGURANÇA: a leitura de "pedidos" e "clientes" está pública (sem
-- exigir login) porque hoje o site não tem senha de cliente — é assim que já
-- funcionava no localStorage. Isso significa que, tecnicamente, alguém que
-- souber o telefone de outra pessoa poderia consultar os pedidos dela pela
-- API. Pra maioria das espetarias isso é um risco aceitável (não é dado de
-- cartão nem senha), mas se quiser fechar essa brecha por completo, o próximo
-- passo é criar login de cliente também (Supabase Auth com telefone/e-mail).
-- ============================================================================
