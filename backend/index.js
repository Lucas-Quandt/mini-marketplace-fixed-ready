require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const { Sequelize, DataTypes, Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const dayjs = require('dayjs');
const { Client } = require('@elastic/elasticsearch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const PORT = process.env.PORT || 4000;

// DB
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
  }
);

// Redis
const redis = new Redis(process.env.REDIS_URL);

// ES
const es = new Client({ node: process.env.ES_NODE });

// MODELS
const User = sequelize.define('users', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('PROVIDER', 'CLIENT'), allowNull: false },
  phone: { type: DataTypes.STRING },
  city: { type: DataTypes.STRING },
  state: { type: DataTypes.STRING },
  bio: { type: DataTypes.TEXT },
  photoUrl: { type: DataTypes.STRING },
}, { underscored: false });

const ServiceType = sequelize.define('service_types', {
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
}, { underscored: false });

const Service = sequelize.define('services', {
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  photos: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' }, // JSON string
}, { underscored: false });

const ServiceVariation = sequelize.define('service_variations', {
  name: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.DECIMAL(10,2), allowNull: false },
  durationMinutes: { type: DataTypes.INTEGER, allowNull: false },
}, { underscored: false });

const Availability = sequelize.define('availabilities', {
  startTime: { type: DataTypes.DATE, allowNull: false },
  endTime: { type: DataTypes.DATE, allowNull: false },
}, { underscored: false });

const Booking = sequelize.define('bookings', {
  startTime: { type: DataTypes.DATE, allowNull: false },
  endTime: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('CONFIRMED','CANCELLED'), defaultValue: 'CONFIRMED' },
}, { underscored: false });

const Notification = sequelize.define('notifications', {
  type: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.STRING, allowNull: false },
  read: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { underscored: false });

// Associations
User.hasMany(Service, { foreignKey: { name: 'providerId', allowNull: false } });
Service.belongsTo(User, { as: 'provider', foreignKey: 'providerId' });

Service.belongsTo(ServiceType, { foreignKey: { name: 'serviceTypeId', allowNull: false } });
ServiceType.hasMany(Service, { foreignKey: 'serviceTypeId' });

Service.hasMany(ServiceVariation, { foreignKey: { name: 'serviceId', allowNull: false } });
ServiceVariation.belongsTo(Service, { foreignKey: 'serviceId' });

User.hasMany(Availability, { foreignKey: { name: 'providerId', allowNull: false } });
Availability.belongsTo(User, { as: 'provider', foreignKey: 'providerId' });

User.hasMany(Booking, { foreignKey: { name: 'providerId', allowNull: false } });
Booking.belongsTo(User, { as: 'provider', foreignKey: 'providerId' });
Booking.belongsTo(User, { as: 'client', foreignKey: { name: 'clientId', allowNull: false } });
Booking.belongsTo(Service, { foreignKey: { name: 'serviceId', allowNull: false } });
Booking.belongsTo(ServiceVariation, { foreignKey: { name: 'serviceVariationId', allowNull: false } });

User.hasMany(Notification, { foreignKey: { name: 'providerId', allowNull: false } });
Notification.belongsTo(User, { as: 'provider', foreignKey: 'providerId' });

// Auth helpers (simple)
function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}
function auth(requiredRole) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sem token' });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido' });
    }
  };
}

// Routes
app.get('/health', (req, res) => res.json({ ok: true }));

// Auth
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, phone, city, state, bio, photoUrl } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, role são obrigatórios' });
    }
    if (!['PROVIDER','CLIENT'].includes(role)) return res.status(400).json({ error: 'role inválido' });
    const exists = await User.findOne({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Email já cadastrado' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, role, phone, city, state, bio, photoUrl });
    const token = sign(user);
    res.status(201).json({ user: { id: user.id, name, email, role }, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao registrar' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
    const token = sign(user);
    res.json({ user: { id: user.id, name: user.name, role: user.role }, token });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao logar' });
  }
});

// Service types
app.get('/service-types', async (req, res) => {
  const cacheKey = 'service_types_all';
  const cached = await redis.get(cacheKey);
  if (cached) return res.json(JSON.parse(cached));
  const rows = await ServiceType.findAll({ order: [['name','ASC']] });
  await redis.set(cacheKey, JSON.stringify(rows), 'EX', 300);
  res.json(rows);
});

app.post('/service-types', auth('PROVIDER'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const st = await ServiceType.create({ name });
    await redis.del('service_types_all');
    res.status(201).json(st);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar tipo' });
  }
});

