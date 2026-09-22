-- ============================================================================
-- ESPETO LIVRE — Dados iniciais (cardápio, bairros e dados da loja)
-- ============================================================================
-- Rode DEPOIS do schema.sql. É seguro rodar mais de uma vez: só preenche o que
-- ainda está vazio, nunca sobrescreve o que você já editou no painel.
-- ============================================================================

-- Dados da loja (só se ainda não foram preenchidos)
update loja_config set
  nome_loja = 'Espeto Livre',
  tagline = 'Espetinho na brasa, do seu jeito',
  whatsapp = '5585991241960',
  instagram = 'https://www.instagram.com/espetolivre/',
  endereco_texto = 'Rua Dr. Zamenhof, 320 - Cocó, Fortaleza - CE, 60192-280',
  endereco_mapa_busca = 'Rua Dr. Zamenhof, 320 - Cocó, Fortaleza - CE, 60192-280',
  endereco_lat = -3.7445113,
  endereco_lng = -38.4765676,
  endereco_url_google_maps = 'https://www.google.com/maps/place/Espeto+Livre/@-3.7445113,-38.4765676,869m/data=!3m2!1e3!4b1!4m6!3m5!1s0x7c7470068e64bab:0x76af607d565973e6!8m2!3d-3.7445113!4d-38.4765676!16s%2Fg%2F11zgs2y1bw',
  cidade_uf = 'Fortaleza - CE',
  preco_gasolina = 6.43,
  consumo_km_litro = 12,
  taxa_base_entrega = 4.00,
  horarios = '[
    {"dia":0,"nome":"Domingo","aberto":true,"abertura":"17:00","fechamento":"22:00"},
    {"dia":1,"nome":"Segunda","aberto":true,"abertura":"18:00","fechamento":"23:00"},
    {"dia":2,"nome":"Terça","aberto":true,"abertura":"18:00","fechamento":"23:00"},
    {"dia":3,"nome":"Quarta","aberto":true,"abertura":"18:00","fechamento":"23:00"},
    {"dia":4,"nome":"Quinta","aberto":true,"abertura":"18:00","fechamento":"23:00"},
    {"dia":5,"nome":"Sexta","aberto":true,"abertura":"18:00","fechamento":"00:00"},
    {"dia":6,"nome":"Sábado","aberto":true,"abertura":"18:00","fechamento":"00:00"}
  ]'::jsonb
where id = 1 and whatsapp = '';

