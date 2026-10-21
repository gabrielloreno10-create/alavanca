-- 016 — guarda da role de aplicacao
--
-- A 001 nao pode mais MANDAR que `alavanca_app` nao seja superusuario nem fure a RLS:
-- em banco gerenciado nao ha superusuario para executar esse comando, e a migration
-- inteira falhava (ver o comentario na 001).
--
-- Entao aqui a gente CONFERE em vez de mandar. Isso vale mais: um `alter role` so afirma
-- a regra no dia em que roda, enquanto esta checagem falha o deploy sempre que o banco
-- estiver fora do contrato — inclusive se alguem promover a role depois, por engano.
--
-- Se esta migration falhar, NAO contorne. Significa que a role que o painel usa consegue
-- ler e escrever a linha de qualquer restaurante, e o isolamento entre clientes deixou de
-- existir. Reveja quem alterou a role.

do $$
declare
  r record;
  problemas text[] := '{}';
begin
  select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
    into r
    from pg_roles
   where rolname = 'alavanca_app';

  if not found then
    raise exception
      'role alavanca_app nao existe: a 001 deveria te-la criado'
      using hint = 'rode as migrations na ordem, a partir da 001';
  end if;

  -- Os dois que quebram o isolamento entre restaurantes.
  if r.rolsuper then
    problemas := problemas || 'SUPERUSER (passa por cima de toda RLS)';
  end if;
  if r.rolbypassrls then
    problemas := problemas || 'BYPASSRLS (le e escreve linha de qualquer tenant)';
  end if;

  -- Estes dois nao quebram isolamento, mas a role de aplicacao nao tem por que te-los.
  if r.rolcreaterole then
    problemas := problemas || 'CREATEROLE (pode criar role e se promover)';
  end if;
  if r.rolcreatedb then
    problemas := problemas || 'CREATEDB';
  end if;

  if array_length(problemas, 1) is not null then
    raise exception
      'alavanca_app esta com atributo que nao deveria ter: %',
      array_to_string(problemas, ', ')
      using hint =
        'rode: alter role alavanca_app nocreatedb nocreaterole; '
        'SUPERUSER e BYPASSRLS so o superusuario do cluster consegue tirar.';
  end if;
end
$$;

comment on schema alavanca is
  'Plataforma Alavanca. Toda tabela de dominio tem tenant_id e RLS; a aplicacao conecta '
  'como alavanca_app, que e conferida pela migration 016.';
