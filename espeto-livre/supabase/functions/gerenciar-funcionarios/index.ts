// ============================================================================
// Edge Function: gerenciar-funcionarios
// ----------------------------------------------------------------------------
// Criar, editar e excluir funcionários (usuários do Supabase Auth + perfil na
// tabela `funcionarios`). Precisa da chave de serviço, por isso roda aqui no
// servidor e nunca no navegador.
//
// Quem pode chamar: apenas GESTOR ou ADMIN ativos (o token JWT de quem chama é
// verificado). Regras de segurança aplicadas AQUI, no servidor:
//   - só um ADMIN cria, edita, promove ou exclui outro ADMIN (gestor não se
//     promove nem cria admin);
//   - ninguém desativa, rebaixa ou exclui a própria conta;
//   - o último admin ativo nunca pode ser removido/desativado/rebaixado.
//
// Corpo da requisição (JSON):
//   { acao: 'criar',     nome, email, senha, perfil, ativo?, foto? }
//   { acao: 'atualizar', id, nome, email, senha?, perfil, ativo, foto? }
//   { acao: 'excluir',   id }
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const PERFIS = ['funcionario', 'gestor', 'admin'] as const;
type Perfil = typeof PERFIS[number];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const erro = (mensagem: string, status = 400) => json({ erro: mensagem }, status);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return erro('Método não permitido.', 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, chaveServico, { auth: { persistSession: false, autoRefreshToken: false } });

    // ---- 1. Quem está chamando? ----
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return erro('Não autenticado.', 401);
    const { data: sessao, error: erroSessao } = await admin.auth.getUser(token);
    if (erroSessao || !sessao?.user) return erro('Sessão inválida. Entre novamente.', 401);

    const { data: solicitante } = await admin
      .from('funcionarios').select('id, perfil, ativo').eq('id', sessao.user.id).maybeSingle();
    if (!solicitante || !solicitante.ativo || !['gestor', 'admin'].includes(solicitante.perfil)) {
      return erro('Sem permissão para gerenciar funcionários.', 403);
    }
    const souAdmin = solicitante.perfil === 'admin';

    let corpo: Record<string, unknown>;
    try { corpo = await req.json(); } catch { return erro('Requisição inválida.'); }
    const acao = corpo.acao;

    // quantos OUTROS admins ativos existem além do alvo?
    const outrosAdminsAtivos = async (idAlvo: string) => {
      const { count } = await admin.from('funcionarios').select('id', { count: 'exact', head: true })
        .eq('perfil', 'admin').eq('ativo', true).neq('id', idAlvo);
      return count ?? 0;
    };

    // ---- 2. Ações ----
    if (acao === 'criar') {
      const nome = String(corpo.nome ?? '').trim();
      const email = String(corpo.email ?? '').trim().toLowerCase();
      const senha = String(corpo.senha ?? '');
      const perfil = String(corpo.perfil ?? '') as Perfil;
      const ativo = corpo.ativo !== false;
      const foto = corpo.foto ? String(corpo.foto) : null;

      if (nome.length < 2 || nome.length > 100) return erro('Informe o nome do funcionário.');
      if (!EMAIL_RE.test(email)) return erro('Informe um e-mail válido.');
      if (senha.length < 8 || senha.length > 72) return erro('A senha precisa ter de 8 a 72 caracteres.');
      if (!PERFIS.includes(perfil)) return erro('Perfil inválido.');
      if (perfil === 'admin' && !souAdmin) return erro('Só um administrador pode criar outro administrador.', 403);
      if (foto && foto.length > 300_000) return erro('Foto muito grande.');

      const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true, user_metadata: { nome },
      });
      if (erroCriar || !criado?.user) {
        const jaExiste = /already|registered|exists/i.test(erroCriar?.message ?? '');
        return erro(jaExiste ? 'Já existe um usuário com esse e-mail.' : `Não foi possível criar o usuário: ${erroCriar?.message ?? ''}`, jaExiste ? 409 : 400);
      }

      const { data: linha, error: erroLinha } = await admin.from('funcionarios')
        .insert({ id: criado.user.id, nome, email, perfil, ativo, foto })
        .select().single();
      if (erroLinha) {
        await admin.auth.admin.deleteUser(criado.user.id); // desfaz, pra não sobrar usuário sem perfil
        return erro(`Não foi possível salvar o funcionário: ${erroLinha.message}`);
      }
      if (!ativo) await admin.auth.admin.updateUserById(criado.user.id, { ban_duration: '876000h' });
      return json({ ok: true, funcionario: linha });
    }

    if (acao === 'atualizar') {
      const id = String(corpo.id ?? '');
      const nome = String(corpo.nome ?? '').trim();
      const email = String(corpo.email ?? '').trim().toLowerCase();
      const senha = corpo.senha ? String(corpo.senha) : '';
      const perfil = String(corpo.perfil ?? '') as Perfil;
      const ativo = corpo.ativo !== false;
      const foto = corpo.foto ? String(corpo.foto) : null;

      const { data: alvo } = await admin.from('funcionarios').select('*').eq('id', id).maybeSingle();
      if (!alvo) return erro('Funcionário não encontrado.', 404);

      if (nome.length < 2 || nome.length > 100) return erro('Informe o nome do funcionário.');
      if (!EMAIL_RE.test(email)) return erro('Informe um e-mail válido.');
      if (senha && (senha.length < 8 || senha.length > 72)) return erro('A senha precisa ter de 8 a 72 caracteres.');
      if (!PERFIS.includes(perfil)) return erro('Perfil inválido.');
      if (foto && foto.length > 300_000) return erro('Foto muito grande.');

      if ((alvo.perfil === 'admin' || perfil === 'admin') && !souAdmin) {
        return erro('Só um administrador pode alterar ou criar administradores.', 403);
      }
      if (id === solicitante.id && (!ativo || perfil !== alvo.perfil)) {
        return erro('Você não pode desativar nem alterar o próprio perfil.', 400);
      }
      const deixaDeSerAdminAtivo = alvo.perfil === 'admin' && alvo.ativo && (perfil !== 'admin' || !ativo);
      if (deixaDeSerAdminAtivo && (await outrosAdminsAtivos(id)) < 1) {
        return erro('É preciso manter pelo menos um administrador ativo.', 400);
      }

      const mudancasAuth: Record<string, unknown> = { ban_duration: ativo ? 'none' : '876000h' };
      if (email !== alvo.email) { mudancasAuth.email = email; mudancasAuth.email_confirm = true; }
      if (senha) mudancasAuth.password = senha;
      const { error: erroAuth } = await admin.auth.admin.updateUserById(id, mudancasAuth);
      if (erroAuth) {
        const jaExiste = /already|registered|exists/i.test(erroAuth.message);
        return erro(jaExiste ? 'Já existe um usuário com esse e-mail.' : `Não foi possível atualizar o usuário: ${erroAuth.message}`, jaExiste ? 409 : 400);
      }

      const { data: linha, error: erroLinha } = await admin.from('funcionarios')
        .update({ nome, email, perfil, ativo, foto }).eq('id', id).select().single();
      if (erroLinha) return erro(`Não foi possível salvar o funcionário: ${erroLinha.message}`);
      return json({ ok: true, funcionario: linha });
    }

    if (acao === 'excluir') {
      const id = String(corpo.id ?? '');
      const { data: alvo } = await admin.from('funcionarios').select('id, perfil, ativo').eq('id', id).maybeSingle();
      if (!alvo) return erro('Funcionário não encontrado.', 404);
      if (id === solicitante.id) return erro('Você não pode excluir o próprio usuário.', 400);
      if (alvo.perfil === 'admin' && !souAdmin) return erro('Só um administrador pode excluir outro administrador.', 403);
      if (alvo.perfil === 'admin' && alvo.ativo && (await outrosAdminsAtivos(id)) < 1) {
        return erro('É preciso manter pelo menos um administrador ativo.', 400);
      }
      const { error: erroExcluir } = await admin.auth.admin.deleteUser(id); // a linha em `funcionarios` some junto (on delete cascade)
      if (erroExcluir) return erro(`Não foi possível excluir: ${erroExcluir.message}`);
      return json({ ok: true });
    }

    return erro('Ação desconhecida.');
  } catch (e) {
    console.error('gerenciar-funcionarios:', e);
    return erro('Erro interno. Tente novamente.', 500);
  }
});