-- Cardápio (só se a tabela estiver vazia)
insert into produtos (nome, categoria, preco, descricao, emoji, disponivel)
select * from (values
  ('Espeto de Carne', 'Espetos de Carne', 9, 'Alcatra em cubos, tempero da casa', '🥩', true),
  ('Espeto de Picanha', 'Espetos de Carne', 14, 'Picanha nobre, ponto no carvão', '🥩', true),
  ('Espeto de Maminha', 'Espetos de Carne', 12, 'Maminha macia, suco na primeira mordida', '🥩', true),
  ('Carne com Bacon', 'Espetos de Carne', 11, 'Cubos de carne enrolados no bacon', '🥓', true),
  ('Kafta', 'Espetos de Carne', 10, 'Kafta temperada, receita da casa', '🍢', true),
  ('Espeto de Frango', 'Espetos de Frango', 8, 'Peito de frango marinado e grelhado', '🍗', true),
  ('Medalhão de Frango c/ Bacon', 'Espetos de Frango', 9, 'Frango enrolado no bacon crocante', '🍗', true),
  ('Coração de Frango', 'Espetos de Frango', 8, 'Clássico de boteco, no ponto certo', '❤️', true),
  ('Frango com Catupiry', 'Espetos de Frango', 10, 'Frango recheado, derretendo por dentro', '🍗', true),
  ('Linguiça Toscana', 'Suínos & Embutidos', 9, 'Linguiça artesanal na brasa', '🌭', true),
  ('Costelinha Suína', 'Suínos & Embutidos', 11, 'Costela suína, tempero defumado', '🍖', true),
  ('Bacon Enrolado', 'Suínos & Embutidos', 9, 'Bacon crocante puro no espeto', '🥓', true),
  ('Espeto de Camarão', 'Camarão & Peixe', 16, 'Camarão grande grelhado no ponto', '🍤', true),
  ('Filé de Tilápia na Brasa', 'Camarão & Peixe', 14, 'Filé fresco temperado e grelhado', '🐟', true),
  ('Queijo Coalho', 'Vegetariano', 10, 'Queijo coalho tradicional na brasa', '🧀', true),
  ('Queijo Coalho com Melaço', 'Vegetariano', 11, 'Queijo coalho com melaço de cana', '🧀', true),
  ('Espeto de Legumes', 'Vegetariano', 8, 'Pimentão, cebola, abobrinha e tomate', '🥦', true),
  ('Abacaxi na Brasa', 'Vegetariano', 7, 'Abacaxi grelhado com canela', '🍍', true),
  ('Farofa', 'Acompanhamentos', 6, 'Farofa temperada da casa', '🍚', true),
  ('Vinagrete', 'Acompanhamentos', 5, 'Vinagrete fresquinho', '🥗', true),
  ('Pão de Alho', 'Acompanhamentos', 7, 'Pão de alho na brasa, derretendo manteiga', '🥖', true),
  ('Baião de Dois', 'Acompanhamentos', 12, 'Arroz, feijão verde e queijo coalho', '🍛', true),
  ('Batata Frita', 'Acompanhamentos', 14, 'Porção crocante, serve bem 2 pessoas', '🍟', true),
  ('Arroz à Grega', 'Acompanhamentos', 10, 'Arroz com legumes salteados', '🍚', true),
  ('Água Mineral', 'Bebidas', 4, '500ml, com ou sem gás', '💧', true),
  ('Refrigerante Lata', 'Bebidas', 6, '350ml, sabores variados', '🥤', true),
  ('Suco Natural', 'Bebidas', 8, 'Feito na hora, pergunte o sabor do dia', '🧃', true),
  ('Cerveja Long Neck', 'Bebidas', 9, 'Long neck gelada', '🍺', true),
  ('Cerveja Lata', 'Bebidas', 7, 'Lata 350ml, geladíssima', '🍺', true)
) as v(nome, categoria, preco, descricao, emoji, disponivel)
where not exists (select 1 from produtos);

-- Bairros e distâncias estimadas (só se a tabela estiver vazia).
-- ATENÇÃO: as distâncias são estimativas — ajuste em Admin → Entrega.
insert into bairros (nome, distancia_km)
select * from (values
  ('Centro', 3),
  ('Praia de Iracema', 4),
  ('Jacarecanga', 5),
  ('Moura Brasil', 4),
  ('Aldeota', 5),
  ('Meireles', 6),
  ('Varjota', 7),
  ('Dionísio Torres', 6),
  ('Joaquim Távora', 7),
  ('Bairro de Fátima', 5),
  ('Benfica', 4),
  ('Damas', 3),
  ('Montese', 5),
  ('Parquelândia', 6),
  ('Presidente Kennedy', 6),
  ('Rodolfo Teófilo', 6),
  ('Cocó', 9),
  ('Papicu', 8),
  ('Mucuripe', 8),
  ('Vicente Pinzon', 9),
  ('Luciano Cavalcante', 10),
  ('Cambeba', 11),
  ('Sapiranga', 12),
  ('Guararapes', 13),
  ('Água Fria', 8),
  ('Bom Jardim', 10),
  ('Barra do Ceará', 9),
  ('Vila Velha', 8),
  ('Antônio Bezerra', 7),
  ('Parangaba', 9),
  ('Maraponga', 11),
  ('Messejana', 14),
  ('Jangurussu', 15),
  ('Barroso', 16),
  ('Cidade dos Funcionários', 12),
  ('Edson Queiroz', 13),
  ('Passaré', 14),
  ('Cajazeiras', 15),
  ('Genibaú', 12),
  ('Cidade 2000', 10),
  ('Praia do Futuro', 12),
  ('José de Alencar', 13),
  ('Caucaia (RMF)', 20),
  ('Maracanaú (RMF)', 18),
  ('Eusébio (RMF)', 17),
  ('Aquiraz (RMF)', 25),
  ('Itaitinga (RMF)', 22),
  ('Pacatuba (RMF)', 19),
  ('Maranguape (RMF)', 24),
  ('Horizonte (RMF)', 30)
) as v(nome, distancia_km)
where not exists (select 1 from bairros);
