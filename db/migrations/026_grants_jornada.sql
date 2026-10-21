-- 026_grants_jornada.sql
-- As tabelas de estado do cliente precisam de escrita, nao so de leitura.
--
-- O QUE FALTOU NA 024 E NA 025
-- As duas deram apenas `select` em tenant_modulo e tenant_passo, por analogia
-- com as tabelas de catalogo (modulo, jornada_fase, jornada_passo), que de fato
-- sao so leitura: catalogo e produto, muda por migration.
--
-- Mas tenant_modulo e tenant_passo nao sao catalogo: sao ESTADO DO CLIENTE. O
-- worker precisa gravar neles toda vez que verifica a jornada ou liga um modulo.
-- O erro apareceu na primeira execucao de worker/jornada.py:
--   permission denied for table tenant_passo
--
-- A distincao que ficou clara e vale guardar:
--   catalogo  (o que o produto oferece)  -> select
--   estado    (onde este cliente esta)   -> select, insert, update
-- Nenhuma das duas precisa de delete: passo nao se apaga, se marca como nao
-- feito; modulo nao se apaga, se desliga.
--
-- A RLS continua sendo a defesa de verdade: mesmo com insert liberado, a policy
-- tenant_isolado impede gravar linha de outro tenant.
--
-- Idempotente.

begin;

grant insert, update on alavanca.tenant_passo  to alavanca_app;
grant insert, update on alavanca.tenant_modulo to alavanca_app;

commit;
