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
   Local: http://localhost:5173
   ```

   ✅ **Frontend:** abra [http://localhost:5173](http://localhost:5173)  
   ✅ **Backend:** roda em [http://localhost:3000](http://localhost:3000)

6. Para **parar o projeto**, digite:
   ```bash
   docker compose down
   ```

---

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