// Services
app.post('/providers/:providerId/services', auth('PROVIDER'), async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    if (req.user.id !== providerId) return res.status(403).json({ error: 'Só pode criar para si' });
    const { serviceTypeId, name, description, photos = [], variations = [] } = req.body;
    if (!serviceTypeId || !name || !variations.length) {
      return res.status(400).json({ error: 'serviceTypeId, name e variations são obrigatórios' });
    }
    const service = await Service.create({
      name, description, photos: JSON.stringify(photos), providerId, serviceTypeId
    });
    for (const v of variations) {
      if (!v.name || v.price == null || !v.durationMinutes) continue;
      await ServiceVariation.create({ serviceId: service.id, name: v.name, price: v.price, durationMinutes: v.durationMinutes });
    }
    // index in ES
    try {
      await es.index({
        index: 'services',
        id: String(service.id),
        document: {
          id: service.id,
          name, description,
          serviceTypeId, providerId,
          photos, variations
        },
        refresh: 'wait_for'
      });
    } catch (e) {
      console.warn('Falha indexar ES', e.message);
    }
    res.status(201).json({ id: service.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar serviço' });
  }
});

app.get('/services', async (req, res) => {
  try {
    const { q, type } = req.query;
    if (q) {
      try {
        const esRes = await es.search({
          index: 'services',
          query: {
            multi_match: {
              query: q,
              fields: ['name^2','description']
            }
          },
          size: 50
        });
        const hits = esRes.hits.hits.map(h => h._source);
        return res.json(hits);
      } catch (e) {
        console.warn('Busca ES falhou, usando DB', e.message);
      }
    }
    const where = {};
    if (type) where.serviceTypeId = type;
    const rows = await Service.findAll({
      where,
      include: [
        { model: ServiceVariation },
        { model: User, as: 'provider', attributes: ['id','name','city','state'] },
        { model: ServiceType, attributes: ['id','name'] }
      ]
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar serviços' });
  }
});

app.get('/services/:id', async (req, res) => {
  const s = await Service.findByPk(req.params.id, {
    include: [
      { model: ServiceVariation },
      { model: User, as: 'provider', attributes: ['id','name','city','state','bio'] },
      { model: ServiceType, attributes: ['id','name'] }
    ]
  });
  if (!s) return res.status(404).json({ error: 'Não encontrado' });
  res.json(s);
});

// ===== Availability (corrigido) =====
function ensureDateTime(dateStr, hhmm) {
  // aceita "HH:MM" ou "HH:MM:SS" e monta um Date a partir de "YYYY-MM-DDTHH:MM:SS"
  if (!dateStr || !hhmm) throw new Error("Parâmetros de data/hora ausentes");
  const t = /^\d{2}:\d{2}(:\d{2})?$/.test(hhmm) ? (hhmm.length === 5 ? `${hhmm}:00` : hhmm) : hhmm;
  const dt = new Date(`${dateStr}T${t}`);
  if (isNaN(dt.getTime())) throw new Error("Horário inválido");
  return dt;
}

async function createAvailabilityHandler(req, res) {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    // exige login de prestador e que seja o próprio dono do ID
    if (!req.user || req.user.id !== providerId) {
      return res.status(403).json({ error: "Só pode criar para si" });
    }

    // aceita vários formatos
    const { date, dayOfWeek } = req.body;
    let { startTime, endTime, start, end } = req.body;
    startTime = startTime || start;
    endTime = endTime || end;

    if (!startTime || !endTime) {
      return res.status(400).json({ error: "startTime e endTime são obrigatórios" });
    }

    let startDT, endDT;

    if (date) {
      // front enviou date + HH:MM
      startDT = ensureDateTime(String(date), String(startTime));
      endDT   = ensureDateTime(String(date), String(endTime));
    } else if (
      /^\d{4}-\d{2}-\d{2}T/.test(String(startTime)) &&
      /^\d{4}-\d{2}-\d{2}T/.test(String(endTime))
    ) {
      // front já mandou ISO completo
      startDT = new Date(startTime);
      endDT   = new Date(endTime);
      if (isNaN(startDT.getTime()) || isNaN(endDT.getTime())) {
        return res.status(400).json({ error: "Datas inválidas" });
      }
    } else if (typeof dayOfWeek !== "undefined") {
      // por enquanto não suportamos semanal fixa nesta tabela
      return res.status(400).json({
        error: "Envie 'date' (YYYY-MM-DD) junto com startTime/endTime (HH:MM)."
      });
    } else {
      return res.status(400).json({
        error: "Formato inválido. Use {date:'YYYY-MM-DD', startTime:'HH:MM', endTime:'HH:MM'}."
      });
    }

    const row = await Availability.create({ providerId, startTime: startDT, endTime: endDT });
    await redis.del(`avail_${providerId}`); // limpa cache
    return res.status(201).json(row);
  } catch (e) {
    console.error("createAvailability error", e);
    return res.status(500).json({ error: "Erro ao criar disponibilidade" });
  }
}

app.post("/providers/:providerId/availability", auth("PROVIDER"), createAvailabilityHandler);
// alias plural (o front testa essa rota também)
app.post("/providers/:providerId/availabilities", auth("PROVIDER"), createAvailabilityHandler);

// Listagem (mantém a existente e cria alias plural)
async function listAvailabilityHandler(req, res) {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const cacheKey = `avail_${providerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const rows = await Availability.findAll({
      where: { providerId },
      order: [["startTime", "ASC"]],
    });

    await redis.set(cacheKey, JSON.stringify(rows), "EX", 60);
    return res.json(rows);
  } catch (e) {
    console.error("listAvailability error", e);
    return res.status(500).json({ error: "Erro ao listar" });
  }
}

// já existia:
app.get("/providers/:providerId/availability", listAvailabilityHandler);
// novo alias:
app.get("/providers/:providerId/availabilities", listAvailabilityHandler);


// Bookings
app.post('/bookings', async (req, res) => {
  try {
    const { clientId, variationId, startTime } = req.body;
    if (!clientId || !variationId || !startTime) return res.status(400).json({ error: 'clientId, variationId e startTime são obrigatórios' });
    const variation = await ServiceVariation.findByPk(variationId, { include: [{ model: Service }] });
    if (!variation) return res.status(404).json({ error: 'Variação não encontrada' });
    const service = await Service.findByPk(variation.serviceId);
    const providerId = service.providerId;
    const start = dayjs(startTime);
    const end = start.add(variation.durationMinutes, 'minute');
    // overlap check
    const overlaps = await Booking.findOne({
      where: {
        providerId,
        status: 'CONFIRMED',
        [Op.or]: [
          {
            startTime: { [Op.lt]: end.toDate() },
            endTime: { [Op.gt]: start.toDate() }
          }
        ]
      }
    });
    if (overlaps) return res.status(409).json({ error: 'Horário indisponível' });
    const booking = await Booking.create({
      providerId, clientId, serviceId: service.id, serviceVariationId: variation.id,
      startTime: start.toDate(), endTime: end.toDate(), status: 'CONFIRMED'
    });
    await Notification.create({
      providerId,
      type: 'BOOKING_CREATED',
      message: `Nova contratação para ${service.name} às ${start.format('DD/MM HH:mm')}`
    });
    res.status(201).json(booking);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao contratar' });
  }
});

app.get('/providers/:providerId/bookings', async (req, res) => {
  const providerId = parseInt(req.params.providerId, 10);
  const rows = await Booking.findAll({
    where: { providerId },
    include: [
      { model: ServiceVariation },
      { model: Service },
      { model: User, as: 'client', attributes: ['id','name'] }
    ],
    order: [['startTime','ASC']]
  });
  res.json(rows);
});

app.delete('/bookings/:id', async (req, res) => {
  const b = await Booking.findByPk(req.params.id);
  if (!b) return res.status(404).json({ error: 'Não encontrado' });
  b.status = 'CANCELLED';
  await b.save();
  res.json({ ok: true });
});

app.get('/providers/:providerId/notifications', async (req, res) => {
  const providerId = parseInt(req.params.providerId, 10);
  const rows = await Notification.findAll({ where: { providerId }, order: [['createdAt','DESC']] });
  res.json(rows);
});

// Boot
async function boot() {
  try {
    await sequelize.authenticate();
    console.log('🗄️  Conectado ao MySQL');
    await sequelize.sync({ alter: true });
    // Seed service types
    const count = await ServiceType.count();
    if (count === 0) {
      await ServiceType.bulkCreate([
        { name: 'Manicure' },
        { name: 'Massagem' },
        { name: 'Pedicure' },
        { name: 'Eletricista' },
        { name: 'Pintor' },
        { name: 'Diarista' }
      ]);
      console.log('🌱 Tipos de serviço seed criados');
    }
    // ES index ensure
    try {
      const ok = await es.indices.exists({ index: 'services' });
      if (!ok) await es.indices.create({ index: 'services' });
      console.log('🔎 ES index pronto: services');
    } catch (e) {
      console.warn('ES indisponível?', e.message);
    }
    app.listen(PORT, () => console.log(`🚀 API rodando em http://localhost:${PORT}`));
  } catch (e) {
    console.error('Erro ao subir API:', e);
    process.exit(1);
  }
}
boot();

