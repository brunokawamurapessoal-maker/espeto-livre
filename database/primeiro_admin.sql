-- ============================================================================
-- ESPETO LIVRE — Criar o PRIMEIRO administrador
-- ============================================================================
-- Passo a passo:
--   1. Supabase → Authentication → Users → "Add user" → "Create new user"
--      Informe e-mail e uma SENHA FORTE (não use a antiga "espeto123") e marque
--      "Auto Confirm User".
--   2. Troque o e-mail e o nome abaixo, cole no SQL Editor e rode.
-- Depois disso, os demais funcionários são criados dentro do próprio painel
-- (Admin → Funcionários).
-- ============================================================================
insert into funcionarios (id, nome, email, perfil, ativo)
select id, 'Administrador', email, 'admin', true
from auth.users
where email = 'brunokawamurapessoal@gmail.com'   -- << troque pelo e-mail que você criou
on conflict (id) do update set perfil = 'admin', ativo = true;

-- Confere: deve mostrar 1 linha com perfil = admin
select id, nome, email, perfil, ativo from funcionarios where perfil = 'admin';
