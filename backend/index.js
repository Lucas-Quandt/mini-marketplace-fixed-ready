require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const { Sequelize, DataTypes, Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

let es = null;
try {
  if (process.env.ES_NODE) {
    const { Client } = require('@elastic/elasticsearch');
    es = new Client({ node: process.env.ES_NODE });
  }
} catch (_) { }

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json({ limit: '15mb' }));
app.use(morgan('dev'));

const sequelize = new Sequelize(
  process.env.DB_NAME || 'mini_marketplace',
  process.env.DB_USER || 'marketplace',
  process.env.DB_PASSWORD || 'marketplace',
  {
    host: process.env.DB_HOST || 'mysql',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
  }
);

let redis = null;
try {
  const Redis = require('ioredis');
  redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
} catch (e) {
  console.warn('Redis indisponível:', e.message);
  redis = { async get(){return null}, async set(){}, async del(){} };
}

const User = sequelize.define('users', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('PROVIDER', 'CLIENT'), allowNull: false },
  phone: { type: DataTypes.STRING },
  city: { type: DataTypes.STRING },
  state: { type: DataTypes.STRING },
  bio: { type: DataTypes.TEXT },
  photoUrl: { type: DataTypes.STRING },
}, { underscored: false });

const ServiceType = sequelize.define('service_types', {
  name: { type: DataTypes.STRING, allowNull: false }
}, { underscored: false });

const Service = sequelize.define('services', {
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  photos: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
}, { underscored: false });

const ServiceVariation = sequelize.define('service_variations', {
  name: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.DECIMAL(10,2), allowNull: false },
  durationMinutes: { type: DataTypes.INTEGER, allowNull: false },
}, { underscored: false });

const Availability = sequelize.define('availabilities', {
  startTime: { type: DataTypes.DATE, allowNull: false },
  endTime:   { type: DataTypes.DATE, allowNull: false },
  dayOfWeek: { type: DataTypes.INTEGER, allowNull: true },
  weekly:    { type: DataTypes.BOOLEAN, defaultValue: false },
}, { underscored: false });

const Booking = sequelize.define('bookings', {
  startTime: { type: DataTypes.DATE, allowNull: false },
  endTime: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('CONFIRMED','CANCELLED'), defaultValue: 'CONFIRMED' },
}, { underscored: false });


const Rating = sequelize.define('ratings', {
  score: { type: DataTypes.INTEGER, allowNull: false },
  comment: { type: DataTypes.TEXT, allowNull: true },
}, { underscored: false });
const Notification = sequelize.define('notifications', {
  type: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.STRING, allowNull: false },
  read: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { underscored: false });

User.hasMany(Service, { foreignKey: { name: 'providerId', allowNull: false } });
Service.belongsTo(User, { as: 'provider', foreignKey: 'providerId' });

Service.belongsTo(ServiceType, { as: 'type', foreignKey: { name: 'serviceTypeId', allowNull: false } });
ServiceType.hasMany(Service, { as: 'services', foreignKey: 'serviceTypeId' });

Service.hasMany(ServiceVariation, { as: 'variations', foreignKey: { name: 'serviceId', allowNull: false } });
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

Service.hasMany(Rating, { as: 'ratings', foreignKey: { name: 'serviceId', allowNull: false } });
Rating.belongsTo(Service, { foreignKey: 'serviceId' });
User.hasMany(Rating, { as: 'serviceRatings', foreignKey: { name: 'clientId', allowNull: false } });
Rating.belongsTo(User, { as: 'client', foreignKey: 'clientId' });


function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' });
}
function auth(requiredRole) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sem token' });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
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

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, phone, city, state, bio, photoUrl } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, role são obrigatórios' });
    }
    if (!['PROVIDER','CLIENT'].includes(role)) return res.status(400).json({ error: 'role inválido' });
    const exists = await User.findOne({ where: { email } });
    if (exists) return res.status(409).json({ error: 'Email já cadastrado' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, role, phone, city, state, bio, photoUrl });
    const token = sign(user);
    res.status(201).json({ user: { id: user.id, name, email, role, photoUrl }, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao registrar' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
    const token = sign(user);
    res.json({ user: { id: user.id, name: user.name, role: user.role, photoUrl: user.photoUrl, email: user.email }, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao logar' });
  }
});

app.get('/service-types', async (req, res) => {
  try {
    const cacheKey = 'service_types_all';
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    const rows = await ServiceType.findAll({ order: [['name','ASC']] });
    await redis.set(cacheKey, JSON.stringify(rows), 'EX', 300);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao listar tipos' });
  }
});

app.post('/service-types', auth('PROVIDER'), async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const st = await ServiceType.create({ name });
    await redis.del('service_types_all');
    res.status(201).json(st);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar tipo' });
  }
});

