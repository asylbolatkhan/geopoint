# GeoPoint / GeoVictorina

Бұл репозиторийде екі бөлек өнім бар:

1. **geopoint-website** — географиялық интерактив пен 3D-глобус көрсететін негізгі веб-сайт (осы репозиторийдің түбірі). Railway-де `geopoint-website` қызметі ретінде бұрыннан деплой етілген.
2. **GeoVictorina** — Telegram Mini App түріндегі викторина: оқушылар жаттығады, бір-бірімен батл ойнайды, рейтингте жарысады; мұғалім/әкімші сыныптарды, оқушыларды және статистиканы басқарады.

---

## Құрылым

```
.
├── src/, public/, index.html, vite.config.js   ← web (түбір): negізгі сайт
├── tma/                                        ← Telegram Mini App (фронтенд, React)
├── server/                                     ← API (Express) + PostgreSQL + Telegram бот (grammY)
└── shared/                                     ← web мен tma екеуі де қолданатын ортақ деректер/логика
                                                    (континенттер бойынша сұрақтар қоры, quiz-engine)
```

| Бөлік | Сипаттамасы | Толығырақ |
|---|---|---|
| **web (түбір)** | Негізгі сайт. Өз алдына Railway қызметі, бөлек деплой етіледі, осы тапсырмада өзгертілмейді. | — |
| **tma/** | Оқушылар Telegram бот арқылы ашатын Mini App: тіркелу, жаттығу, батл, рейтинг, профиль. | [server/README.md](./server/README.md) (build/production ағыны серверге қосылған) |
| **server/** | REST API, PostgreSQL миграциялары мен seed, Telegram бот (хабарламалар, батл шақырулары), production-да `tma/dist`-ті де серверлейді. | [server/README.md](./server/README.md) |
| **shared/** | web және tma арасында ортақ пайдаланылатын деректер мен логика (мысалы, континенттер бойынша сұрақтар, quiz-engine, shuffle). | — |

Production-ға (Railway) GeoVictorina (bot + Mini App + API) қалай деплой етілетіні толығымен жазылған: **[DEPLOY.md](./DEPLOY.md)** (қазақ тілінде, мұғалімге арналған, қадам сайын).

---

## Жылдам бастау (әзірлеуші үшін)

Негізгі сайт (түбір):

```
npm install
npm run dev
```

GeoVictorina (tma + server) — толық нұсқаулық: [server/README.md](./server/README.md).

## Деплой

Production ортаға шығару қадамдары — [DEPLOY.md](./DEPLOY.md) файлында.