// ==== BLOCO: Serviços do Prestador ==========================================
(() => {
  const mysql = require('mysql2/promise');

  // Reaproveita pool global se já existir; caso contrário cria um novo
  const pool =
    global.__dbPool ||
    (global.__dbPool = mysql.createPool({
      host: process.env.DB_HOST || 'mysql',
      user: process.env.DB_USER || 'marketplace',
      password: process.env.DB_PASSWORD || 'marketplace',
      database: process.env.DB_NAME || 'mini_marketplace',
      waitForConnections: true,
      connectionLimit: 10,
    }));

  const DB_NAME = process.env.DB_NAME || 'mini_marketplace';
  let hasPhotosColCache = null;

  async function columnExists(table, column) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [DB_NAME, table, column]
    );
    return rows[0].cnt > 0;
  }

  async function ensurePhotosColumnFlag() {
    if (hasPhotosColCache === null) {
      try {
        hasPhotosColCache = await columnExists('services', 'photos');
      } catch (e) {
        // se falhar o check, assume que não existe para não quebrar
        hasPhotosColCache = false;
      }
    }
    return hasPhotosColCache;
  }

  async function providerExists(providerId) {
    // valida se o usuário existe e é prestador (role = 'provider' ou 'prestador')
    const [rows] = await pool.query(
      `SELECT id, role FROM users WHERE id = ? LIMIT 1`,
      [providerId]
    );
    if (!rows.length) return false;
    const role = (rows[0].role || '').toString().toLowerCase();
    return ['provider', 'prestador'].includes(role);
  }

  function normalizeVariations(variations) {
    if (!Array.isArray(variations)) return [];
    return variations
      .map((v) => ({
        name: (v?.name || '').toString().trim(),
        price: Number(v?.price ?? 0),
        durationMinutes: Number(v?.durationMinutes ?? 0),
      }))
      .filter((v) => v.name && v.price > 0 && v.durationMinutes > 0);
  }

  async function createServiceTx(conn, data) {
    const {
      providerId,
      serviceTypeId,
      name,
      description = '',
      photos = [],
      variations = [],
    } = data;

    const hasPhotos = await ensurePhotosColumnFlag();

    // Insert service
    let serviceId;
    if (hasPhotos) {
      const [res] = await conn.execute(
        `INSERT INTO services (providerId, serviceTypeId, name, description, photos, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          providerId,
          serviceTypeId,
          name,
          description,
          JSON.stringify(Array.isArray(photos) ? photos : []),
        ]
      );
      serviceId = res.insertId;
    } else {
      const [res] = await conn.execute(
        `INSERT INTO services (providerId, serviceTypeId, name, description, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [providerId, serviceTypeId, name, description]
      );
      serviceId = res.insertId;
    }

    // Insert variations
    if (variations.length) {
      const sqlVar = `INSERT INTO service_variations
        (serviceId, name, price, durationMinutes, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, NOW(), NOW())`;

      for (const v of variations) {
        await conn.execute(sqlVar, [
          serviceId,
          v.name,
          v.price,
          v.durationMinutes,
        ]);
      }
    }

    // Return created service + variations
    const [serviceRows] = await conn.query(
      `SELECT * FROM services WHERE id = ?`,
      [serviceId]
    );
    const [varRows] = await conn.query(
      `SELECT * FROM service_variations WHERE serviceId = ? ORDER BY id`,
      [serviceId]
    );

    return { service: serviceRows[0], variations: varRows };
  }

  // --------- POST /providers/:providerId/services -----------
  app.post('/providers/:providerId/services', async (req, res) => {
    try {
      const providerId = Number(req.params.providerId);
      const {
        serviceTypeId,
        name,
        description = '',
        photos = [],
        variations = [],
      } = req.body || {};

      // validações simples
      if (!providerId || Number.isNaN(providerId)) {
        return res.status(400).json({ error: 'providerId inválido na URL.' });
      }
      if (!serviceTypeId) {
        return res.status(400).json({ error: 'serviceTypeId é obrigatório.' });
      }
      if (!name || !name.toString().trim()) {
        return res.status(400).json({ error: 'name é obrigatório.' });
      }

      if (!(await providerExists(providerId))) {
        return res
          .status(404)
          .json({ error: 'Prestador não encontrado ou não é prestador.' });
      }

      const normVars = normalizeVariations(variations);
      if (!normVars.length) {
        return res
          .status(400)
          .json({ error: 'Inclua pelo menos 1 variação válida.' });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const created = await createServiceTx(conn, {
          providerId,
          serviceTypeId: Number(serviceTypeId),
          name: name.toString().trim(),
          description: description?.toString?.() || '',
          photos: Array.isArray(photos) ? photos : [],
          variations: normVars,
        });
        await conn.commit();
        return res.status(201).json(created);
      } catch (err) {
        await conn.rollback();
        console.error('Erro ao criar serviço:', err);
        return res.status(500).json({ error: 'Falha ao criar serviço.' });
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  });

  // --------- POST /services (fallback) -----------
  // Aceita body com { providerId, serviceTypeId, name, description?, photos?, variations[] }
  app.post('/services', async (req, res) => {
    try {
      const {
        providerId,
        serviceTypeId,
        name,
        description = '',
        photos = [],
        variations = [],
      } = req.body || {};

      if (!providerId) {
        return res
          .status(400)
          .json({ error: 'providerId é obrigatório no corpo.' });
      }
      if (!serviceTypeId) {
        return res.status(400).json({ error: 'serviceTypeId é obrigatório.' });
      }
      if (!name || !name.toString().trim()) {
        return res.status(400).json({ error: 'name é obrigatório.' });
      }

      if (!(await providerExists(Number(providerId)))) {
        return res
          .status(404)
          .json({ error: 'Prestador não encontrado ou não é prestador.' });
      }

      const normVars = normalizeVariations(variations);
      if (!normVars.length) {
        return res
          .status(400)
          .json({ error: 'Inclua pelo menos 1 variação válida.' });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const created = await createServiceTx(conn, {
          providerId: Number(providerId),
          serviceTypeId: Number(serviceTypeId),
          name: name.toString().trim(),
          description: description?.toString?.() || '',
          photos: Array.isArray(photos) ? photos : [],
          variations: normVars,
        });
        await conn.commit();
        return res.status(201).json(created);
      } catch (err) {
        await conn.rollback();
        console.error('Erro ao criar serviço:', err);
        return res.status(500).json({ error: 'Falha ao criar serviço.' });
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  });

  // --------- GET /providers/:providerId/services (listar) -----------
  app.get('/providers/:providerId/services', async (req, res) => {
    try {
      const providerId = Number(req.params.providerId);
      if (!providerId) {
        return res.status(400).json({ error: 'providerId inválido.' });
      }
      const [services] = await pool.query(
        `SELECT * FROM services WHERE providerId = ? ORDER BY id DESC`,
        [providerId]
      );
      if (!services.length) return res.json([]);

      const ids = services.map((s) => s.id);
      const [varsRows] = await pool.query(
        `SELECT * FROM service_variations WHERE serviceId IN (${ids
          .map(() => '?')
          .join(',')}) ORDER BY id`,
        ids
      );
      const map = {};
      for (const s of services) map[s.id] = { ...s, variations: [] };
      for (const v of varsRows) map[v.serviceId]?.variations?.push(v);
      res.json(Object.values(map));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao listar serviços.' });
    }
  });
})();

// ========= UPDATE & DELETE de SERVIÇOS =========

// Atualizar serviço (e opcionalmente substituir TODAS as variações)
app.put("/providers/:providerId/services/:serviceId", auth("PROVIDER"), async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const serviceId = parseInt(req.params.serviceId, 10);

    if (!req.user || req.user.id !== providerId) {
      return res.status(403).json({ error: "Só pode alterar serviços do próprio perfil." });
    }

    const svc = await Service.findByPk(serviceId, { include: [{ model: ServiceVariation, as: "variations" }] });
    if (!svc || svc.providerId !== providerId) {
      return res.status(404).json({ error: "Serviço não encontrado para este prestador." });
    }

    const { serviceTypeId, name, description, photos, variations } = req.body;

    if (typeof serviceTypeId !== "undefined") svc.serviceTypeId = serviceTypeId;
    if (typeof name !== "undefined") svc.name = name;
    if (typeof description !== "undefined") svc.description = description;
    if (typeof photos !== "undefined") svc.photos = photos; // array JSON

    // Se vierem variações, substitui todas
    if (Array.isArray(variations)) {
      await ServiceVariation.destroy({ where: { serviceId: svc.id } });
      for (const v of variations) {
        if (!v || !v.name) continue;
        await ServiceVariation.create({
          serviceId: svc.id,
          name: v.name,
          price: v.price,
          durationMinutes: v.durationMinutes
        });
      }
    }

    await svc.save();

    // re-lê com variações
    const full = await Service.findByPk(serviceId, { include: [{ model: ServiceVariation, as: "variations" }] });

    // tenta atualizar ES (se existir cliente configurado)
    try {
      if (typeof es?.index === "function") {
        await es.index({
          index: "services",
          id: String(full.id),
          document: {
            id: full.id,
            providerId: full.providerId,
            serviceTypeId: full.serviceTypeId,
            name: full.name,
            description: full.description || "",
            photos: full.photos || [],
            variations: (full.variations || []).map(v => ({ name: v.name, price: v.price, durationMinutes: v.durationMinutes }))
          },
          refresh: true
        });
      }
    } catch (e) { console.warn("ES update service falhou:", e.message); }

    return res.json(full);
  } catch (e) {
    console.error("PUT service erro:", e);
    return res.status(500).json({ error: "Erro ao atualizar serviço" });
  }
});

// Excluir serviço (e variações)
app.delete("/providers/:providerId/services/:serviceId", auth("PROVIDER"), async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const serviceId = parseInt(req.params.serviceId, 10);

    if (!req.user || req.user.id !== providerId) {
      return res.status(403).json({ error: "Só pode excluir serviços do próprio perfil." });
    }

    const svc = await Service.findByPk(serviceId);
    if (!svc || svc.providerId !== providerId) {
      return res.status(404).json({ error: "Serviço não encontrado para este prestador." });
    }

    await ServiceVariation.destroy({ where: { serviceId: svc.id } });
    await svc.destroy();

    // remover do ES (se houver)
    try {
      if (typeof es?.delete === "function") {
        await es.delete({ index: "services", id: String(serviceId), refresh: true });
      }
    } catch (e) { console.warn("ES delete service falhou:", e.message); }

    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE service erro:", e);
    return res.status(500).json({ error: "Erro ao excluir serviço" });
  }
});


