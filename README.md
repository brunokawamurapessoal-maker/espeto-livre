Aqui tens a versão reescrita do teu `README.md`, limpa de comentários e instruções no tom de assistente/IA, mantendo a documentação técnica profissional, organizada e direta ao ponto:

```markdown
# 🔥 Espeto Livre — Comanda Digital

Site institucional e comanda digital de pedidos para a espetaria **Espeto Livre** (Fortaleza - CE).
Permite que o cliente monte o próprio pedido (cardápio, carrinho, entrega/retirada, pagamento) e envie a solicitação formatada para o WhatsApp do estabelecimento. Inclui painel administrativo completo para gestão de cardápio, pedidos, esteira de produção, relatórios, funcionários, entregas e configurações.

**Site 100% estático** — Desenvolvido em HTML, CSS e JavaScript puros, sem etapa de build. Compatível com qualquer hospedagem de ficheiros estáticos.

---

## 📁 Estrutura do Projeto


```

├── index.html              → Comanda digital (cardápio + carrinho + checkout)
├── .nojekyll                → Impede o processamento do site via Jekyll no GitHub Pages
├── assets/
│   ├── css/styles.css       → Design system e estilos globais
│   ├── js/scripts.js        → Regras de negócio (cardápio, carrinho, frete, admin, área do cliente)
│   └── images/logo.png      → Logomarca do estabelecimento
├── pages/
│   ├── sobre.html
│   ├── contato.html
│   ├── perfil.html          → Área do cliente (dados, histórico e sugestões)
│   └── admin.html           → Painel administrativo
└── database/
├── schema.sql           → Schema PostgreSQL/Supabase (produtos, pedidos, RLS, etc.)
└── seed.sql             → Povoamento inicial (cardápio e bairros padrão)

```

---

## 💾 Persistência de Dados

### Padrão (Local)
Por padrão, a aplicação funciona sem backend. Todos os dados (cardápio, histórico e configurações) são armazenados no `localStorage` do navegador do utilizador. Os pedidos realizados são formatados e enviados diretamente para o WhatsApp da loja.

*Para transferir dados entre dispositivos no modo local, utilize a funcionalidade de exportação e importação em **Admin → Configurações → Backup**.*

### Integração com Banco de Dados (Supabase / PostgreSQL)
O repositório inclui a estrutura pronta para migração para um banco de dados relacional e partilhado.

**Passos para configuração do banco:**
1. Criar um projeto na [Supabase](https://supabase.com).
2. No painel da plataforma, aceder ao **SQL Editor** e executar o script `database/schema.sql`.
3. (Opcional) Executar o script `database/seed.sql` para carregar o cardápio e bairros iniciais.
4. Criar o primeiro utilizador em **Authentication → Users**.
5. Associar o ID do utilizador criado na tabela de funcionários via SQL Editor:
   ```sql
   insert into funcionarios (id, nome, email, perfil)
   values ('ID_DO_USUARIO_AQUI', 'Nome do Administrador', 'email@dominio.com', 'admin');

```

6. Obter a **Project URL** e a **anon public key** em **Project Settings → API** para futura integração no cliente web.

---

## ▶️ Execução Local

Não é necessária a instalação de dependências ou gestores de pacotes.

**Opção 1 — Direta:**
Abrir o ficheiro `index.html` num navegador web.

**Opção 2 — Servidor Local (Recomendado):**

```bash
# Na raiz do projeto
python3 -m http.server 8080
# Aceder via navegador em http://localhost:8080

```

---

## 🚀 Publicação e Deploy (GitHub Pages)

### 1. Inicialização e Envio do Código

```bash
git remote add origin [https://github.com/SEU-USUARIO/espeto-livre.git](https://github.com/SEU-USUARIO/espeto-livre.git)
git branch -M main
git push -u origin main

```

### 2. Configuração do GitHub Pages

1. No repositório no GitHub, aceder a **Settings → Pages**.
2. Em **Build and deployment → Source**, selecionar **Deploy from a branch**.
3. Definir a branch **main** e a pasta **/ (root)**, clicando em **Save**.
4. O acesso estará disponível no endereço `https://SEU-USUARIO.github.io/espeto-livre/`.

### 3. Configuração de Domínio Personalizado (Opcional)

Definir o domínio pretendido em **Settings → Pages → Custom domain** e configurar os registos DNS no fornecedor do domínio conforme a [documentação do GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site?utm_source=gemini).

---

## 🔑 Acesso ao Painel Administrativo

O acesso pode ser feito pela interface inicial ou diretamente pelo endereço `/pages/admin.html`.

* **E-mail padrão:** `brunokawamurapessoal@gmail.com`
* **Chave de acesso padrão:** `espeto123` *(Recomenda-se a alteração em Admin → Configurações → Segurança após a primeira inicialização)*

---

## 🛠️ Personalização

A gestão do cardápio, taxa de entrega, setores e definições do sistema é realizada diretamente no painel administrativo. Para alterar os dados iniciais que povoam a aplicação antes da primeira utilização, edite a constante `CONFIG_PADRAO` localizada no início do ficheiro `assets/js/scripts.js`.

```

```
