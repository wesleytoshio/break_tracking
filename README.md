# Controle de Pausas — Desktop (Electron)

Aplicativo desktop para controle operacional de pausas de funcionários, empacotado com **Electron** e com **notificações nativas do Windows**.

## Executar em desenvolvimento

```bash
npm install
npm start
```

## Gerar o instalador (.exe) para Windows

```bash
npm install --save-dev electron-builder
npm run dist
```

O instalador NSIS é gerado na pasta `dist/`.

## Estrutura

| Arquivo | Papel |
|---|---|
| `main.js` | Processo principal do Electron: cria a janela e dispara as notificações nativas do Windows. |
| `preload.js` | Ponte segura (`contextIsolation`) que expõe `window.electronAPI.notify` ao app. |
| `Controle de Pausas.dc.html` | Interface do app (template + lógica). |
| `support.js` | Runtime que renderiza a interface com React. |
| `vendor/react*.min.js` | React e ReactDOM **empacotados localmente** — o app roda **offline** (sem CDN). |
| `assets/icon.ico` / `icon.png` | Ícone do app (janela, bandeja, instalador e notificações). |

## Executa em segundo plano (igual Discord / Steam)

Ao **fechar a janela**, o app **não encerra**: ele minimiza para a **bandeja do
sistema** e continua rodando em segundo plano, monitorando as pausas e disparando
notificações do Windows.

- **Clique no ícone da bandeja** → reabre a janela.
- **Menu do ícone (botão direito)** → *Abrir Controle de Pausas* ou *Sair*.
- Só o menu **Sair** encerra o app de verdade.
- `backgroundThrottling: false` garante que os timers continuem no ritmo normal
  mesmo com a janela escondida, para as pausas não atrasarem.

## Notificações nativas do Windows

Toda notificação da interface (pausa concluída, pausa iniciada/finalizada, cadastro
de funcionário) dispara um **toast nativo do Windows**, além do toast interno.

Fluxo: `toast()` no app → `window.electronAPI.notify()` (preload) → IPC → `Notification`
do Electron no processo principal (`main.js`).

O `main.js` define `app.setAppUserModelId(...)`, **obrigatório no Windows** para que
os toasts sejam exibidos corretamente. Em desenvolvimento (`npm start`) a notificação
pode aparecer com o nome/ícone genérico do Electron; após instalar via `npm run dist`,
ela usa o nome e o ícone do app.

> **Se o banner não aparecer**, o motivo está nas configurações do Windows (vale
> para qualquer app, inclusive Discord/Steam):
> 1. **Notificações desligadas**: Configurações → Sistema → Notificações → ligado.
>    (Equivale a `HKCU\...\PushNotifications\ToastEnabled = 1`.)
> 2. **Assistente de Foco / Não Perturbe ativo**: jogos e apps em **tela cheia**
>    ativam isso automaticamente e seguram os banners. Nesse caso a notificação
>    ainda é entregue na **Central de Ações**.

## Observações técnicas

- Não há um `Content-Security-Policy` restritivo de propósito: o runtime `support.js`
  usa `new Function` para avaliar a lógica do app, o que exige `unsafe-eval`.
- Os dados são de demonstração e ficam em memória (sem backend/persistência).
