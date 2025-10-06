-- Seed for mini_marketplace (non-destructive).

-- Run AFTER the app has created the schema (Sequelize sync).

SET NAMES utf8mb4;

SET time_zone = '+00:00';

START TRANSACTION;

INSERT INTO service_types (name, createdAt, updatedAt)
SELECT 'Manicure', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE name = 'Manicure');

INSERT INTO service_types (name, createdAt, updatedAt)
SELECT 'Massagem', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE name = 'Massagem');

INSERT INTO service_types (name, createdAt, updatedAt)
SELECT 'Pedicure', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE name = 'Pedicure');

INSERT INTO service_types (name, createdAt, updatedAt)
SELECT 'Eletricista', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE name = 'Eletricista');

INSERT INTO service_types (name, createdAt, updatedAt)
SELECT 'Pintor', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE name = 'Pintor');

INSERT INTO service_types (name, createdAt, updatedAt)
SELECT 'Diarista', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE name = 'Diarista');

INSERT INTO users (id, name, email, passwordHash, role, phone, city, state, bio, photoUrl, createdAt, updatedAt)
VALUES (1, 'Prestador 1', 'provider1@example.com', '$2b$12$hkoFdngaKx2y1kCFgMsmIuz9Plp8LMWmmsGC.oO5W3iDvTc7ff7AG', 'PROVIDER', '+55 84 901010101', 'Natal', 'RN', 'Profissional 1 com serviços de qualidade.', '/uploads/providers/provider_1_1759698416625.jpg', '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), phone=VALUES(phone), city=VALUES(city), state=VALUES(state), bio=VALUES(bio), photoUrl=VALUES(photoUrl), updatedAt=VALUES(updatedAt);

INSERT INTO users (id, name, email, passwordHash, role, phone, city, state, bio, photoUrl, createdAt, updatedAt)
VALUES (11, 'Prestador 11', 'provider11@example.com', '$2b$12$hkoFdngaKx2y1kCFgMsmIuz9Plp8LMWmmsGC.oO5W3iDvTc7ff7AG', 'PROVIDER', '+55 84 911111111', 'Natal', 'RN', 'Profissional 11 com serviços de qualidade.', '/uploads/providers/provider_11_1759698393802.png', '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), phone=VALUES(phone), city=VALUES(city), state=VALUES(state), bio=VALUES(bio), photoUrl=VALUES(photoUrl), updatedAt=VALUES(updatedAt);

INSERT INTO users (id, name, email, passwordHash, role, phone, city, state, bio, photoUrl, createdAt, updatedAt)
VALUES (12, 'Prestador 12', 'provider12@example.com', '$2b$12$hkoFdngaKx2y1kCFgMsmIuz9Plp8LMWmmsGC.oO5W3iDvTc7ff7AG', 'PROVIDER', '+55 84 912121212', 'Natal', 'RN', 'Profissional 12 com serviços de qualidade.', '/uploads/providers/provider_12_1759698373428.jpg', '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), phone=VALUES(phone), city=VALUES(city), state=VALUES(state), bio=VALUES(bio), photoUrl=VALUES(photoUrl), updatedAt=VALUES(updatedAt);

INSERT INTO users (id, name, email, passwordHash, role, phone, city, state, bio, photoUrl, createdAt, updatedAt)
VALUES (15, 'Prestador 15', 'provider15@example.com', '$2b$12$hkoFdngaKx2y1kCFgMsmIuz9Plp8LMWmmsGC.oO5W3iDvTc7ff7AG', 'PROVIDER', '+55 84 915151515', 'Natal', 'RN', 'Profissional 15 com serviços de qualidade.', '/uploads/providers/provider_15_1759698342494.jpg', '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), phone=VALUES(phone), city=VALUES(city), state=VALUES(state), bio=VALUES(bio), photoUrl=VALUES(photoUrl), updatedAt=VALUES(updatedAt);

INSERT INTO users (id, name, email, passwordHash, role, phone, city, state, bio, photoUrl, createdAt, updatedAt)
VALUES (16, 'Prestador 16', 'provider16@example.com', '$2b$12$hkoFdngaKx2y1kCFgMsmIuz9Plp8LMWmmsGC.oO5W3iDvTc7ff7AG', 'PROVIDER', '+55 84 916161616', 'Natal', 'RN', 'Profissional 16 com serviços de qualidade.', '/uploads/providers/provider_16_1759708150295.png', '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), phone=VALUES(phone), city=VALUES(city), state=VALUES(state), bio=VALUES(bio), photoUrl=VALUES(photoUrl), updatedAt=VALUES(updatedAt);

INSERT INTO users (id, name, email, passwordHash, role, phone, city, state, bio, photoUrl, createdAt, updatedAt)
VALUES (18, 'Prestador 18', 'provider18@example.com', '$2b$12$hkoFdngaKx2y1kCFgMsmIuz9Plp8LMWmmsGC.oO5W3iDvTc7ff7AG', 'PROVIDER', '+55 84 918181818', 'Natal', 'RN', 'Profissional 18 com serviços de qualidade.', '/uploads/providers/provider_18_1759697992850.jpg', '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), phone=VALUES(phone), city=VALUES(city), state=VALUES(state), bio=VALUES(bio), photoUrl=VALUES(photoUrl), updatedAt=VALUES(updatedAt);

INSERT INTO users (id, name, email, passwordHash, role, phone, city, state, bio, photoUrl, createdAt, updatedAt)
VALUES (20, 'Prestador 20', 'provider20@example.com', '$2b$12$hkoFdngaKx2y1kCFgMsmIuz9Plp8LMWmmsGC.oO5W3iDvTc7ff7AG', 'PROVIDER', '+55 84 920202020', 'Natal', 'RN', 'Profissional 20 com serviços de qualidade.', '/uploads/providers/provider_20_1759698209514.jpg', '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), role=VALUES(role), phone=VALUES(phone), city=VALUES(city), state=VALUES(state), bio=VALUES(bio), photoUrl=VALUES(photoUrl), updatedAt=VALUES(updatedAt);

INSERT INTO users (id, name, email, passwordHash, role, phone, city, state, bio, photoUrl, createdAt, updatedAt)
VALUES (1000, 'Cliente Demo', 'cliente@example.com', '$2b$12$hkoFdngaKx2y1kCFgMsmIuz9Plp8LMWmmsGC.oO5W3iDvTc7ff7AG', 'CLIENT', '+55 84 99999-0000', 'Natal', 'RN', 'Cliente para testes.', NULL, '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE updatedAt=VALUES(updatedAt);

INSERT INTO services (id, providerId, serviceTypeId, name, description, photos, createdAt, updatedAt)
SELECT 1, 1, st.id, 'Serviço Manicure do Prestador 1', 'Manicure realizada por profissional experiente (ID 1).', '["/uploads/providers/provider_1_1759698416625.jpg"]', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM service_types st
WHERE st.name = 'Manicure'
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), photos=VALUES(photos), updatedAt=VALUES(updatedAt);

INSERT INTO service_variations (id, serviceId, name, price, durationMinutes, createdAt, updatedAt)
VALUES (1, 1, 'Padrão', 50.00, 30, '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE price=VALUES(price), durationMinutes=VALUES(durationMinutes), updatedAt=VALUES(updatedAt);

INSERT INTO services (id, providerId, serviceTypeId, name, description, photos, createdAt, updatedAt)
SELECT 2, 11, st.id, 'Serviço Massagem do Prestador 11', 'Massagem realizada por profissional experiente (ID 11).', '["/uploads/providers/provider_11_1759698393802.png"]', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM service_types st
WHERE st.name = 'Massagem'
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), photos=VALUES(photos), updatedAt=VALUES(updatedAt);

INSERT INTO service_variations (id, serviceId, name, price, durationMinutes, createdAt, updatedAt)
VALUES (2, 2, 'Padrão', 60.00, 45, '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE price=VALUES(price), durationMinutes=VALUES(durationMinutes), updatedAt=VALUES(updatedAt);

INSERT INTO services (id, providerId, serviceTypeId, name, description, photos, createdAt, updatedAt)
SELECT 3, 12, st.id, 'Serviço Pedicure do Prestador 12', 'Pedicure realizada por profissional experiente (ID 12).', '["/uploads/providers/provider_12_1759698373428.jpg"]', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM service_types st
WHERE st.name = 'Pedicure'
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), photos=VALUES(photos), updatedAt=VALUES(updatedAt);

INSERT INTO service_variations (id, serviceId, name, price, durationMinutes, createdAt, updatedAt)
VALUES (3, 3, 'Padrão', 70.00, 60, '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE price=VALUES(price), durationMinutes=VALUES(durationMinutes), updatedAt=VALUES(updatedAt);

INSERT INTO services (id, providerId, serviceTypeId, name, description, photos, createdAt, updatedAt)
SELECT 4, 15, st.id, 'Serviço Eletricista do Prestador 15', 'Eletricista realizada por profissional experiente (ID 15).', '["/uploads/providers/provider_15_1759698342494.jpg"]', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM service_types st
WHERE st.name = 'Eletricista'
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), photos=VALUES(photos), updatedAt=VALUES(updatedAt);

INSERT INTO service_variations (id, serviceId, name, price, durationMinutes, createdAt, updatedAt)
VALUES (4, 4, 'Padrão', 80.00, 30, '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE price=VALUES(price), durationMinutes=VALUES(durationMinutes), updatedAt=VALUES(updatedAt);

INSERT INTO services (id, providerId, serviceTypeId, name, description, photos, createdAt, updatedAt)
SELECT 5, 16, st.id, 'Serviço Pintor do Prestador 16', 'Pintor realizada por profissional experiente (ID 16).', '["/uploads/providers/provider_16_1759708150295.png"]', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM service_types st
WHERE st.name = 'Pintor'
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), photos=VALUES(photos), updatedAt=VALUES(updatedAt);

INSERT INTO service_variations (id, serviceId, name, price, durationMinutes, createdAt, updatedAt)
VALUES (5, 5, 'Padrão', 90.00, 45, '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE price=VALUES(price), durationMinutes=VALUES(durationMinutes), updatedAt=VALUES(updatedAt);

INSERT INTO services (id, providerId, serviceTypeId, name, description, photos, createdAt, updatedAt)
SELECT 6, 18, st.id, 'Serviço Diarista do Prestador 18', 'Diarista realizada por profissional experiente (ID 18).', '["/uploads/providers/provider_18_1759697992850.jpg"]', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM service_types st
WHERE st.name = 'Diarista'
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), photos=VALUES(photos), updatedAt=VALUES(updatedAt);

INSERT INTO service_variations (id, serviceId, name, price, durationMinutes, createdAt, updatedAt)
VALUES (6, 6, 'Padrão', 50.00, 60, '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE price=VALUES(price), durationMinutes=VALUES(durationMinutes), updatedAt=VALUES(updatedAt);

INSERT INTO services (id, providerId, serviceTypeId, name, description, photos, createdAt, updatedAt)
SELECT 7, 20, st.id, 'Serviço Manicure do Prestador 20', 'Manicure realizada por profissional experiente (ID 20).', '["/uploads/providers/provider_20_1759698209514.jpg"]', '2025-10-05 00:00:00', '2025-10-05 00:00:00'
FROM service_types st
WHERE st.name = 'Manicure'
ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), photos=VALUES(photos), updatedAt=VALUES(updatedAt);

INSERT INTO service_variations (id, serviceId, name, price, durationMinutes, createdAt, updatedAt)
VALUES (7, 7, 'Padrão', 60.00, 30, '2025-10-05 00:00:00', '2025-10-05 00:00:00')
ON DUPLICATE KEY UPDATE price=VALUES(price), durationMinutes=VALUES(durationMinutes), updatedAt=VALUES(updatedAt);

COMMIT;