app.post('/providers/:providerId/services', auth('PROVIDER'), async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    if (req.user.id !== providerId) return res.status(403).json({ error: 'Só pode criar para si' });

    const { serviceTypeId, name, description, photos = [], variations = [] } = req.body || {};
    if (!serviceTypeId || !name || !Array.isArray(variations) || !variations.length) {
      return res.status(400).json({ error: 'serviceTypeId, name e pelo menos 1 variação são obrigatórios' });
    }

    const svc = await Service.create({
      name: name.trim(),
      description: (description || '').trim(),
      photos: JSON.stringify(Array.isArray(photos) ? photos.filter(Boolean) : []),
      providerId, serviceTypeId
    });

    for (const v of variations) {
      if (!v?.name) continue;
      await ServiceVariation.create({
        serviceId: svc.id,
        name: String(v.name).trim(),
        price: Number(v.price),
        durationMinutes: parseInt(v.durationMinutes, 10)
      });
    }

    try {
      if (es) {
        await es.index({
          index: 'services',
          id: String(svc.id),
          document: {
            id: svc.id,
            name: svc.name,
            description: svc.description,
            photos: JSON.parse(svc.photos || '[]'),
            providerId,
            serviceTypeId,
            variations
          },
          refresh: 'wait_for'
        });
      }
    } catch (e) { console.warn('Falha indexar ES:', e.message); }

    res.status(201).json({ id: svc.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar serviço' });
  }
});

app.get('/providers/:providerId/services', async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const rows = await Service.findAll({
      where: { providerId },
      include: [{ model: ServiceVariation, as: 'variations' }]
    });
    const out = rows.map(r => {
      const o = r.toJSON();
      try { o.photos = JSON.parse(o.photos || '[]'); } catch { o.photos = []; }
      return o;
    });
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao listar serviços' });
  }
});

app.put('/providers/:providerId/services/:serviceId', auth('PROVIDER'), async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const serviceId  = parseInt(req.params.serviceId, 10);
    if (req.user.id !== providerId) return res.status(403).json({ error: 'Só pode editar os seus serviços' });

    const svc = await Service.findByPk(serviceId, { include: [{ model: ServiceVariation, as: 'variations' }] });
    if (!svc || svc.providerId !== providerId) return res.status(404).json({ error: 'Serviço não encontrado' });

    const { serviceTypeId, name, description, photos, variations } = req.body || {};
    if (serviceTypeId != null) svc.serviceTypeId = Number(serviceTypeId);
    if (typeof name === 'string') svc.name = name.trim();
    if (typeof description === 'string') svc.description = description.trim();
    if (photos !== undefined) svc.photos = JSON.stringify(Array.isArray(photos) ? photos.filter(Boolean) : []);

    if (Array.isArray(variations)) {
      await ServiceVariation.destroy({ where: { serviceId: svc.id } });
      for (const v of variations) {
        if (!v?.name) continue;
        await ServiceVariation.create({
          serviceId: svc.id,
          name: String(v.name).trim(),
          price: Number(v.price),
          durationMinutes: parseInt(v.durationMinutes, 10)
        });
      }
    }

    await svc.save();
    const refreshed = await Service.findByPk(serviceId, { include: [{ model: ServiceVariation, as: 'variations' }] });
    const o = refreshed.toJSON();
    try { o.photos = JSON.parse(o.photos || '[]'); } catch { o.photos = []; }

    try {
      if (es) {
        await es.index({
          index: 'services',
          id: String(serviceId),
          document: {
            id: serviceId,
            name: o.name,
            description: o.description || '',
            photos: o.photos,
            providerId: o.providerId,
            serviceTypeId: o.serviceTypeId,
            variations: (o.variations || []).map(v => ({ name: v.name, price: v.price, durationMinutes: v.durationMinutes }))
          },
          refresh: true
        });
      }
    } catch (e) { console.warn('ES update falhou:', e.message); }

    res.json(o);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao atualizar serviço' });
  }
});