// ========= UPDATE & DELETE de DISPONIBILIDADES =========

// helper já existente no arquivo: ensureDateTime(dateStr, hhmm)

// Atualizar disponibilidade por ID
app.put("/providers/:providerId/availability/:availabilityId", auth("PROVIDER"), async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const availabilityId = parseInt(req.params.availabilityId, 10);

    if (!req.user || req.user.id !== providerId) {
      return res.status(403).json({ error: "Só pode alterar a própria agenda." });
    }

    const av = await Availability.findByPk(availabilityId);
    if (!av || av.providerId !== providerId) {
      return res.status(404).json({ error: "Disponibilidade não encontrada." });
    }

    const { date, startTime, endTime, start, end } = req.body;
    const s = startTime || start;
    const e = endTime || end;

    if (!s || !e) {
      return res.status(400).json({ error: "startTime e endTime são obrigatórios" });
    }

    let startDT, endDT;
    if (date) {
      startDT = ensureDateTime(String(date), String(s));
      endDT   = ensureDateTime(String(date), String(e));
    } else if (/^\d{4}-\d{2}-\d{2}T/.test(String(s)) && /^\d{4}-\d{2}-\d{2}T/.test(String(e))) {
      startDT = new Date(s); endDT = new Date(e);
      if (isNaN(startDT.getTime()) || isNaN(endDT.getTime())) {
        return res.status(400).json({ error: "Datas inválidas" });
      }
    } else {
      return res.status(400).json({ error: "Envie 'date' + HH:MM" });
    }

    av.startTime = startDT;
    av.endTime = endDT;
    await av.save();

    await redis.del(`avail_${providerId}`);

    return res.json(av);
  } catch (e) {
    console.error("PUT availability erro:", e);
    return res.status(500).json({ error: "Erro ao atualizar disponibilidade" });
  }
});

