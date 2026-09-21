/* ==========================================================================
   Conexão com o Supabase
   --------------------------------------------------------------------------
   url     → Project Settings → API → Project URL
   anonKey → Project Settings → API → "anon" "public" key
             (é PÚBLICA por design: a proteção dos dados é feita pelas regras
              RLS do banco, não por esconder essa chave. NUNCA coloque aqui a
              chave "service_role" — essa sim é secreta.)
   ========================================================================== */
window.ESPETO_SUPABASE = {
  url: 'https://tscxuzlulxsetllrbpim.supabase.co',
  anonKey: '' // <<< cole aqui a chave "anon public" do seu projeto
};
