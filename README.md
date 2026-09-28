# Estação 1 — Simulador Next.js

Aplicação unificada do Simulador Comercial em Next.js 16 e TypeScript. A tela,
as APIs, a autenticação, a sincronização e os serviços do CVCRM são executados
pelo mesmo processo na porta 3002. O servidor JavaScript da porta 3001 e o
`iframe` não são mais necessários.

## Preparar e executar

```bash
npm install
copy .env.example .env
npm run dev
```

Acesse `http://localhost:3002/simulador`.

Para produção:

```bash
npm run build
npm start
```

## Verificar

```bash
npm run check
```

Esse comando verifica a tipagem, executa os testes do plano de pagamento e gera
o build da interface e do servidor.

## Organização

- `src/app`: páginas e rotas nativas do Next.js.
- `src/components`: componentes React.
- `src/features`: regras de negócio tipadas e testáveis.
- `src/legacy`: módulos da interface atual convertidos para TypeScript e
  incorporados ao bundle do Next, preservando integralmente o comportamento.
- `server`: integração, autenticação, sincronização, arquivos e rotas CVCRM em
  TypeScript.
- `public/styles`: estilos fragmentados por responsabilidade.
- `data`: dados locais, anexos, histórico e configurações.

## Segurança do CVCRM

Mantenha `CVCRM_RESERVATION_WRITE_ENABLED=false` durante a homologação. Nessa
condição, a proposta e a reserva são validadas localmente, mas nenhuma criação é
enviada ao CVCRM. Tokens devem ficar somente no arquivo `.env`, que não deve ser
incluído no pacote ou no controle de versão.