// Excluir disponibilidade por ID
app.delete("/providers/:providerId/availability/:availabilityId", auth("PROVIDER"), async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const availabilityId = parseInt(req.params.availabilityId, 10);

    if (!req.user || req.user.id !== providerId) {
      return res.status(403).json({ error: "Só pode excluir a própria agenda." });
    }

    const av = await Availability.findByPk(availabilityId);
    if (!av || av.providerId !== providerId) {
      return res.status(404).json({ error: "Disponibilidade não encontrada." });
    }

    await av.destroy();
    await redis.del(`avail_${providerId}`);

    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE availability erro:", e);
    return res.status(500).json({ error: "Erro ao excluir disponibilidade" });
  }
});

// PUT /providers/:providerId/services/:serviceId  -> atualiza serviço + variações
app.put('/providers/:providerId/services/:serviceId', async (req, res) => {
  const providerId = Number(req.params.providerId);
  const serviceId = Number(req.params.serviceId);

  // Se você usa auth por token, descomente este check de posse:
  // if (req.user?.role !== 'admin' && req.user?.id !== providerId) {
  //   return res.status(403).json({ error: 'Sem permissão' });
  // }

  const {
    serviceTypeId,
    name,
    description = '',
    photos = [],
    variations = [],
  } = req.body || {};

  if (!serviceId || !providerId) {
    return res.status(400).json({ error: 'providerId e serviceId inválidos' });
  }
  if (!name || !serviceTypeId) {
    return res.status(400).json({ error: 'name e serviceTypeId são obrigatórios' });
  }

  // Normaliza campos
  const photosArr = Array.isArray(photos) ? photos.filter(Boolean) : [];
  const normVars = Array.isArray(variations)
    ? variations
        .map(v => ({
          name: String(v?.name || '').trim(),
          price: Number(v?.price),
          durationMinutes: parseInt(v?.durationMinutes, 10),
        }))
        .filter(v => v.name && Number.isFinite(v.price) && Number.isInteger(v.durationMinutes))
    : [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Garante que o serviço existe e pertence ao provider
    const [exists] = await conn.query(
      'SELECT id FROM services WHERE id = ? AND providerId = ?',
      [serviceId, providerId]
    );
    if (exists.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Serviço não encontrado' });
    }

    // Atualiza o serviço
    await conn.query(
      'UPDATE services SET serviceTypeId = ?, name = ?, description = ?, photos = ? WHERE id = ? AND providerId = ?',
      [Number(serviceTypeId), name, description, JSON.stringify(photosArr), serviceId, providerId]
    );

    // Recria variações
    await conn.query('DELETE FROM service_variations WHERE serviceId = ?', [serviceId]);
    if (normVars.length) {
      const values = normVars.map(v => [serviceId, v.name, v.price, v.durationMinutes]);
      await conn.query(
        'INSERT INTO service_variations (serviceId, name, price, durationMinutes) VALUES ?',
        [values]
      );
    }

    await conn.commit();

    // Retorna o serviço atualizado
    const [[svc]] = await conn.query(
      'SELECT id, providerId, serviceTypeId, name, description, photos FROM services WHERE id = ?',
      [serviceId]
    );
    const [vars] = await conn.query(
      'SELECT id, name, price, durationMinutes FROM service_variations WHERE serviceId = ?',
      [serviceId]
    );
    const photosParsed = (() => {
      try { return JSON.parse(svc.photos || '[]'); } catch { return []; }
    })();

    // (Opcional) reindexar no Elasticsearch
    try {
      await es.index({
        index: 'services',
        id: String(serviceId),
        body: {
          id: serviceId,
          providerId,
          serviceTypeId: svc.serviceTypeId,
          name: svc.name,
          description: svc.description,
          photos: photosParsed,
          variations: vars
        },
        refresh: 'wait_for'
      });
    } catch (e) {
      console.warn('ES index (update) falhou:', e.message);
    }

    return res.json({
      id: svc.id,
      providerId: svc.providerId,
      serviceTypeId: svc.serviceTypeId,
      name: svc.name,
      description: svc.description,
      photos: photosParsed,
      variations: vars
    });
  } catch (err) {
    await conn.rollback();
    console.error('PUT /providers/:providerId/services/:serviceId erro:', err);
    return res.status(500).json({ error: 'Erro ao atualizar serviço' });
  } finally {
    conn.release();
  }
});

