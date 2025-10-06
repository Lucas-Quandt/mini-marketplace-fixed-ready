# Mini Marketplace de Serviços — Guia Simples de Instalação 🛠️
 
Siga passo a passo e o sistema funcionará no seu computador. 🚀

---

## 🧩 O que é este projeto

Um pequeno **marketplace de serviços**, onde **clientes** contratam **prestadores**.  
Ele tem duas partes:
- **Frontend:** a parte que você vê no navegador.
- **Backend:** a parte que roda por trás, cuidando do banco de dados.

---

## 🖥️ O que você precisa ter instalado

Antes de começar, instale estes programas:

1. **Docker** → [https://www.docker.com/get-started](https://www.docker.com/get-started)
2. **Docker Compose** (vem junto com o Docker nas versões novas)
3. (Opcional) **VS Code** para abrir os arquivos do projeto

---

## 🚀 Como rodar o projeto com Docker (o jeito mais fácil)

> 💡 Este método não precisa instalar Node.js ou MySQL manualmente.

1. **Baixe e extraia o projeto**
   - Clique com o botão direito no arquivo ZIP e escolha **“Extrair aqui”**.

2. **Abra o terminal na pasta do projeto**
   - No Windows: segure **Shift** → clique com o botão direito → **“Abrir janela do PowerShell aqui”**
   - No Linux: clique com o botão direito → **“Abrir no terminal”**

3. **Digite este comando e pressione ENTER:**

   ```bash
   docker compose up --build
   ```

4. O Docker vai **baixar os componentes e iniciar tudo** (pode demorar na primeira vez).

5. Quando terminar, você verá mensagens como:
   ```
   Local: http://localhost:5173     E PRONTO PROJETO RODANDO!!
   ```

   ✅ **Frontend:** abra [http://localhost:5173](http://localhost:5173)  
   ✅ **Backend:** roda em [http://localhost:3000](http://localhost:3000)

6. Para **parar o projeto**, digite:
   ```bash
   docker compose down
   ```
 **LEMBRANDO**
 Do Jeito que está rodando ai o projeto vai aparecer sem cadastro de ninguem ou seja você sera a primeira pessoa que irá
 cadastrar um perfil no sistema.
 
 Mas se você quer rodar o sistema e quer que ja apareça alguns outros perfis previamente ja cadastrados para ter uma noção 
 de como é o sistema com varios perfis de outras pessoas cadastradas siga os passo a seguir que ensina como rodar o SEED
 e assim o sistema ja ter acesso ao banco de perfis de outro usuarios.

---------------------------------------------------------------------------------------------------------------------------

## 📦 Como popular o banco com dados de exemplo (Seed)

> Este passo **não altera o código** do projeto. Ele apenas preenche o MySQL com **prestadores**, **serviços**, **fotos** e **tipos de serviço** para que tudo apareça igual ao seu ambiente local.

### Pré‑requisitos
- A pasta **`seed/`** precisa existir na raiz do projeto com o arquivo **`seed.sql`**.
- As fotos devem estar versionadas em **`backend/uploads/providers/`**.

### Passo a passo (Docker Compose)
1. **Suba os serviços** (isso cria as tabelas no MySQL):
   ```bash
   docker compose up -d
   ```

2. **Descubra o container do MySQL** (opcional, só para facilitar os próximos comandos):
   ```bash
   MYSQL_ID=$(docker compose ps -q mysql)
   echo "$MYSQL_ID"
   ```

3. **Importe o seed** (escolha UMA forma):

   **Forma A — usando variável `MYSQL_ID`:**
   ```bash
   docker exec -i $MYSQL_ID mysql -u root -proot mini_marketplace < seed/seed.sql
   ```

   **Forma B — copiando o arquivo para dentro do container:**
   ```bash
   docker cp seed/seed.sql $MYSQL_ID:/seed.sql
   docker exec -it $MYSQL_ID bash -lc "mysql -u root -proot mini_marketplace < /seed.sql"
   ```

   > Se sua senha do MySQL **não** for `root`, troque `-proot` pela senha correta.  
   > Se o nome do banco for outro, troque `mini_marketplace` pelo nome real.

4. **(Opcional) Reinicie o backend** para limpar caches:
   ```bash
   docker compose restart backend
   ```

5. **Acesse o sistema:**
   - Frontend: <http://localhost:5173>
   - API: <http://localhost:4000>
   
----------------------------------------------------------------------------------------------------------------------------   
### Logins de teste dos clientes que ja foram previamente cadastrados para teste:
- **Cliente:** `cliente@example.com` — **senha:** `123456`  

- **Prestadores:** `provider{ID}@example.com` (ex.: `provider1@example.com`) — Para a otimização de acesso todos esses prestadores foram cadastrados com a**senha:** `123456`, mais é possivel fazer um novo cadastro com qualquer senha.
 sandyquandt@gmail.com
 lucasquandt10@gmail.com
 paulo@gmail.com
 suzanamaria@gmail.com
 roberto@gmail.com  
---------------------------------------------------------------------------------------------------------------------------- 

### Verificações rápidas (opcional)
Confirme se os dados entraram:
```bash
docker exec -it $MYSQL_ID bash -lc 'echo "SELECT role, COUNT(*) FROM users GROUP BY role;" | mysql -u root -proot mini_marketplace'
```
Veja alguns serviços:
```bash
docker exec -it $MYSQL_ID bash -lc 'echo "SELECT id, providerId, name FROM services ORDER BY id LIMIT 10;" | mysql -u root -proot mini_marketplace'
```

### Dicas
- O MySQL pode mostrar um **aviso** sobre senha na linha de comando; é normal.
- Se der erro de “tabela não existe”, aguarde 10–20s após `docker compose up -d` e importe de novo.
- Se as pastas não aparecerem no GitHub, verifique o `.gitignore` ou force o add:  
  `git add -f seed/ backend/uploads/providers/`

----------------------------------------------------------------------------------------------------------------------------

## ⚙️ Se quiser rodar sem Docker (opcional)

Esse modo é para quem quer abrir o código manualmente.

### 1️⃣ Rodar o backend

```bash
cd backend
npm install
npm run dev
```

O backend vai rodar em [http://localhost:3000](http://localhost:3000).

### 2️⃣ Rodar o frontend

Abra outro terminal:

```bash
cd frontend
npm install
npm run dev
```

O site estará em [http://localhost:5173](http://localhost:5173).

---

## 🧠 Dicas úteis

- Se aparecer erro dizendo “porta já usada”, feche os programas que usam **3306** (MySQL) ou **3000/5173**.
- Se der erro de permissão no Linux, use **sudo** antes do comando.
- Se o site não abrir, espere um pouco — às vezes o Docker leva 1–2 minutos pra subir tudo.

---

## ❤️ Pronto!

Agora o seu **Mini Marketplace de Serviços** está funcionando! 🎉  
Você pode cadastrar, listar e contratar serviços pelo navegador.

Se quiser parar o sistema:
```bash
docker compose down
```

E para iniciar de novo:
```bash
docker compose up
```

---

---



