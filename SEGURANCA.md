# Segurança do Dairus

O Dairus é um aplicativo de **computador** (Tauri). Os dados ficam num banco
SQLite no próprio PC; a internet só é usada para o login com Google (Supabase),
o backup/sincronização opcional (Supabase Storage), a IA (Gemini, com a chave do
usuário) e as atualizações (GitHub Releases). **Não existe servidor próprio nem
API pública do Dairus**, o que muda quais proteções fazem sentido.

## O que está aplicado

| Ameaça | Proteção no Dairus | Onde |
|---|---|---|
| SQL Injection | Todo SQL usa parâmetros (`?1`, `params![]`). Só nomes de tabela fixos do código entram por `format!`, e um teste falha se aparecer SQL montado com texto | `src-tauri/src/db/mod.rs` (`nenhum_sql_montado_com_texto_de_fora`) |
| Força bruta na senha do banco e no código de recuperação | Argon2id (lento de propósito) + limite gravado em disco: 5 erros livres, depois espera de 1 min que dobra a cada erro até 1 h. Fechar o app não zera | `src-tauri/src/limitador.rs` |
| Força bruta no PIN de bloqueio | PBKDF2 (150 mil iterações) + mesmo limite, gravado nas preferências | `src/state/seguranca-store.ts` |
| Ataque de tempo na comparação | Comparação em tempo constante (senha e hash do PIN) | `cripto.rs`, `seguranca-store.ts` |
| Roubo/injeção do código de login | OAuth com PKCE; servidor local só em `127.0.0.1`, só durante o login (5 min), aceita só navegação GET do navegador (recusa `fetch`/imagem de outros sites), código validado por formato | `src-tauri/src/conta.rs` |
| XSS / clickjacking na página de retorno | CSP com hash do único script, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, erro escapado | `conta.rs` (`cabecalhos_seguros`) |
| XSS no app | CSP do Tauri: só recursos próprios e os domínios necessários; `object-src 'none'`, `frame-ancestors 'none'` | `src-tauri/tauri.conf.json` |
| BOLA / IDOR na nuvem | RLS no Supabase: cada usuário só lista/baixa/envia/apaga a própria pasta (`auth.uid()`) no bucket `backups` (privado). Bucket `atualizacoes` é só leitura pública; só o GitHub Actions (service role) grava | Supabase |
| Validação de entrada | Lançamentos: data `AAAA-MM-DD`, descrição ≤ 300, observação ≤ 5.000, até 500 partidas, valor entre 1 centavo e R$ 100 bi, soma sem estouro. IDs de conta só UUID (sem `../`) | `accounting/engine.rs`, `conta.rs` |
| Instalador adulterado | Atualização só de URLs permitidas (releases do repositório ou bucket do Supabase), conferência de SHA-256 e cabeçalho MZ | `src-tauri/src/atualizacao.rs` |
| Dados roubados do disco | Criptografia opcional do banco e dos backups (AES-256-GCM + Argon2id) | `src-tauri/src/cripto.rs` |
| Segredos no Git | `.env`, chaves e certificados no `.gitignore`; varredura com gitleaks a cada push | `.github/workflows/seguranca.yml` |
| Bibliotecas vulneráveis | `npm audit` e `cargo audit` a cada push e todo dia; Dependabot abre PRs de correção | `seguranca.yml`, `.github/dependabot.yml` |

## O que não se aplica (e por quê)

- **Nginx `limit_req`, Fail2Ban, ModSecurity, trocar porta do SSH**: o Dairus não
  tem servidor web, SSH ou FTP. Não há para onde um Hydra mandar requisições de
  login.
- **Cloudflare WAF / Rate Limiting / Bot Fight Mode / Turnstile**: servem para
  sites e APIs públicas. O login é pelo Google (o Google já aplica limite,
  CAPTCHA e 2FA da conta Google). Se um dia houver login por e-mail e senha no
  Supabase, ligue o CAPTCHA (Turnstile) em *Authentication → Attack Protection*.
- **JWT RS256 / cookies `HttpOnly`**: quem emite e assina os tokens é o Supabase
  Auth. O app não é um site, então não há cookies de navegador para proteger.
- **Usuário do banco com menos privilégio**: o SQLite é um arquivo local do
  usuário. No Supabase o app usa só a chave pública (`anon`) + RLS; a chave
  `service_role` fica apenas nos segredos do GitHub Actions.

## Recomendações no painel (fora do código)

1. **2FA na conta Google** de quem usa o Dairus: o login depende dela.
2. **2FA no GitHub e no Supabase** de quem administra o projeto.
3. Supabase → *Authentication → Attack Protection*: o aviso "Leaked Password
   Protection" só vale para login por senha (o Dairus usa só Google).
4. Repositório → *Settings → Code security*: ligar *Secret scanning* e
   *Dependabot alerts*.
