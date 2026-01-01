# ApiDouble

**Developer Productivity Tool for API Mocking & Traffic Interception**

Frontend geliştirme sürecinde "API henüz hazır değil" veya "Backend test ortamı çöktü" problemlerine son veren, akıllı kayıt-oynatma (record & playback) mekanizmasına sahip bir proxy aracı.

---

## Problem

Büyük kurumsal projelerde frontend geliştiricileri sıklıkla şu engellerle karşılaşır:

- Backend API'leri henüz hazır değil
- Test ortamları kararsız veya erişilemez durumda
- Edge case ve hata senaryolarını test etmek zor
- API değişikliklerinde frontend'in etkilenmesi

**ApiDouble** bu tıkanıklıkları (bottlenecks) ortadan kaldırarak geliştirici üretkenliğini artırır.

---

## Özellikler

### Çekirdek Modlar

| Mod | Açıklama |
|-----|----------|
| **🔴 Proxy (Record)** | İstekleri gerçek backend'e iletir, yanıtları kaydeder |
| **🟢 Mock (Playback)** | Kaydedilmiş yanıtları döner, backend'e ihtiyaç duymaz |
| **🟡 Intercept (Modify)** | Yanıtları frontend'e iletmeden önce değiştirir |

### Gelişmiş Özellikler

- **🎲 Chaos Engine** — Gerçekçi gecikme simülasyonu ile yavaş ağ koşullarını test edin
- **🌱 Dynamic Data Seeding** — Faker.js ile akıllı, bağlama uygun sahte veri üretimi
- **🔍 Smart Request Matching** — URL, header, query params ve body bazlı akıllı eşleştirme
- **🌐 Automatic CORS Handling** — Cross-origin sorunlarını otomatik çözüm
- **📊 Admin Dashboard** — Kaydedilen trafiği görselleştiren web arayüzü
- **⚡ Hot Reload** — Çalışma anında yeni route tanımlama

---

## Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                      ApiDouble Server                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   Frontend  │───▶│   Proxy     │───▶│   Backend   │    │
│   │   App       │◀───│   Engine    │◀───│   API       │    │
│   └─────────────┘    └──────┬──────┘    └─────────────┘    │
│                             │                               │
│                      ┌──────▼──────┐                        │
│                      │   Storage   │                        │
│                      │   Layer     │                        │
│                      └──────┬──────┘                        │
│                             │                               │
│          ┌──────────────────┼──────────────────┐            │
│          ▼                  ▼                  ▼            │
│   ┌────────────┐    ┌────────────┐    ┌────────────┐       │
│   │  Request   │    │  Response  │    │   Rules    │       │
│   │  Cache     │    │  Cache     │    │   Config   │       │
│   └────────────┘    └────────────┘    └────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Kurulum

```bash
# Global kurulum
npm install -g apidouble

# Veya proje bazlı
npm install --save-dev apidouble
```

---

## Kullanım

### CLI

```bash
# Proxy modunda başlat (kayıt yapar)
apidouble start --mode proxy --target https://api.example.com --port 3001

# Mock modunda başlat (kayıtları oynatır)
apidouble start --mode mock --port 3001

# Intercept modunda başlat
apidouble start --mode intercept --target https://api.example.com --port 3001
```

### Programatik Kullanım

```typescript
import { ApiDouble } from 'apidouble';

const server = new ApiDouble({
  port: 3001,
  target: 'https://api.example.com',
  mode: 'proxy',
  storage: {
    type: 'sqlite',
    path: './apidouble.db'
  },
  chaos: {
    enabled: true,
    latency: { min: 100, max: 500 }
  }
});

// Dinamik route tanımlama
server.route('GET', '/api/users/:id', (req) => ({
  status: 200,
  body: {
    id: req.params.id,
    name: faker.person.fullName(),
    email: faker.internet.email()
  }
}));

// Intercept kuralı
server.intercept('POST', '/api/orders', (response) => {
  response.status = 500;
  response.body = { error: 'Simulated server error' };
  return response;
});

server.start();
```

### Yapılandırma Dosyası

```yaml
# apidouble.config.yml
server:
  port: 3001
  mode: proxy

target:
  url: https://api.example.com
  timeout: 5000

storage:
  type: lowdb
  path: ./mocks

cors:
  enabled: true
  origins: ['http://localhost:3000']

chaos:
  enabled: false
  latency:
    min: 0
    max: 0
  errorRate: 0

matching:
  strategy: smart  # exact | smart | fuzzy
  ignoreHeaders:
    - Authorization
    - X-Request-Id
```

---

## Teknoloji Stack

| Katman | Teknoloji | Gerekçe |
|--------|-----------|---------|
| Runtime | Node.js + TypeScript | Tip güvenliği ve modern JS özellikleri |
| Server | Express.js | Hızlı prototipleme, geniş ekosistem |
| Proxy | http-proxy-middleware | Olgun, güvenilir proxy çözümü |
| Storage | LowDB / SQLite | Sıfır kurulum, taşınabilir |
| CLI | Commander.js | Zengin CLI deneyimi |
| Data Generation | Faker.js | Gerçekçi sahte veri |
| Dashboard | React + Vite | Hızlı, modern admin UI |

---

## Proje Yapısı

```
apidouble/
├── src/
│   ├── core/
│   │   ├── proxy-engine.ts      # İstek yakalama ve yönlendirme
│   │   ├── matcher.ts           # Akıllı request eşleştirme
│   │   └── interceptor.ts       # Response modifikasyonu
│   ├── storage/
│   │   ├── base.ts              # Storage interface
│   │   ├── lowdb.adapter.ts     # JSON tabanlı storage
│   │   └── sqlite.adapter.ts    # SQLite storage
│   ├── generators/
│   │   ├── faker.service.ts     # Dinamik veri üretimi
│   │   └── schema-inferrer.ts   # Response'dan şema çıkarımı
│   ├── chaos/
│   │   ├── latency.ts           # Gecikme simülasyonu
│   │   └── error-injector.ts    # Hata enjeksiyonu
│   ├── cli/
│   │   └── commands.ts          # CLI komutları
│   ├── dashboard/
│   │   └── ...                  # React admin UI
│   └── index.ts
├── tests/
├── apidouble.config.yml
└── package.json
```

---

## Yol Haritası

### v1.0 — Temel Özellikler
- [x] Proxy mode (record)
- [x] Mock mode (playback)
- [x] LowDB storage
- [x] CLI interface
- [x] Basic request matching

### v1.1 — Gelişmiş Özellikler
- [ ] Intercept mode
- [ ] Chaos engine (latency simulation)
- [ ] SQLite storage option
- [ ] Smart request matching (body & headers)

### v1.2 — Developer Experience
- [ ] Admin dashboard UI
- [ ] Faker.js integration
- [ ] Schema inference from responses
- [ ] Hot reload for routes

### v2.0 — Enterprise Features
- [ ] WebSocket support
- [ ] GraphQL mocking
- [ ] Team sharing (cloud sync)
- [ ] VS Code extension

---

## Lisans

MIT License — Detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

<p align="center">
  <b>ApiDouble</b> ile backend beklemeden geliştirmeye devam edin! 🚀
</p>
