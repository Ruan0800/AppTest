# Escuta Alertas

App Android (Expo / React Native) que monitora palavras-chave por voz e dispara alertas.

Ao detectar uma palavra (ou no botão SOS):

1. Envia notificação local
2. Captura localização (se permitido)
3. Abre o WhatsApp dos contatos com mensagem (origem, horário, GPS, contato)

> **Importante:** não funciona no Expo Go. É preciso gerar um **development build** no notebook.

> **Dados hoje:** o app usa **SQLite local** (`escuta_alertas.db`). A seção **10** explica como preparar o **Supabase** para migrar/sincronizar.

---

## Telas

1. **Início** — liga/desliga escuta + botão SOS
2. **Palavras** — cadastro de palavras-chave
3. **Contatos** — cadastro de contatos (DDI+número, ex: `5511999999999`)
4. **Histórico** — alertas disparados

---

## 1. O que instalar no notebook (Windows)

Faça nesta ordem:

### 1.1 Node.js

- Baixe o **Node.js LTS 20+**: https://nodejs.org
- Confira no terminal:

```bash
node -v
npm -v
```

### 1.2 Git (se for clonar do repositório)

- https://git-scm.com/download/win

### 1.3 Android Studio + SDK

1. Baixe: https://developer.android.com/studio
2. Instale o Android Studio
3. Abra **More Actions → SDK Manager** e marque:
   - **Android SDK Platform** (API 35 ou 36)
   - **Android SDK Build-Tools**
   - **Android SDK Platform-Tools** (inclui o `adb`)
4. Anote o caminho do SDK (geralmente):
   ```
   C:\Users\<SEU_USUARIO>\AppData\Local\Android\Sdk
   ```

### 1.4 Variáveis de ambiente (recomendado)

Nas variáveis de ambiente do Windows:

| Nome            | Valor                                              |
| --------------- | -------------------------------------------------- |
| `ANDROID_HOME`  | `C:\Users\<SEU_USUARIO>\AppData\Local\Android\Sdk` |
| Path (adicione) | `%ANDROID_HOME%\platform-tools`                    |
| Path (adicione) | `%ANDROID_HOME%\emulator` (opcional)               |

Feche e abra o terminal de novo. Teste:

```bash
adb version
```

### 1.5 JDK

O Android Studio já traz um JDK. Se o Gradle reclamar, instale **JDK 17**.

---

## 2. Baixar o projeto

### Opção A — Git

```bash
git clone <URL_DO_REPOSITORIO>
cd TesteApp
```

### Opção B — Copiar pasta

Copie a pasta do projeto (ex.: `TesteApp`) para o outro notebook.  
**Não precisa** copiar `node_modules` nem a pasta `android` (elas são geradas de novo).

---

## 3. Instalar dependências do projeto

No terminal, dentro da pasta do projeto:

```bash
cd C:\Users\<SEU_USUARIO>\Downloads\TesteApp
npm install
```

