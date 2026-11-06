# Roadmap do MVP — Vigintel

App Android de segurança pessoal: o usuário cadastra **contatos de confiança** e **frases-código**. O app escuta **em segundo plano** e, quando reconhece uma frase-código, envia um alerta com localização para os contatos **sem dar nenhum sinal no celular**.

> Prazo estimado (1 dev): **7 a 10 semanas**.
> Ordem recomendada: **Fase 0 → Fase 1 → Fase 1.5 → demais fases**. A escuta em segundo plano é o que valida o produto.

---

## Sumário

1. [Requisitos do MVP](#1-requisitos-do-mvp)
2. [Decisão técnica: reconhecimento de voz](#2-decisão-técnica-reconhecimento-de-voz)
3. [Decisão técnica: envio das mensagens](#3-decisão-técnica-envio-das-mensagens)
4. [Arquitetura](#4-arquitetura)
5. [Escuta em segundo plano: o que o Android permite](#5-escuta-em-segundo-plano-o-que-o-android-permite)
6. [Passo a passo por fases](#6-passo-a-passo-por-fases)
7. [Evolução pós-MVP (com investimento)](#7-evolução-pós-mvp-com-investimento)
8. [Checklist geral](#8-checklist-geral)

---

## 1. Requisitos do MVP

| Requisito | Descrição |
|---|---|
| Escuta em segundo plano | **Indispensável.** Funciona com app minimizado, tela bloqueada e app fora dos recentes |
| Discrição total | Nenhum som, vibração, tela acendendo ou app abrindo ao disparar |
| Reconhecimento gratuito e offline | Sem custo de licença, sem enviar áudio para a nuvem |
| Baixo consumo de bateria | Processar áudio só quando houver voz humana |
| Envio automático | Mensagem sai do servidor, sem o usuário apertar "Enviar" |
| Confiabilidade | Fila offline, reenvio automático, aviso quando a proteção estiver pausada |
| Privacidade (LGPD) | O áudio nunca sai do celular e não é gravado |

---

## 2. Decisão técnica: reconhecimento de voz

| Opção | Grátis | Offline | Português | Bateria | Veredito |
|---|---|---|---|---|---|
| `expo-speech-recognition` (atual) | Sim | Não (como está configurado) | Sim | Ruim: reinicia a cada ~1 s e emite bip em muitos aparelhos | **Descartar** |
| **Vosk + gramática restrita + VAD** | Sim (Apache 2.0) | Sim | Sim (`vosk-model-small-pt`, ~31 MB) | Boa com VAD | **Escolha do MVP** |
| sherpa-onnx KWS | Sim | Sim | Sem modelo oficial em PT (só EN/ZH) | Excelente | Evolução futura |
| Picovoice Porcupine | Só uso pessoal / teste | Sim | Sim | Excelente | Evolução paga |

### Como economizar bateria

- **VAD (Voice Activity Detection)** — Silero ou WebRTC (gratuitos, ex.: biblioteca `android-vad`). Modelo minúsculo que só responde "tem voz humana agora?". Em silêncio, o Vosk **não processa nada**. É a maior economia.
- **Gramática restrita** — o Vosk recebe apenas as frases-código + `[unk]`. Ele deixa de ser um transcritor geral e só decide "é a frase" ou "não é". Menos CPU e menos falsos positivos.
- **Tudo em código nativo (Kotlin)** — o JavaScript não participa do pipeline de áudio.
- **GPS desligado** fora dos momentos de alerta.

### Frases-código

- Não usar "socorro" / "perigo": o agressor escuta.
- Usar frases **naturais numa conversa** e com **2+ palavras** (ex.: "tia Cida ligou", "abacaxi azul").
- Todas as palavras precisam existir no **vocabulário do modelo Vosk** — validar no cadastro.

---

## 3. Decisão técnica: envio das mensagens

| Canal | Custo | Uso no MVP |
|---|---|---|
| WhatsApp Cloud API (oficial, Meta) — **número de teste** | Gratuito, até 5 destinatários cadastrados | Piloto / demonstração |
| WhatsApp Cloud API — número verificado | Centavos por mensagem (template) | Após investimento |
| Telegram Bot API | 100% gratuito | Canal secundário / fallback |
| APIs não oficiais (Evolution, Z-API, Baileys) | Baratas | **Não usar**: violam os termos, risco de banimento, inaceitável para emergência |

**N8N:** opcional e **fora do caminho crítico**. A Supabase Edge Function faz o envio; o N8N pode ser chamado por ela para fluxos secundários (logs, e-mail, painel). Nunca expor webhook do N8N diretamente no app.

---

## 4. Arquitetura

```text
[Celular Android]
  Foreground Service nativo (Kotlin, tipo "microphone")
    AudioRecord 16 kHz mono
      → VAD (descarta silêncio)
        → Vosk (gramática = frases-código)
          → detectou?
              → salva alerta no SQLite (fila)
              → pega localização
              → HTTP POST para a Edge Function (JWT do usuário)
              → se falhar: WorkManager reenvia até conseguir
  App React Native: login, cadastro, histórico, configurações, status

[Supabase — plano gratuito]
  Auth + tabelas com RLS + Edge Function "send-alert"
    → WhatsApp Cloud API (template) → contatos
    → Telegram Bot (fallback)
    → atualiza status do alerta
```

Por que nativo: com a tela desligada o Android pode pausar ou limitar o JavaScript. O código Kotlin dentro do serviço continua rodando.

---

## 5. Escuta em segundo plano: o que o Android permite

No Android, o recurso chama-se **Foreground Service**. Apesar do nome, ele roda **fora do app** (tela bloqueada, celular no bolso). O "primeiro plano" só significa que o sistema exige um ícone fixo na barra de notificações enquanto ele está ativo.

| Situação | Funciona? | Observação |
|---|---|---|
| App aberto | Sim | |
| App minimizado | Sim | |
| Tela bloqueada, celular no bolso | Sim | Cenário principal |
| App removido dos recentes | Sim na maioria | `stopWithTask="false"`; alguns fabricantes exigem liberação manual |
| Economia de bateria / Doze | Sim | Foreground services ficam isentos da maior parte das restrições |
| Durante ligação ou outro app gravando | **Não, temporariamente** | O Android entrega silêncio ao app de fundo; retoma sozinho depois |
| Após reiniciar o celular | **Parcial** | Android 14/15+ não permite ligar microfone no boot; app mostra notificação "Toque para reativar" |
| "Forçar parada" nas configurações | Não | Nenhum app contorna |
| Indicador verde de microfone (Android 12+) | Sempre visível | Limitação da plataforma |

Regra de ouro: quando a proteção estiver pausada, o app **detecta e avisa** — nunca falha em silêncio.

---

## 6. Passo a passo por fases

### Fase 0 — Prova de conceito da voz (2 a 4 dias)

Objetivo: validar a precisão do Vosk em português antes de investir no resto.

- [x] Baixar o `vosk-model-small-pt` em <https://alphacephei.com/vosk/models> (pasta `assets/model-small-pt`)
- [ ] Testar com a lib `react-native-vosk` (tem config plugin Expo e aceita `grammar`)
- [ ] Rodar junto com o foreground service do Notifee já existente e testar **com a tela bloqueada**
- [ ] Testar 3–4 frases-código candidatas: bolso, rua com barulho, TV ligada, voz baixa/tensa
- [ ] Medir por frase: taxa de acerto, falsos positivos por hora, tempo até detectar

**Critério para seguir:** > 85% de acerto falando normalmente e ~0 falsos positivos em 1 h de TV/conversa.

---

### Fase 1 — Serviço nativo de escuta em segundo plano (1,5 a 2 semanas)

Peça central do MVP. Criar o Expo Module local `modules/vigintel-listener` (Kotlin).

**1. Serviço declarado no manifesto (via config plugin)**

- [ ] `android:foregroundServiceType="microphone"`
- [ ] `android:stopWithTask="false"`
- [ ] Permissões: `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`

**2. Ciclo de vida robusto**

- [ ] `onStartCommand` retorna `START_STICKY`
- [ ] `PARTIAL_WAKE_LOCK` enquanto a proteção estiver ligada
- [ ] Estado "proteção ligada" persistido; ao ser recriado, o serviço volta a escutar sozinho

**3. Pipeline de áudio 100% nativo**

- [ ] `AudioRecord` 16 kHz, mono, PCM 16 bits, frames de 30 ms
- [ ] VAD (Silero ou WebRTC); só frames com voz vão ao Vosk, com ~300 ms de pré-buffer
- [ ] `Recognizer(model, 16000, grammarJson)` com `setWords(true)` para obter confiança por palavra
- [ ] Regras de disparo: frase completa + confiança acima de limite configurável + cooldown

**4. Microfone ocupado**

- [ ] `AudioRecordingCallback` detecta quando outro app pegou o microfone
- [ ] Pausa e retoma automaticamente; status registrado

**5. Disparo feito pelo próprio serviço**

- [ ] Salva alerta no SQLite **antes de tudo** (com `client_alert_id` UUID)
- [ ] Obtém localização (última conhecida + leitura rápida)
- [ ] POST para a Edge Function; em falha, agenda WorkManager

**6. API para o JavaScript (somente UI)**

- [ ] `start()`, `stop()`, `updateKeywords(list)`, `getStatus()`
- [ ] Eventos `onStatusChange` e `onDetection`
- [ ] Validação: cada palavra da frase existe no vocabulário do modelo

**7. Limpeza**

- [ ] Remover `expo-speech-recognition` e o `src/device/listeningService.ts` atual

**Critério para seguir:** tela bloqueada há 30 min, app fora dos recentes, frase falada → alerta registrado em ≤ 3 s, em pelo menos 2 aparelhos diferentes.

---

### Fase 1.5 — Vigilância da proteção (3 a 4 dias)

Garante que o usuário saiba se está protegido.

- [ ] **Watchdog:** WorkManager periódico (15 min) confere se o serviço está vivo quando deveria estar
- [ ] Se morreu: notificação discreta "Toque para reativar" (o Android não permite religar o microfone a partir do fundo)
- [ ] **Boot:** receiver de `BOOT_COMPLETED` religa quando permitido; senão, mostra a notificação de reativação
- [ ] **Tela inicial:** indicador de estado — Protegido / Pausado (microfone em uso) / Desligado — com o motivo
- [ ] (Recomendado) Heartbeat para o Supabase a cada 30–60 min

---

### Fase 2 — Alerta 100% silencioso (2 a 3 dias)

- [ ] Em `src/device/alertService.ts`, remover: som, vibração, `fullScreenAction`, `lightUpScreen`, `bypassDnd`
- [ ] Não abrir mais o WhatsApp (remover `pendingWhatsApp` / `alertNotificationHandlers` do fluxo de alerta)
- [ ] O alerta aparece apenas no histórico do app
- [ ] Notificação fixa do serviço: importância mínima, texto neutro (sem "emergência")
- [ ] (Opcional) Nome e ícone alternativos via `activity-alias`
- [ ] Renomear o app (hoje "Escuta Alertas" entrega o propósito)

---

### Fase 3 — Backend no Supabase (1 semana)

- [ ] Criar projeto, tabelas e RLS (SQL já no `README.md`, seção 10)
- [ ] Em `alerts`, adicionar: `status` (`pending` / `sent` / `failed`), `client_alert_id` (unique, idempotência), `error`
- [ ] Tabela `alert_deliveries` (1 linha por contato/canal) para rastrear entrega
- [ ] Tela de login (e-mail + senha)
- [ ] Sincronização: SQLite como cache offline, Supabase como fonte de verdade
- [ ] Token acessível ao serviço nativo: JS entrega ao módulo → `EncryptedSharedPreferences`; serviço renova sozinho ao expirar

---

### Fase 4 — Envio das mensagens (1 semana)

- [ ] Edge Function `send-alert`: valida JWT → grava alerta (idempotente por `client_alert_id`) → busca contatos → envia
- [ ] **WhatsApp Cloud API:** criar app na Meta, usar número de teste, criar e aprovar template "alerta" (nome, horário, link do mapa), token nos secrets da função
- [ ] **Telegram:** criar bot no BotFather; contato inicia conversa via link de convite; função envia para o `chat_id`
- [ ] **Opt-in do contato:** ao cadastrar, enviar convite ("Fulano te adicionou como contato de confiança no Vigintel")
- [ ] Mensagem de "alarme falso" (usada na Fase 5)
- [ ] (Opcional) Edge Function chama N8N para fluxos secundários

---

### Fase 5 — Confiabilidade do disparo (3 a 5 dias)

- [ ] Alerta persistido no SQLite antes de qualquer outra ação
- [ ] Localização: última conhecida + leitura nova rápida; se chegar depois, enviar atualização
- [ ] HTTP com OkHttp; em falha, WorkManager com restrição "com rede" e backoff exponencial
- [ ] Após o alerta: localização atualizada a cada 1–2 min por ~15 min; GPS desligado fora disso
- [ ] Cancelamento discreto: PIN no app envia "alarme falso" aos contatos

---

### Fase 6 — Liberação no aparelho e bateria (4 a 6 dias)

**Onboarding guiado no primeiro uso**

- [ ] Permissão de microfone
- [ ] Permissão de notificações
- [ ] Desativar otimização de bateria para o app
- [ ] Instruções por fabricante (detectar a marca):
  - Xiaomi / Redmi / POCO: Início automático + Economia de bateria "Sem restrições"
  - Samsung: remover de "Apps em suspensão"
  - Motorola e outros: ver <https://dontkillmyapp.com>

**Teste de proteção**

- [ ] Modo teste: usuário bloqueia a tela, fala a frase e confirma que funcionou, **sem enviar** aos contatos

**Medição de bateria**

- [ ] `adb shell dumpsys batterystats` / Battery Historian
- [ ] Cenários de 1 h: silêncio, ambiente com conversa, tela desligada
- [ ] Ajustar sensibilidade do VAD, tamanho de buffer e limite de confiança do Vosk
- [ ] Garantir que nada fique em loop no JavaScript e que o GPS não fique ligado

---

### Fase 7 — Testes e piloto (1 a 2 semanas)

**Matriz de testes (mínimo 3 marcas: Samsung, Xiaomi, Motorola; Android 10–15)**

- [ ] Tela bloqueada por 1 h, 4 h e uma noite inteira
- [ ] App removido dos recentes
- [ ] Celular reiniciado
- [ ] Modo economia de bateria ligado
- [ ] Ligação recebida durante a escuta (deve retomar depois)
- [ ] Sem internet no momento do alerta (deve enviar quando a rede voltar)
- [ ] TV / música ligada por horas (falsos positivos)

**Piloto**

- [ ] 5–10 pessoas por 2 semanas, registrando falsos positivos e falhas de disparo
- [ ] Política de privacidade / LGPD: o áudio nunca sai do celular e não é gravado

---

### Fase 8 — Publicação

- [ ] Declarar o foreground service do tipo microfone no Google Play com **vídeo de justificativa** (usuário ligando a proteção conscientemente, notificação fixa visível)
- [ ] Build de produção (EAS Build ou `npx expo run:android --variant release`)

---

## 7. Evolução pós-MVP (com investimento)

A Fase 1 isola o reconhecimento de voz atrás de uma interface (`start`, `stop`, `updateKeywords`, `onDetection`). Trocar o motor de voz no futuro é uma **troca interna do módulo**, sem mexer no resto do app.

1. **sherpa-onnx KWS treinado em português** (receita icefall): modelo de ~3 MB, mais rápido e econômico que o Vosk, licença gratuita. Custo: treino (GPU + dados).
2. **Picovoice Porcupine com licença comercial:** maior precisão e menor consumo, sem treinar nada.
3. WhatsApp com número verificado, SMS (Twilio / Zenvia) e ligação automática.
4. App para os contatos, com push e mapa em tempo real.
5. Gatilhos físicos alternativos (sequência de botões de volume).
6. Versão iOS (com as limitações da Apple para escuta em segundo plano).

---

## 8. Checklist geral

```text
[ ] Fase 0   — PoC Vosk validada (acerto > 85%, ~0 falsos positivos)
[ ] Fase 1   — Serviço nativo de escuta em segundo plano
[ ] Fase 1.5 — Watchdog, reativação e status da proteção
[ ] Fase 2   — Alerta 100% silencioso
[ ] Fase 3   — Supabase: auth, tabelas, RLS, sync, token no nativo
[ ] Fase 4   — Edge Function + WhatsApp Cloud API + Telegram
[ ] Fase 5   — Fila offline, reenvio, localização contínua, cancelamento
[ ] Fase 6   — Onboarding de permissões/bateria + medição de consumo
[ ] Fase 7   — Matriz de testes + piloto
[ ] Fase 8   — Publicação no Google Play
```
