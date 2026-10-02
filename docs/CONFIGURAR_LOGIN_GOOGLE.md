# Ativar o login com Google no Dairus

O app já está pronto. Falta ligar o Google ao projeto **dairus** do Supabase
(`https://wcxfjmifikmnydfpepiq.supabase.co`). São 3 partes, feitas uma vez só.

## 1. Google Cloud: tela de consentimento

1. Abra https://console.cloud.google.com/ e crie (ou escolha) um projeto, por exemplo "Dairus".
2. Vá em **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform → Branding").
3. Tipo de usuário: **Externo**. Nome do app: **Dairus**. Preencha seu e-mail de suporte e de contato.
4. Em **Público-alvo / Usuários de teste**, adicione **o seu e-mail e o do seu amigo**.
   Enquanto o app estiver em modo "Teste", só esses e-mails conseguem entrar.

## 2. Google Cloud: credencial OAuth

1. Vá em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo de aplicativo: **Aplicativo da Web**. Nome: "Dairus Supabase".
3. Em **URIs de redirecionamento autorizados**, adicione exatamente:

   ```
   https://wcxfjmifikmnydfpepiq.supabase.co/auth/v1/callback
   ```

4. Clique em **Criar** e copie o **ID do cliente** e a **Chave secreta do cliente**.

## 3. Supabase: ligar o Google e liberar o retorno para o app

1. Abra https://supabase.com/dashboard/project/wcxfjmifikmnydfpepiq
2. **Authentication → Sign In / Providers → Google**: ative, cole o **ID do cliente** e a
   **Chave secreta**, e salve.
3. **Authentication → URL Configuration → Redirect URLs → Add URL** e adicione:

   ```
   http://127.0.0.1:47821/callback
   ```

   (É o endereço local onde o Dairus recebe a resposta do login.)

## Pronto

Abra o Dairus e clique em **Entrar com Google**. O navegador abre, você escolhe a conta,
e o app entra sozinho. Cada conta Google tem o seu próprio banco de dados, preferências,
PIN e pastas de backup (`Documentos\Dairus\<id da conta>\…`).

### Se algo der errado

- **"O login com Google ainda não foi ativado no Supabase"**: falta o passo 3.2.
- **O navegador abre uma página em `localhost:3000` com erro**: falta o passo 3.3.
- **"Acesso bloqueado: app não verificado" / "acesso negado"**: o e-mail não está na lista
  de usuários de teste (passo 1.4).
- **"A porta 47821 está ocupada"**: feche o Dairus que estiver aberto em outra janela e tente de novo.