Se aparecer erro de certificado SSL (rede corporativa):

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED=0
npm install
```

---

## 4. Preparar o celular Android

1. **Configurações → Sobre o telefone → Informações do software**
2. Toque **7 vezes** em **Número da compilação**
3. Volte e abra **Opções do desenvolvedor**
4. Ative **Depuração USB**
5. Conecte o cabo USB no notebook
6. No celular, aceite **Permitir depuração USB**

Confira:

```bash
adb devices
```

Deve aparecer algo como:

```
RXGYB010RSP    device
```

- `unauthorized` → aceite o popup no celular
- `offline` → desconecte/reconecte o cabo e rode `adb kill-server` depois `adb start-server`

---

## 5. Gerar e instalar o app (development build)

Ainda com o celular conectado:

```bash
npx expo run:android
```

O que esse comando faz:

1. Gera a pasta `android/` (prebuild) se precisar
2. Compila o APK (pode demorar **5–15 min** na primeira vez)
3. Instala no celular
4. Tenta abrir o app

### Se der erro de SDK (`SDK location not found`)

Crie o arquivo `android/local.properties` com:

```properties
sdk.dir=C:/Users/<SEU_USUARIO>/AppData/Local/Android/Sdk
```

(use `/` no caminho). Depois rode de novo:

```bash
npx expo run:android
```

### Se der erro do Notifee (`app.notifee:core`)

O projeto já tem plugin/config para isso. Se reaparecer, confira se em `android/build.gradle` existe:

```gradle
maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }
```

---

## 6. Rodar no dia a dia (depois do primeiro build)

Com o celular no USB (depuração autorizada) e o app **já instalado**:

```bash
npm run dev
```

Esse comando faz o que antes era manual: força o Metro a escutar em IPv4 (`127.0.0.1`), cria `adb reverse` da porta 8081 e abre o Escuta Alertas. Deixe o terminal aberto. Mudança de JS recarrega sozinha.

Cache limpo do Metro: `npm run dev -- -c`.

Se a tela ficar cinza ou “Failed to connect”:

```bash
npm run dev:reset
```

`npx expo run:android` só na primeira instalação e quando mudar código nativo (módulo listener, Vosk, permissões, plugins). A URL padrão do development client (`127.0.0.1:8081`) entra no binário nesse build. Depois dele, o ícone do app também cai no Metro via USB.

---

## 7. Como testar o app

1. Em **Contatos**, cadastre alguém com DDI (ex: `5511999999999`) e WhatsApp instalado
2. Em **Palavras**, confirme `socorro` / `perigo`
3. Em **Início**, ligue a escuta e aceite: microfone, notificações, localização
4. Fale uma palavra-chave **ou** toque no **SOS**
5. Deve:
   - mostrar notificação local
   - registrar no **Histórico**
   - abrir o WhatsApp com o texto do alerta (toque em **Enviar**)

Mensagem do WhatsApp inclui:

- origem (palavra ou manual/SOS)
- horário
- localização + link do Maps
- contato

---

## 8. Checklist rápido (outro notebook)

```text
[ ] Node.js 20+
[ ] Android Studio + SDK + platform-tools
[ ] ANDROID_HOME no Path
[ ] adb devices → device
[ ] npm install
[ ] npx expo run:android   (primeira vez / após mudar libs nativas)
[ ] npm run dev
```

---

## 9. Comandos úteis

```bash
# Ver celular
adb devices

# Reiniciar ADB
adb kill-server
adb start-server

# Dia a dia (USB + Metro + abre o app)
npm run dev

# Tela cinza / reconectar
npm run dev:reset

# Build + instalar (primeira vez ou código nativo)
npx expo run:android

# Limpar cache do Metro
npm run dev -- -c

# Ver se o Metro está no ar
curl.exe http://127.0.0.1:8081/status
```

---

## Limitações do MVP

- Escuta contínua gasta mais bateria
- Em segundo plano usa foreground service (notificação “Escuta ativa”)
- WhatsApp abre a conversa; o envio é confirmado manualmente
- Emulador não é ideal para testar voz — use celular físico
- Após mudar módulos nativos (`expo-location`, Notifee, etc.), rode de novo `npx expo run:android`
- Dados ainda ficam no SQLite do aparelho até a integração com Supabase ser implementada no código

---

## 10. Conectar com Supabase (banco na nuvem)

Hoje o app grava em SQLite local (`src/data/sqlite/database.ts`, acessado por `src/data/repositories.ts`):

| Tabela local | Uso                    |
| ------------ | ---------------------- |
| `keywords`   | Palavras-chave         |
| `contacts`   | Contatos de emergência |
| `alerts`     | Histórico de alertas   |

O Supabase deve espelhar essas tabelas (e, de preferência, amarrar tudo a um `user_id` com login).

### 10.1 Criar projeto no Supabase

1. Acesse https://supabase.com e crie uma conta
2. **New project** → escolha nome, senha do banco e região (ex.: `South America`)
3. Espere o projeto ficar **Ready**
4. Vá em **Project Settings → API** e anote:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **anon public** key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

> Nunca use a `service_role` key no app mobile. Só a chave **anon**.

### 10.2 Variáveis de ambiente no app

Na raiz do projeto, crie `.env` (não commitar):

```env
EXPO_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

Confirme que `.env` / `.env*.local` estão no `.gitignore`.

Reinicie o Metro depois de criar/alterar o `.env`:

```bash
npm run dev -- -c
```

### 10.3 Instalar o client Supabase

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
```

(`async-storage` já pode estar no projeto — usado pelo tema.)

### 10.4 Criar as tabelas (SQL Editor)

No Supabase: **SQL → New query** → cole e rode:

```sql
-- Extensão útil para UUIDs
create extension if not exists "pgcrypto";

-- Perfis (opcional, 1:1 com auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Palavras-chave
create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null,
  created_at timestamptz not null default now(),
  unique (user_id, word)
);

-- Contatos de emergência
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text not null, -- preferir E.164: 5511999999999
  created_at timestamptz not null default now()
);

