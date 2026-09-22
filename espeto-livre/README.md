# 🔥 Espeto Livre — Comanda Digital

Site institucional e comanda digital de pedidos da espetaria **Espeto Livre** (Fortaleza - CE).
O cliente monta o pedido (cardápio, carrinho, entrega/retirada, pagamento), o pedido é **gravado no banco** e a mensagem formatada abre no WhatsApp da loja. O painel administrativo cuida de cardápio, pedidos em tempo real (esteira), relatórios, receita/estoque, funcionários, entregas e configurações.

**Front-end estático** (HTML, CSS e JavaScript puros, sem build) + **backend no Supabase** (PostgreSQL, Auth, Storage, Realtime e uma Edge Function).

---

## 🧱 Arquitetura

```
Navegador (site estático, GitHub Pages)
   │  assets/js/banco.js  →  supabase-js
   ▼
Supabase
 ├─ PostgreSQL ── tabelas + RLS + funções (RPC) com as regras do negócio
 ├─ Auth ──────── login da equipe (senha com hash, sessão JWT)
 ├─ Storage ───── fotos do cardápio (público) e documentos dos entregadores (privado)
 ├─ Realtime ──── esteira de pedidos atualiza sozinha
 └─ Edge Function "gerenciar-funcionarios" ── criar/editar/excluir usuários da equipe
```

**Quem decide o quê**
- O navegador só manda *o que* foi pedido (ids e quantidades). **Preço, frete, custo e baixa de estoque são calculados no servidor** (`criar_pedido`).
- Estornos e mudanças de status passam por funções do servidor, que registram *quem* fez (a partir do login).
- Segurança de verdade é o **RLS** do banco: sem login, só se lê cardápio/bairros/dados da loja. Clientes e pedidos **não** são legíveis pela API pública.

| Perfil | Pode |
|---|---|
| Público (sem login) | ver cardápio, criar pedido, cuidar do próprio cadastro (por WhatsApp) |
| Funcionário | esteira: ver pedidos, avançar status, estornar |
| Gestor | + cardápio, entrega, receita, configurações, equipe (exceto administradores) |
| Admin | tudo, inclusive criar/editar outros admins |

---

## 📁 Estrutura do Projeto

```
├── index.html                → Comanda digital (cardápio + carrinho + checkout)
├── assets/
│   ├── css/styles.css
│   ├── js/
│   │   ├── config.js         → URL e chave pública (anon) do Supabase  ← você edita
│   │   ├── banco.js          → camada de dados (Supabase): cache, gravação em fila, RPC, auth, storage, realtime
│   │   ├── scripts.js        → interface: cardápio, carrinho, checkout, área do cliente, painel admin
│   │   └── vendor/           → supabase-js (build UMD, MIT) servido junto com o site
│   └── images/logo.png
├── pages/                    → sobre, contato, perfil (área do cliente), admin
├── database/
│   ├── schema.sql            → tabelas, RLS, funções, realtime e storage (idempotente)
│   ├── seed.sql              → cardápio, bairros e dados da loja iniciais (idempotente)
│   └── primeiro_admin.sql    → cria o primeiro administrador
└── supabase/functions/gerenciar-funcionarios/index.ts   → Edge Function (equipe)
```

---

## 🚀 Colocando no ar (uma vez só)

### 1. Banco de dados
1. Supabase → **SQL Editor** → cole e rode `database/schema.sql`.
2. Rode `database/seed.sql` (cardápio, bairros, endereço e horários). Pode rodar de novo sem sobrescrever o que você editou.

> Se você já tinha rodado uma versão anterior do `schema.sql`, rode este por cima: ele migra e **fecha o acesso público** que a versão antiga dava às tabelas `clientes` e `pedidos`.

### 2. Primeiro administrador
1. **Authentication → Users → Add user → Create new user**: e-mail + senha forte, marque **Auto Confirm User**.
2. Abra `database/primeiro_admin.sql`, confira o e-mail e rode no SQL Editor.
3. Em **Authentication → Providers → Email**, desative **Allow new users to sign up** (a equipe é criada só pelo painel).

### 3. Edge Function (gerenciar funcionários)
Pelo terminal, com a [Supabase CLI](https://supabase.com/docs/guides/cli):
```bash
supabase login
supabase link --project-ref tscxuzlulxsetllrbpim
supabase functions deploy gerenciar-funcionarios
```
Ou pelo painel: **Edge Functions → Deploy a new function → Via Editor**, nome `gerenciar-funcionarios`, cole o conteúdo de `supabase/functions/gerenciar-funcionarios/index.ts`.
(A função usa as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, que o Supabase já injeta.)

### 4. Conectar o site
Em `assets/js/config.js`, cole a **anon public key** (Project Settings → API). A URL do projeto já está preenchida.
> A `anon` é pública por design. **Nunca** coloque a `service_role` no site.

### 5. Google Maps (frete pela distância real — opcional)
Crie a chave no Google Cloud, **restrinja por domínio (HTTP referrer)** e só à API Distance Matrix, e cole em **Admin → Entrega**. Sem chave, o frete usa a distância estimada por bairro.

### 6. Publicar
GitHub → **Settings → Pages → Deploy from a branch → main / (root)**. Endereço: `https://SEU-USUARIO.github.io/espeto-livre/`.

---

## ▶️ Rodar localmente
```bash
python3 -m http.server 8080   # e abra http://localhost:8080
```
(O site precisa de internet para falar com o Supabase.)

---

## 🔑 Painel administrativo
Acesse `/pages/admin.html` ou use o link **Acesso da equipe** na tela de identificação do site. Login com o e-mail e a senha criados no Supabase Auth. Novos funcionários: **Admin → Funcionários** (senha mínima de 8 caracteres).

Ações de gestor que alteram cardápio, entrega ou configurações pedem a **senha de um administrador** (a senha é conferida pelo Supabase Auth).

---

## 🔒 Segurança — o que você precisa saber
- **Cliente sem senha:** o cliente se identifica só por WhatsApp (decisão de produto). As tabelas de clientes/pedidos não são legíveis diretamente, mas quem souber o WhatsApp de outra pessoa consegue ver o histórico/endereço dela pelo site. Se isso incomodar, o próximo passo é login do cliente por código via SMS/WhatsApp.
- **Frete pela distância do Google:** a distância medida no navegador é aceita pelo servidor numa faixa plausível (0,1 a 100 km) e registrada em `pedidos.origem_distancia` para auditoria. Um usuário técnico poderia adulterar o frete; para blindar por completo, mova o cálculo para uma Edge Function com chave de servidor.
- **Limite de abuso:** no máximo 10 pedidos por hora por WhatsApp.
- Dados da versão antiga (salvos no `localStorage` de um navegador) **não são migrados**: o banco começa com o cardápio do `seed.sql`.

---

## 🛠️ Personalização
Cardápio, bairros, frete, horários e dados da loja: **painel admin**. Dados iniciais de uma instalação nova: `database/seed.sql`.
