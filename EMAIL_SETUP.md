# Configuração de e-mail do GetGoList

O envio acontece exclusivamente pelas rotas do servidor. Nunca coloque a senha do e-mail em arquivos públicos ou em variáveis com prefixo `NEXT_PUBLIC_`.

## Variáveis da Vercel

- `APP_URL=https://www.getgolist.com`
- `EMAIL_FROM=GetGoList <noreply@getgolist.com>`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER=noreply@getgolist.com`
- `SMTP_PASSWORD`
- `FIREBASE_ADMIN_PROJECT_ID=getgolist`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`

## GoDaddy Professional Email

- `SMTP_HOST=smtpout.secureserver.net`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`

## Microsoft 365 da GoDaddy

- `SMTP_HOST=smtp.office365.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`

No Microsoft 365, ative SMTP AUTH para a conta. Se houver MFA, use uma senha de aplicativo.

Depois de adicionar ou alterar variáveis na Vercel, faça um novo deployment de produção.