-- Histórico de alertas
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trigger text not null check (trigger in ('voice', 'manual')),
  matched_word text,
  notified boolean not null default false,
  place_name text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists keywords_user_id_idx on public.keywords (user_id);
create index if not exists contacts_user_id_idx on public.contacts (user_id);
create index if not exists alerts_user_id_created_at_idx on public.alerts (user_id, created_at desc);
```

### 10.5 Row Level Security (RLS) — obrigatório

Ainda no SQL Editor:

```sql
alter table public.profiles enable row level security;
alter table public.keywords enable row level security;
alter table public.contacts enable row level security;
alter table public.alerts enable row level security;

-- Cada usuário só vê/edita os próprios dados
create policy "profiles_own"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "keywords_own"
  on public.keywords for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "contacts_own"
  on public.contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "alerts_own"
  on public.alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### 10.6 Autenticação

No Supabase: **Authentication → Providers**

Recomendado para o app:

- **Email** (magic link ou senha)
- (Opcional) Google / Apple depois

Crie um usuário de teste em **Authentication → Users → Add user**.

Sem login (`auth.uid()` nulo), as policies acima **bloqueiam** insert/select — isso é esperado.

### 10.7 Seed de palavras (opcional)

Depois que o usuário existir, você pode inserir seed no app no primeiro login, ou via SQL (troque o UUID):

```sql
insert into public.keywords (user_id, word)
values
  ('UUID_DO_USUARIO', 'socorro'),
  ('UUID_DO_USUARIO', 'perigo')
on conflict (user_id, word) do nothing;
```

### 10.8 Client no código (quando for implementar)

Sugestão de arquivos:

```text
src/
  data/
    repositories.ts         # porta usada pelas telas
    sqlite/database.ts      # hoje: SQLite
    remote/supabase.ts      # futuro: createClient
supabase/
  migrations/               # SQL das tabelas, RLS e policies
```

Exemplo de `src/data/remote/supabase.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

Exemplos de uso (depois de autenticado):

```ts
// listar palavras
const { data, error } = await supabase
  .from("keywords")
  .select("*")
  .order("created_at", { ascending: false });

// cadastrar contato
await supabase.from("contacts").insert({
  user_id: user.id,
  name: "Maria",
  phone: "5511999999999",
});

// registrar alerta
await supabase.from("alerts").insert({
  user_id: user.id,
  trigger: "manual", // ou 'voice'
  matched_word: null,
  notified: true,
  place_name: "Rua X · Fortaleza",
  latitude: -3.73,
  longitude: -38.52,
});
```

### 10.9 Mapa SQLite → Supabase

| SQLite (hoje)         | Supabase (alvo)                       | Observação            |
| --------------------- | ------------------------------------- | --------------------- |
| `keywords.id` INTEGER | `keywords.id` UUID                    | gerado pelo banco     |
| `keywords.word`       | `keywords.word`                       | único por usuário     |
| —                     | `keywords.user_id`                    | obrigatório com Auth  |
| `contacts.name/phone` | igual                                 | telefone com DDI      |
| `alerts.trigger`      | igual                                 | `'voice' \| 'manual'` |
| `alerts.matched_word` | igual                                 | nullable              |
| `alerts.notified` 0/1 | `notified` boolean                    |                       |
| —                     | `place_name`, `latitude`, `longitude` | já usados no WhatsApp |

### 10.10 Ordem sugerida de implementação no app

1. Criar projeto + tabelas + RLS no Supabase
2. Adicionar `.env` e `src/data/remote/supabase.ts`
3. Tela de login (email/senha ou magic link)
4. Trocar a implementação de `src/data/repositories.ts` para Supabase (ou dual: local + sync)
5. No `triggerAlert`, gravar alerta no Supabase com localização
6. (Opcional) Realtime no histórico: `supabase.channel(...).on('postgres_changes', ...)`

### 10.11 Checklist Supabase

```text
[ ] Projeto criado no Supabase
[ ] URL + anon key no .env
[ ] Tabelas: profiles, keywords, contacts, alerts
[ ] RLS ligado + policies por user_id
[ ] Auth Email habilitado + usuário de teste
[ ] @supabase/supabase-js instalado
[ ] Client createClient no app
[ ] Login funcionando
[ ] CRUD palavras/contatos/alertas apontando para Supabase
```

### 10.12 Links úteis

- Docs Expo + Supabase: https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native
- RLS: https://supabase.com/docs/guides/auth/row-level-security
- Auth JS: https://supabase.com/docs/reference/javascript/auth-signup