app.delete('/providers/:providerId/services/:serviceId', auth('PROVIDER'), async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const serviceId  = parseInt(req.params.serviceId, 10);
    if (req.user.id !== providerId) return res.status(403).json({ error: 'Só pode excluir os seus serviços' });

    const svc = await Service.findByPk(serviceId);
    if (!svc || svc.providerId !== providerId) return res.status(404).json({ error: 'Serviço não encontrado' });

    const force = String(req.query.force || '').toLowerCase() === 'true';

    // Verifica bookings vinculados a este serviço
    const bookingsCount = await Booking.count({ where: { providerId, serviceId, status: { [Op.ne]: 'CANCELLED' } } });
    if (bookingsCount > 0 && !force) {
      return res.status(409).json({ error: 'Este serviço possui contratações ativas. Use ?force=true para excluir o serviço e suas contratações.' });
    }

    // Se for forçado, exclui bookings primeiro (evita erro de FK), depois variações, depois o serviço
    if (bookingsCount > 0 && force) {
      await Booking.destroy({ where: { providerId, serviceId } });
    }

    await ServiceVariation.destroy({ where: { serviceId: svc.id } });
    await svc.destroy();
    try { if (es) await es.delete({ index: 'services', id: String(serviceId), refresh: true }); } catch (_) {}
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao excluir serviço' });
  }
});