// ====== UPDATE de Serviço ======
async function normalizePhotos(photos) {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos.filter(Boolean);
  if (typeof photos === 'string') {
    return photos.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function normalizeVariations(variations) {
  if (!Array.isArray(variations)) return [];
  return variations
    .map(v => ({
      name: String(v.name || '').trim(),
      price: Number(v.price),
      durationMinutes: parseInt(v.durationMinutes, 10)
    }))
    .filter(v => v.name && Number.isFinite(v.price) && Number.isInteger(v.durationMinutes));
}

// PUT/PATCH /providers/:providerId/services/:serviceId
async function upsertService(req, res) {
  try {
    const providerId = parseInt(req.params.providerId || '', 10);
    const serviceId  = parseInt(req.params.serviceId  || '', 10);
    if (!serviceId) return res.status(400).json({ error: 'serviceId inválido' });

    // Quando a rota é /services/:serviceId (sem provider no path), deduzimos via dono do serviço
    let service = await Service.findByPk(serviceId);
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado' });

    const ownerId = service.providerId;
    const mustMatch = (req.params.providerId ? providerId : ownerId);
    if (req.user?.id !== mustMatch) {
      return res.status(403).json({ error: 'Só pode editar serviços do próprio usuário' });
    }

    // Campos editáveis
    let {
      serviceTypeId,
      name,
      description,
      photos,
      variations
    } = req.body;

    const updates = {};
    if (serviceTypeId != null) updates.serviceTypeId = Number(serviceTypeId);
    if (typeof name === 'string')        updates.name = name.trim();
    if (typeof description === 'string') updates.description = description.trim();

    const photosArr = await normalizePhotos(photos);
    if (photosArr) updates.photos = JSON.stringify(photosArr);

    const normVars = normalizeVariations(variations);

    await sequelize.transaction(async (t) => {
      await service.update(updates, { transaction: t });

      if (Array.isArray(normVars)) {
        await ServiceVariation.destroy({ where: { serviceId: service.id }, transaction: t });
        for (const v of normVars) {
          await ServiceVariation.create({
            serviceId: service.id,
            name: v.name,
            price: v.price,
            durationMinutes: v.durationMinutes
          }, { transaction: t });
        }
      }
    });

    // Reindexar no Elasticsearch (idempotente)
    try {
      await es.index({
        index: 'services',
        id: String(service.id),
        document: {
          id: service.id,
          name: updates.name ?? service.name,
          description: updates.description ?? service.description
        },
        refresh: true
      });
    } catch (e) {
      console.error('ES reindex error (update):', e?.meta?.body || e);
    }

    // Retornar já com variações e fotos em array
    const refreshed = await Service.findByPk(service.id, {
      include: [{ model: ServiceVariation, as: 'variations', attributes: ['id','name','price','durationMinutes'] }]
    });

    const out = refreshed.toJSON();
    try { out.photos = JSON.parse(out.photos || '[]'); } catch { out.photos = []; }
    return res.json(out);

  } catch (e) {
    console.error('Update service error:', e);
    return res.status(500).json({ error: 'Erro ao atualizar serviço' });
  }
}

// Rotas com providerId no path (checam role e dono)
app.put('/providers/:providerId/services/:serviceId',  auth('PROVIDER'), upsertService);
app.patch('/providers/:providerId/services/:serviceId', auth('PROVIDER'), upsertService);

// Fallbacks sem providerId no path (descobrem dono via service)
app.put('/services/:serviceId',  auth('PROVIDER'), upsertService);
app.patch('/services/:serviceId', auth('PROVIDER'), upsertService);

// ====== DELETE de Serviço ======
async function deleteServiceHandler(req, res) {
  try {
    const providerId = req.params.providerId ? parseInt(req.params.providerId, 10) : null;
    const serviceId  = parseInt(req.params.serviceId, 10);
    if (!serviceId) return res.status(400).json({ error: 'serviceId inválido' });

    const service = await Service.findByPk(serviceId);
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado' });

    const ownerId = service.providerId;
    const mustMatch = providerId ?? ownerId;
    if (req.user?.id !== mustMatch) {
      return res.status(403).json({ error: 'Só pode excluir serviços do próprio usuário' });
    }

    await sequelize.transaction(async (t) => {
      await ServiceVariation.destroy({ where: { serviceId }, transaction: t });
      await service.destroy({ transaction: t });
    });

    try { await es.delete({ index: 'services', id: String(serviceId), refresh: true }); }
    catch (e) { /* ok se não existir no ES */ }

    return res.json({ ok: true });
  } catch (e) {
    console.error('Delete service error:', e);
    return res.status(500).json({ error: 'Erro ao excluir serviço' });
  }
}

app.delete('/providers/:providerId/services/:serviceId', auth('PROVIDER'), deleteServiceHandler);
app.delete('/services/:serviceId',                     auth('PROVIDER'), deleteServiceHandler);


