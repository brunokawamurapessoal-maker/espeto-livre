# 🔥 Espeto Livre — Comanda Digital

Site institucional + comanda digital de pedidos para a espetaria **Espeto Livre** (Fortaleza - CE).
Cliente monta o próprio pedido (cardápio, carrinho, entrega/retirada, pagamento) e o pedido chega pronto
no WhatsApp da loja. Inclui painel administrativo completo (cardápio, pedidos, entrega, configurações).

**Site 100% estático** — HTML, CSS e JavaScript puros, sem build step e sem backend. Funciona em
qualquer hospedagem de arquivos estáticos.

---

## 📁 Estrutura do projeto

```
├── index.html              → comanda digital (cardápio + carrinho + checkout)
├── .nojekyll                → evita que o GitHub Pages processe o site como Jekyll
├── assets/
│   ├── css/styles.css       → design system completo do site
│   ├── js/scripts.js        → toda a lógica (cardápio, carrinho, frete, admin, área do cliente)
│   └── images/logo.png      → logomarca
└── pages/
    ├── sobre.html
    ├── contato.html
    ├── perfil.html           → área do cliente (dados + histórico + sugestões)
    └── admin.html            → painel administrativo
```

---

## ▶️ Rodando localmente

Não precisa instalar nada. Duas opções:

**Opção 1 — abrir direto:** dê duplo-clique em `index.html`.

**Opção 2 — servidor local** (recomendado, evita eventuais bloqueios do navegador para `file://`):
```bash
# na pasta do projeto
python3 -m http.server 8080
# depois acesse http://localhost:8080
```

---

## 🚀 Deploy — GitHub Pages (recomendado)

Como o site já vai para o GitHub, o **GitHub Pages** é a opção mais direta: hospedagem gratuita,
HTTPS automático, domínio próprio grátis (`seuusuario.github.io`) e suporte a domínio personalizado
(ex: `www.espetolivre.com.br`) sem custo. Publica direto do repositório, sem passo de build.

### 1. Criar o repositório e subir o código
```bash
# dentro da pasta do projeto (que já vem com o git iniciado)
git remote add origin https://github.com/SEU-USUARIO/espeto-livre.git
git branch -M main
git push -u origin main
```
*(troque `SEU-USUARIO` pelo seu usuário do GitHub — crie o repositório vazio em github.com/new antes de rodar o `push`, sem adicionar README/gitignore por lá para não conflitar)*

### 2. Ativar o GitHub Pages
1. No repositório, vá em **Settings → Pages**
2. Em **Build and deployment → Source**, selecione **Deploy from a branch**
3. Em **Branch**, selecione **main** e a pasta **/ (root)** → **Save**
4. Aguarde 1-2 minutos — o site fica no ar em `https://SEU-USUARIO.github.io/espeto-livre/`

### 3. (Opcional) Domínio próprio
Em **Settings → Pages → Custom domain**, digite seu domínio (ex: `www.espetolivre.com.br`) e configure
no seu provedor de DNS os registros indicados pelo GitHub (documentação oficial:
[docs.github.com/pages/custom-domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)).
Depois marque **Enforce HTTPS**.

### Alternativas (também gratuitas, se preferir)
| Plataforma | Vantagem principal |
|---|---|
| **Cloudflare Pages** | Banda ilimitada, CDN mais amplo (300+ cidades) |
| **Netlify** | Deploy por arrastar-e-soltar, formulários prontos |
| **Vercel** | Deploy automático a cada push, preview por branch |

Todas funcionam do mesmo jeito com este projeto: conectam no repositório do GitHub e publicam
automaticamente a cada `git push` — sem nenhuma configuração de build (é só apontar a raiz do repositório).

---

## 🔑 Acesso ao painel administrativo

Acesse pela tela inicial do site (digite seu e-mail de admin no campo de identificação) ou direto por
`pages/admin.html`.

- **E-mail:** `brunokawamurapessoal@gmail.com`
- **Senha padrão:** `espeto123` ⚠️ **troque assim que possível** em *Admin → Configurações → Segurança*

---

## ⚠️ Como os dados são guardados (importante)

Este projeto **não tem banco de dados nem servidor**. Cardápio, pedidos, clientes e configurações ficam
salvos no `localStorage` do navegador — ou seja, **por aparelho/navegador**, não sincronizado entre eles.

Na prática:
- Pedidos feitos pelo cliente chegam formatados no **WhatsApp da loja** — é esse canal que garante que a
  equipe recebe o pedido na hora, independente de qual aparelho o cliente usou.
- Se vocês editarem o cardápio em mais de um aparelho, as mudanças **não sincronizam sozinhas**.
- Use **Admin → Configurações → Backup** para exportar um `.json` com todos os dados e importar em outro
  aparelho quando precisar.
- Se um dia quiserem sincronização de verdade entre todos os aparelhos (backend + banco de dados), dá pra
  evoluir esse projeto — é uma mudança de arquitetura maior, avise quando quiser seguir por esse caminho.

---

## 🛠️ Customização rápida

Praticamente tudo é editável direto pelo painel admin (Cardápio, Pedidos, Entrega, Configurações), sem
precisar mexer em código. Para alterar os **valores padrão** que aparecem na primeira visita (antes de
qualquer edição pelo admin), edite o objeto `CONFIG_PADRAO` no topo de `assets/js/scripts.js`.