app.post('/services/:serviceId/ratings', auth('CLIENT'), async (req, res) => {
  try {
    const serviceId = parseInt(req.params.serviceId, 10);
    const { score, comment } = req.body || {};
    if (!Number.isInteger(score) || score < 1 || score > 5) return res.status(400).json({ error: 'score deve ser 1..5' });

    const svc = await Service.findByPk(serviceId);
    if (!svc) return res.status(404).json({ error: 'Serviço não encontrado' });
    if (svc.providerId === req.user.id) return res.status(400).json({ error: 'Prestador não pode avaliar o próprio serviço' });

    const [r, created] = await Rating.findOrCreate({
      where: { serviceId, clientId: req.user.id },
      defaults: { score, comment: String(comment||'').slice(0, 1000) }
    });
    if (!created) {
      r.score = score;
      r.comment = String(comment||'').slice(0, 1000);
      await r.save();
    }

    const agg = await Rating.findAll({
      attributes: ['serviceId', [sequelize.fn('AVG', sequelize.col('score')), 'avg'], [sequelize.fn('COUNT', '*'), 'count']],
      where: { serviceId }
    });
    const avg = Number(agg?.[0]?.get('avg') || 0);
    const count = Number(agg?.[0]?.get('count') || 0);
    res.json({ ok: true, avg, count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao avaliar' });
  }
});

app.get('/services/:serviceId/ratings/summary', async (req, res) => {
  try {
    const serviceId = parseInt(req.params.serviceId, 10);
    const agg = await Rating.findAll({
      attributes: ['serviceId', [sequelize.fn('AVG', sequelize.col('score')), 'avg'], [sequelize.fn('COUNT', '*'), 'count']],
      where: { serviceId }
    });
    const avg = Number(agg?.[0]?.get('avg') || 0);
    const count = Number(agg?.[0]?.get('count') || 0);
    res.json({ avg, count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao obter rating' });
  }
});
app.get('/services/:id', async (req, res) => {
  try {
    const s = await Service.findByPk(req.params.id, {
      include: [
        { model: ServiceVariation, as: 'variations' },
        { model: User, as: 'provider', attributes: ['id','name','city','state','bio','photoUrl'] },
        { model: ServiceType, as: 'type', attributes: ['id','name'] }
      ]
    });
    if (!s) return res.status(404).json({ error: 'Não encontrado' });
    const o = s.toJSON();
    try { o.photos = JSON.parse(o.photos || '[]'); } catch { o.photos = []; }
    res.json(o);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao buscar serviço' });
  }
});

app.get('/services', async (req, res) => {
  try {
    const rows = await Service.findAll({
      include: [
        { model: User, as: 'provider', attributes: ['id','name','photoUrl'] },
        { model: ServiceType, as: 'type', attributes: ['id','name'] },
        { model: ServiceVariation, as: 'variations' }
      ],
      order: [['id', 'DESC']]
    });
    
    const agg = await Rating.findAll({
      attributes: ['serviceId', [sequelize.fn('AVG', sequelize.col('score')), 'avg'], [sequelize.fn('COUNT', '*'), 'count']],
      group: ['serviceId']
    });
    const ratingMap = Object.fromEntries(agg.map(a => [a.get('serviceId'), { avg: Number(a.get('avg')||0), count: Number(a.get('count')||0) }]));
const out = rows.map(s => {
      const o = s.toJSON();
      try { o.photos = JSON.parse(o.photos || '[]'); } catch { o.photos = []; }
      return {
        id: o.id,
        avgRating: (ratingMap[o.id]?.avg || 0),
        ratingsCount: (ratingMap[o.id]?.count || 0),
        name: o.name,
        description: o.description,
        photos: o.photos,
        type: o.type ? { id: o.type.id, name: o.type.name } : null,
        provider: o.provider ? { id: o.provider.id, name: o.provider.name, photoUrl: o.provider.photoUrl } : null,
        variations: o.variations || []
      };
    });
    res.json(out);
  } catch (e) {
    console.error('Erro ao listar serviços', e);
    res.status(500).json({ error: 'Erro ao listar serviços' });
  }
});

function ensureDateTime(dateStr, hhmm) {
  if (!dateStr || !hhmm) throw new Error("Parâmetros de data/hora ausentes");
  const t = /^\d{2}:\d{2}(:\d{2})?$/.test(hhmm) ? (hhmm.length === 5 ? `${hhmm}:00` : hhmm) : hhmm;

  // Normaliza a data em string (YYYY-MM-DD) quando vier como Date
  const dateStrNorm = (dateStr instanceof Date) ? dateStr.toISOString().slice(0,10) : String(dateStr);

  // Interpreta o horário como relógio local do prestador (Brasil Nordeste – America/Fortaleza: -03:00 por padrão).
  // Isso evita o "pulo" de fuso quando o backend serializa para ISO UTC e o frontend mostra no horário local.
  const tzOffset = process.env.TZ_OFFSET || '-03:00'; // Ajustável via env se necessário
  const dt = new Date(`${dateStrNorm}T${t}${tzOffset}`);

  if (isNaN(dt.getTime())) throw new Error("Horário inválido");
  return dt;
}
function refDateForDow(dow) {
  const baseSunday = new Date(Date.UTC(1970, 0, 4, 0, 0, 0));
  const ref = new Date(baseSunday.getTime() + Number(dow) * 24 * 60 * 60 * 1000);
  return ref.toISOString().slice(0, 10);
}
function mountAvailabilityRoutes(prefix = '') {
  const base = prefix + '/providers/:providerId';
  app.post(base + '/availability', auth('PROVIDER'), async (req, res) => {
    try {
      const providerId = parseInt(req.params.providerId, 10);
      if (req.user.id !== providerId) return res.status(403).json({ error: "Só pode criar para si" });
      let { date, dayOfWeek } = req.body || {};
      let { startTime, endTime, start, end } = req.body || {};
      startTime = startTime || start;
      endTime   = endTime   || end;
      if (!startTime || !endTime) return res.status(400).json({ error: "startTime e endTime são obrigatórios" });
      let startDT, endDT, weekly = false, dow = null;
      if (date) {
        startDT = ensureDateTime(String(date), String(startTime));
        endDT   = ensureDateTime(String(date), String(endTime));
      } else if (dayOfWeek !== undefined && dayOfWeek !== null) {
        const d = Number(dayOfWeek);
        if (!Number.isInteger(d) || d < 0 || d > 6) return res.status(400).json({ error: "dayOfWeek deve ser 0..6" });
        const ref = refDateForDow(d);
        startDT = ensureDateTime(ref, String(startTime));
        endDT   = ensureDateTime(ref, String(endTime));
        weekly  = true;
        dow     = d;
      } else if (/^\d{4}-\d{2}-\d{2}T/.test(String(startTime)) && /^\d{4}-\d{2}-\d{2}T/.test(String(endTime))) {
        const s = new Date(startTime), e = new Date(endTime);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return res.status(400).json({ error: "Datas inválidas" });
        startDT = s; endDT = e;
      } else {
        return res.status(400).json({ error: "Use {date:'YYYY-MM-DD', startTime:'HH:MM', endTime:'HH:MM'} OU {dayOfWeek:0..6, startTime:'HH:MM', endTime:'HH:MM'}." });
      }
      const row = await Availability.create({ providerId, startTime: startDT, endTime: endDT, weekly, dayOfWeek: dow });
      await redis.del(`avail_${providerId}`);
      return res.status(201).json(row);
    } catch (e) {
      console.error("createAvailability error", e);
      return res.status(500).json({ error: "Erro ao criar disponibilidade" });
    }
  });
  app.get(base + '/availability', async (req, res) => {
    try {
      const providerId = parseInt(req.params.providerId, 10);
      const cacheKey = `avail_${providerId}`;
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
      const rows = await Availability.findAll({ where: { providerId }, order: [['startTime', 'ASC'], ['id', 'ASC']] });
      await redis.set(cacheKey, JSON.stringify(rows), 'EX', 60);
      return res.json(rows);
    } catch (e) {
      console.error("listAvailability error", e);
      return res.status(500).json({ error: "Erro ao listar" });
    }
  });
  app.put(base + '/availability/:availabilityId', auth('PROVIDER'), async (req, res) => {
    try {
      const providerId = parseInt(req.params.providerId, 10);
      const availabilityId = parseInt(req.params.availabilityId, 10);
      if (req.user.id !== providerId) return res.status(403).json({ error: "Só pode alterar a própria agenda." });
      const av = await Availability.findByPk(availabilityId);
      if (!av || av.providerId !== providerId) return res.status(404).json({ error: "Disponibilidade não encontrada." });
      let { date, dayOfWeek } = req.body || {};
      let { startTime, endTime, start, end } = req.body || {};
      startTime = startTime || start;
      endTime   = endTime   || end;
      if (!startTime || !endTime) return res.status(400).json({ error: "startTime e endTime são obrigatórios" });
      if (date) {
        av.startTime = ensureDateTime(String(date), String(startTime));
        av.endTime   = ensureDateTime(String(date), String(endTime));
        av.weekly = false; av.dayOfWeek = null;
      } else if (dayOfWeek !== undefined && dayOfWeek !== null) {
        const d = Number(dayOfWeek);
        if (!Number.isInteger(d) || d < 0 || d > 6) return res.status(400).json({ error: "dayOfWeek deve ser 0..6" });
        const ref = refDateForDow(d);
        av.startTime = ensureDateTime(ref, String(startTime));
        av.endTime   = ensureDateTime(ref, String(endTime));
        av.weekly = true; av.dayOfWeek = d;
      } else if (/^\d{4}-\d{2}-\d{2}T/.test(String(startTime)) && /^\d{4}-\d{2}-\d{2}T/.test(String(endTime))) {
        const s = new Date(startTime), e = new Date(endTime);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) return res.status(400).json({ error: "Datas inválidas" });
        av.startTime = s; av.endTime = e;
      } else {
        return res.status(400).json({ error: "Formato inválido" });
      }
      await av.save();
      await redis.del(`avail_${providerId}`);
      return res.json(av);
    } catch (e) {
      console.error("PUT availability erro:", e);
      return res.status(500).json({ error: "Erro ao atualizar disponibilidade" });
    }
  });
  app.delete(base + '/availability/:availabilityId', auth('PROVIDER'), async (req, res) => {
    try {
      const providerId = parseInt(req.params.providerId, 10);
      const availabilityId = parseInt(req.params.availabilityId, 10);
      if (req.user.id !== providerId) return res.status(403).json({ error: "Só pode excluir a própria agenda." });
      const av = await Availability.findByPk(availabilityId);
      if (!av || av.providerId !== providerId) return res.status(404).json({ error: "Disponibilidade não encontrada." });
      await av.destroy();
      await redis.del(`avail_${providerId}`);
      return res.json({ ok: true });
    } catch (e) {
      console.error("DELETE availability erro:", e);
      return res.status(500).json({ error: "Erro ao excluir disponibilidade" });
    }
  });
  // atalhos plural
  app.post(base + '/availabilities', auth('PROVIDER'), (req, res, next) => { req.url = req.url.replace('/availabilities', '/availability'); next(); }, (req,res)=>{});
  app.get(base + '/availabilities', (req, res, next) => { req.url = req.url.replace('/availabilities', '/availability'); next(); }, (req,res)=>{});
}
mountAvailabilityRoutes('');
mountAvailabilityRoutes('/api');
mountAvailabilityRoutes('/v1');

app.post('/bookings', async (req, res) => {
  try {
    const { clientId, variationId, startTime } = req.body || {};
    if (!clientId || !variationId || !startTime) return res.status(400).json({ error: 'clientId, variationId e startTime são obrigatórios' });
    const variation = await ServiceVariation.findByPk(variationId, { include: [{ model: Service }] });
    if (!variation) return res.status(404).json({ error: 'Variação não encontrada' });
    const service = await Service.findByPk(variation.serviceId);
    const providerId = service.providerId;
    const start = dayjs(startTime);
    const end = start.add(variation.durationMinutes, 'minute');
    const overlaps = await Booking.findOne({
      where: {
        providerId,
        status: 'CONFIRMED',
        [Op.or]: [
          { startTime: { [Op.lt]: end.toDate() }, endTime: { [Op.gt]: start.toDate() } }
        ]
      }
    });
    if (overlaps) return res.status(409).json({ error: 'Horário indisponível' });
    const booking = await Booking.create({
      providerId, clientId, serviceId: service.id, serviceVariationId: variation.id,
      startTime: start.toDate(), endTime: end.toDate(), status: 'CONFIRMED'
    });
    res.status(201).json(booking);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao contratar' });
  }
});

app.get('/providers/:providerId/bookings', async (req, res) => {
  try {
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao listar contratações' });
  }
});

app.delete('/bookings/:id', async (req, res) => {
  try {
    const b = await Booking.findByPk(req.params.id);
    if (!b) return res.status(404).json({ error: 'Não encontrado' });
    b.status = 'CANCELLED';
    await b.save();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao cancelar' });
  }
});

app.get('/providers/:providerId/notifications', async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    const rows = await Notification.findAll({ where: { providerId }, order: [['createdAt','DESC']] });
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao listar notificações' });
  }
});

function ensureDirSync(dirPath) { try { fs.mkdirSync(dirPath, { recursive: true }); } catch {} }
function extFromMime(mime) {
  if (!mime) return '.png';
  const map = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  return map[(mime||'').toLowerCase()] || '.png';
}
function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return { mime: null, base64: null };
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mime: m[1], base64: m[2] };
  return { mime: null, base64: dataUrl };
}

