# GetGoList para Android

O aplicativo Android usa Capacitor e mantém o site oficial como fonte única da interface e dos dados.

## Identidade

- Nome: GetGoList
- Application ID: `com.getgolist.app`
- URL de produção: `https://www.getgolist.com`
- Android mínimo: 7.0 (API 24)
- Android alvo: 16 (API 36)

## Comandos

```powershell
npm install
npm run android:sync
npm run android:open
```

O Android Studio precisa estar instalado com o Android SDK 36. O projeto nativo fica na pasta `android`.

## Antes da publicação

- Substituir os ícones e a tela de abertura provisórios pela identidade do GetGoList.
- Configurar a assinatura de produção e guardar o arquivo de chave fora do Git.
- Adaptar o login Google para o fluxo nativo Android.
- Configurar links do domínio para abrir listas compartilhadas no aplicativo.
- Implementar exclusão de conta e publicar política de privacidade.
- Testar em aparelhos reais e gerar o Android App Bundle (`.aab`).
