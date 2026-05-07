# Sheen AI — Frontend Prototype

React + Vite ile yazılmış tam navigasyonlu mobil uygulama prototipi.

## Hızlı başlangıç

Node.js 18+ gerekli.

```bash
npm install      # bağımlılıkları yükle
npm run dev      # dev server → http://localhost:5173
npm run build    # dist/index.html tek dosya bundle (paylaşılabilir)
```

### Tek dosya preview

Kurulum yapmadan incelemek için: `dist/index.html` dosyasını tarayıcıda aç (build sonrası oluşur). JS/CSS/logo gömülü, internet gerekmez.

### Claude Code ile geliştirme

1. Klasörü Claude Code ile aç: `claude` komutu ya da VS Code + Claude Code extension
2. `npm install && npm run dev`
3. Değişiklikler hot reload ile yansır

## Proje Yapısı

```
src/
├── App.jsx              # Ana uygulama, navigasyon state yönetimi
├── constants.js         # Renk paleti, font değişkenleri, stil factory'leri, plan verileri
├── styles.css           # Global stiller ve CSS animasyonları
├── components/
│   └── index.jsx        # Paylaşılan UI bileşenleri:
│                        #   Logo, StatusBar, Header, BottomNav,
│                        #   Waveform, CheckIcon, PlanCard,
│                        #   SquareParticles, PhoneFrame
├── screens/
│   └── index.jsx        # Tüm ekran bileşenleri:
│                        #   LoginScreen, Login2Screen, MemberInfoScreen
│                        #   HomeScreen, SummaryScreen, SummaryEditScreen
│                        #   MindMapScreen, PaymentScreen
│                        #   RecordsScreen, RecordDetailScreen
│                        #   ProfileScreen, PersonalInfoScreen, EditNicknameScreen
│                        #   LangSelectScreen, AccountBindingScreen, PrivacyPermScreen
│                        #   MemberInfo2Screen, CancelAccountScreen, LegalScreen
└── modals/
    └── index.jsx        # Modal bileşenleri:
                         #   StopModal, RenameModal, CountryModal,
                         #   AgeModal, CancelModal
```

## Renk Paleti

| # | HEX       | Rol                        |
|---|-----------|----------------------------|
| 1 | `#E6DFED` | Background — primary lila  |
| 2 | `#DCD9DD` | Background — secondary     |
| 3 | `#CFCDD1` | Background — shadow/depth  |
| 4 | `#D8C8E9` | Particle — faintest        |
| 5 | `#BDA2DA` | Particle — light lavender  |
| 6 | `#A28DB7` | Particle — mid-light       |
| 7 | `#8163A3` | Particle — medium purple   |
| 8 | `#613A8A` | Particle — deep purple     |
| 9 | `#4A2070` | Dark purple base / buttons |

## Ekran Navigasyonu

```
login → login2 → memberInfo → home
                               ├── summary → summaryEdit
                               │          → mindmap
                               ├── records → recordDetail → summary
                               └── profile → personalInfo → editNickname
                                           → memberInfo2 → payment
                                           → accountBinding
                                           → langSelect
                                           → privacyPerm → privacy / agreement
                                           → cancelAccount
```