app.post('/providers/:providerId/photo', auth('PROVIDER'), async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId, 10);
    if (!Number.isFinite(providerId)) return res.status(400).json({ error: 'providerId inválido' });
    if (!req.user || req.user.id !== providerId) return res.status(403).json({ error: 'Só pode enviar sua própria foto.' });

    const imageBase64 = req.body?.imageBase64 || req.body?.image || req.body?.photo || req.body?.data;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 é obrigatório.' });

    const { mime, base64 } = parseDataUrl(imageBase64);
    if (!base64) return res.status(400).json({ error: 'Imagem inválida.' });

    const buf = Buffer.from(base64, 'base64');
    if (!buf || !buf.length) return res.status(400).json({ error: 'Imagem vazia.' });

    const dir = path.join(__dirname, 'uploads', 'providers');
    ensureDirSync(dir);
    const ext = extFromMime(mime);
    const filename = `provider_${providerId}_${Date.now()}${ext}`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buf);

    const relUrl = `/uploads/providers/${filename}`;
    await User.update({ photoUrl: relUrl }, { where: { id: providerId } });

    return res.json({ ok: true, photoUrl: relUrl });
  } catch (e) {
    console.error('Erro upload foto:', e);
    return res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});

async function boot() {
  try {
    await sequelize.authenticate();
    console.log('🗄️  Conectado ao MySQL');
    await sequelize.sync({ alter: true });
    try { await sequelize.query('CREATE UNIQUE INDEX uniq_rating_service_client ON ratings (serviceId, clientId)'); } catch (e) {}
    // Garantir índice único p/ evitar double-booking em nível de banco (idempotente)
    try {
      await sequelize.query('CREATE UNIQUE INDEX uniq_booking_provider_time ON bookings (providerId, startTime, endTime)');
    } catch (e) {
      // MySQL/MariaDB não tem IF NOT EXISTS para CREATE INDEX em algumas versões; ignore se já existir
    }

    const count = await ServiceType.count();
    if (count === 0) {
      await ServiceType.bulkCreate([
        { name: 'Manicure' }, { name: 'Massagem' }, { name: 'Pedicure' },
        { name: 'Eletricista' }, { name: 'Pintor' }, { name: 'Diarista' }
      ]);
      console.log('🌱 Tipos de serviço seed criados');
    }

    try {
      if (es) {
        const exists = await es.indices.exists({ index: 'services' });
        if (!exists?.body && exists !== true) { await es.indices.create({ index: 'services' }); }
        console.log('🔎 ES index pronto: services');
      }
    } catch (e) { console.warn('ES indisponível?', e.message); }

    app.listen(PORT, () => console.log(`🚀 API rodando em http://localhost:${PORT}`));
  } catch (e) {
    console.error('Erro ao subir API:', e);
    process.exit(1);
  }
}
boot();